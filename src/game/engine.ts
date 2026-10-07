// Runner game state and rules. Pure logic: no drawing, no DOM.
// World units: x = sideways (lanes), y = up, z = distance ahead of the player.

import {
  booksHeightAt,
  COLLAPSE_FALL_SECONDS,
  COLLAPSE_NARROW_SECONDS,
  createRng,
  globeZ,
  ladderHeightAt,
  ladderLine,
  rollingCartX,
  RUBBLE_FALL_END_Z,
  RUBBLE_HEIGHT,
  Spawner,
  type ObstacleKind,
} from './spawner';

export const LANE_X = [-1.1, 0, 1.1];
export const SPAWN_Z = 46;
export const DESPAWN_Z = -3;

/** Height of the spark's centre when gliding on the floor. */
export const HOVER_Y = 0.42;
const SPARK_HALF_HEIGHT = 0.25;
// Ducking: the spark drops a little and squashes, so its top is at ~0.46 instead of ~0.67.
export const DUCK_Y = 0.3;
export const DUCK_HALF_HEIGHT = 0.16;
const DUCK_SECONDS = 0.35;
/** How fast the spark ducks down and straightens up again (per second). */
const DUCK_RATE = 22;
const SPARK_HALF_WIDTH = 0.28;
const SPARK_HALF_DEPTH = 0.25;

const JUMP_VELOCITY = 5.5;
const GRAVITY = 17;
/** How high a jump lifts the spark (~0.89). */
export const JUMP_APEX = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
const DROP_VELOCITY = 7; // from the top of a jump: ~0.12s to land (gravity alone: ~0.32s)
const LANE_SWITCH_RATE = 16;

const START_SPEED = 17;
/** Top speed (m/s) the run ramps toward: on touch screens, and with a keyboard (20% faster). */
export const TOP_SPEED = 50;
export const DESKTOP_TOP_SPEED = 60;
const SPEED_RAMP_SECONDS = 18;
const ATTRACT_SPEED = 5;
export const START_HEARTS = 2;
const INVULNERABLE_SECONDS = 1.2;
/** Seconds from the start of a run until the first row reaches you. */
const FIRST_ROW_SECONDS = 2;
/** Seconds into a run before rolling carts, reading tables and falling books appear. */
const VARIETY_AFTER = 3;
/** Share of runs with a collapse, and the window (seconds into the run) when it starts. */
const COLLAPSE_CHANCE = 1 / 3;
const COLLAPSE_EARLIEST = 8;
const COLLAPSE_LATEST = 14;

// Letters are collectibles: the score is how many you collect in a run.
/** Half thickness of a ladder rail, for collisions. */
const LADDER_HALF_THICKNESS = 0.06;

export type Action = 'left' | 'right' | 'jump' | 'down';
export type Mode = 'attract' | 'run' | 'over';
export type EndReason = 'time' | 'hearts';

export interface Obstacle {
  kind: ObstacleKind;
  lanes: number[];
  side?: -1 | 1;
  fromLane?: number;
  base?: number;
  fallDepth?: number;
  z: number;
  depth: number;
  height: number;
  variant: number;
  hit: boolean;
}

/** Sideways centre of a one-lane obstacle right now (rolling carts move). */
export function obstacleX(o: Obstacle): number {
  return o.kind === 'rollingCart' && o.fromLane !== undefined ? rollingCartX(o.fromLane, o.lanes[0], o.z, LANE_X) : LANE_X[o.lanes[0]];
}

/** Where an obstacle's front actually is (a rolling globe runs ahead of its row's z). */
export function obstacleZ(o: Obstacle): number {
  return o.kind === 'globe' ? globeZ(o.z) : o.z;
}

/** Current height of an obstacle's top (falling books build up as they land). */
export function obstacleHeight(o: Obstacle): number {
  return o.kind === 'books' ? booksHeightAt(o.z) : o.height;
}

export interface Letter {
  lane: number;
  z: number;
  y: number;
  char: string;
  taken: boolean;
  phase: number;
}

export type GameEvent =
  | { type: 'hit'; heartsLeft: number }
  | { type: 'collect'; x: number; y: number; z: number }
  | { type: 'land' }
  | { type: 'rumble' }
  | { type: 'end'; reason: EndReason };

export class Game {
  mode: Mode = 'attract';
  endReason: EndReason | null = null;

  /** Seconds since the run started. */
  elapsed = 0;
  duration = 0;
  timeLeft = 0;
  speed = ATTRACT_SPEED;
  /** Total distance travelled; drives floor/shelf scrolling. */
  distance = 0;
  hearts = START_HEARTS;
  /** Letters collected this run; this is the score. */
  collected = 0;
  invulnerableFor = 0;
  /** 0..1, how strongly to flash the screen after a hit. */
  flash = 0;
  /** 0..1, how hard the corridor shakes while a collapse rumbles. */
  rumble = 0;
  /** Seconds into the run when the collapse starts, or null if there is none (left). */
  collapseAt: number | null = null;

  lane = 1;
  x = LANE_X[1];
  /** Height above hover level (0 when gliding). */
  jumpY = 0;
  vy = 0;
  /** 0..1, how far the spark is ducked (eases in and out). */
  duck = 0;
  /** Seconds of ducking left; a duck asked for mid-jump starts on landing. */
  private duckFor = 0;

  obstacles: Obstacle[] = [];
  letters: Letter[] = [];

  private spawner: Spawner;
  private untilNextRow = 0;
  private rng: () => number;

  constructor(
    seed = Date.now(),
    private topSpeed = TOP_SPEED,
  ) {
    this.rng = createRng(seed);
    this.spawner = new Spawner(this.rng);
  }

  /** The score: letters collected this run. */
  get score(): number {
    return this.collected;
  }

  get onGround(): boolean {
    return this.jumpY <= 0 && this.vy <= 0;
  }

  start(seconds: number): void {
    this.mode = 'run';
    this.duration = seconds;
    this.timeLeft = seconds;
    this.elapsed = 0;
    this.speed = START_SPEED;
    this.hearts = START_HEARTS;
    this.collected = 0;
    this.obstacles = [];
    this.letters = [];
    this.endReason = null;
    this.duck = 0;
    this.duckFor = 0;
    // Fill the corridor right away: the first row is about a second ahead, the rest follow
    // at normal spacing out to the spawn distance.
    let z = this.speed * FIRST_ROW_SECONDS;
    while (z < SPAWN_Z) z += this.spawnRow(z);
    this.untilNextRow = z - SPAWN_Z;
    this.rumble = 0;
    this.collapseAt = this.rng() < COLLAPSE_CHANCE ? COLLAPSE_EARLIEST + this.rng() * (COLLAPSE_LATEST - COLLAPSE_EARLIEST) : null;
  }

  /** The heap of a collapse, while it is in the corridor. */
  private get rubble(): Obstacle | undefined {
    return this.obstacles.find((o) => o.kind === 'rubble');
  }

  /** The lane buried beside you right now, if any: you can't move into it. */
  buriedLane(): number | undefined {
    const r = this.rubble;
    return r && r.z < 0.5 && r.z + r.depth > -0.5 ? r.lanes[0] : undefined;
  }

  /**
   * The rumble starts and books begin to pour off one wall: the heap goes where the next row
   * would have, and no rows come while the books are falling.
   */
  private startCollapse(events: GameEvent[]): void {
    this.collapseAt = null;
    const side: -1 | 1 = this.rng() < 0.5 ? -1 : 1;
    const fallDepth = this.speed * COLLAPSE_FALL_SECONDS;
    this.obstacles.push({
      kind: 'rubble',
      lanes: [side < 0 ? 0 : 2],
      side,
      z: SPAWN_Z + this.untilNextRow,
      depth: fallDepth + this.speed * COLLAPSE_NARROW_SECONDS,
      fallDepth,
      height: RUBBLE_HEIGHT,
      variant: Math.floor(this.rng() * 1e9),
      hit: false,
    });
    this.untilNextRow += fallDepth;
    events.push({ type: 'rumble' });
  }

  /** Adds the spawner's next row at distance z; returns the gap to the row after it. */
  private spawnRow(z: number): number {
    // Rows beside the heap keep out of its lane. Leave time to get back into it after the heap
    // ends, since that lane may be the only way through the next row.
    const r = this.rubble;
    const blocked = r && z + 3 > r.z && z - 3 - this.speed * 0.6 < r.z + r.depth ? r.lanes[0] : undefined;
    const row = this.spawner.next(this.speed, this.elapsed >= VARIETY_AFTER, blocked);
    for (const o of row.obstacles) this.obstacles.push({ ...o, z, hit: false });
    for (const l of row.letters) this.letters.push({ ...l, z: z + l.dz, taken: false, phase: this.rng() * Math.PI * 2 });
    return row.gapAfter;
  }

  /** Height of the spark's centre right now (gliding, ducked or jumping). */
  get bodyY(): number {
    return HOVER_Y - (HOVER_Y - DUCK_Y) * this.duck + this.jumpY;
  }

  private get halfHeight(): number {
    return SPARK_HALF_HEIGHT - (SPARK_HALF_HEIGHT - DUCK_HALF_HEIGHT) * this.duck;
  }

  private act(action: Action): void {
    if (action === 'left' || action === 'right') {
      const lane = action === 'left' ? Math.max(0, this.lane - 1) : Math.min(2, this.lane + 1);
      if (lane !== this.buriedLane()) this.lane = lane;
    } else if (action === 'jump' && this.onGround) {
      this.vy = JUMP_VELOCITY;
      this.duckFor = 0;
    } else if (action === 'down') {
      // Duck; mid-jump, drop straight back down first (gravity alone takes ~0.7s for a full jump).
      if (!this.onGround) this.vy = Math.min(this.vy, -DROP_VELOCITY);
      this.duckFor = DUCK_SECONDS;
    }
  }

  update(dt: number, actions: Action[] = []): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.mode === 'run') for (const a of actions) this.act(a);

    // Speed: ramps up during a run, coasts to a stop after it.
    if (this.mode === 'run') {
      this.elapsed += dt;
      this.speed = START_SPEED + (this.topSpeed - START_SPEED) * (1 - Math.exp(-this.elapsed / SPEED_RAMP_SECONDS));
    } else if (this.mode === 'over') {
      this.speed = Math.max(0, this.speed - this.speed * 3 * dt);
    } else {
      this.speed = ATTRACT_SPEED;
    }

    const dz = this.speed * dt;
    this.distance += dz;

    // Player movement.
    const targetX = LANE_X[this.lane];
    this.x += (targetX - this.x) * Math.min(1, LANE_SWITCH_RATE * dt);
    if (this.jumpY > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.vy = 0;
        events.push({ type: 'land' });
      }
    }
    const ducking = this.duckFor > 0 && this.onGround;
    if (ducking) this.duckFor = Math.max(0, this.duckFor - dt);
    this.duck += ((ducking ? 1 : 0) - this.duck) * Math.min(1, DUCK_RATE * dt);

    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.invulnerableFor = Math.max(0, this.invulnerableFor - dt);

    // Move the world toward the player.
    for (const o of this.obstacles) o.z -= dz;
    for (const l of this.letters) l.z -= dz;
    this.obstacles = this.obstacles.filter((o) => obstacleZ(o) + o.depth > DESPAWN_Z);
    this.letters = this.letters.filter((l) => l.z > DESPAWN_Z && !l.taken);

    // The rumble lasts while books are still coming down.
    const heap = this.rubble;
    const falling = heap !== undefined && heap.z + (heap.fallDepth ?? 0) > RUBBLE_FALL_END_Z - 4;
    this.rumble += ((falling ? 1 : 0) - this.rumble) * Math.min(1, dt * (falling ? 4 : 1.5));

    if (this.mode !== 'run') return events;

    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // Spawn new rows.
    this.untilNextRow -= dz;
    if (this.collapseAt !== null && this.elapsed >= this.collapseAt) this.startCollapse(events);
    if (this.untilNextRow <= 0) this.untilNextRow += this.spawnRow(SPAWN_Z + this.untilNextRow);

    this.checkCollisions(events, dz);
    // Ran into the front of the heap: thrown back into the middle lane.
    if (this.lane === this.buriedLane()) this.lane = 1;

    if (this.hearts <= 0) this.end('hearts', events);
    else if (this.timeLeft <= 0) this.end('time', events);
    return events;
  }

  /** `dz` is how far the world moved this frame: an obstacle hits if it swept through you. */
  private checkCollisions(events: GameEvent[], dz: number): void {
    const centerY = this.bodyY;
    const bottom = centerY - this.halfHeight;
    const top = centerY + this.halfHeight;

    if (this.invulnerableFor <= 0) {
      for (const o of this.obstacles) {
        if (o.hit) continue;
        // Check the whole stretch the obstacle covered this frame, so a long frame at top
        // speed can't carry it straight past you.
        const z = obstacleZ(o);
        const before = o.kind === 'globe' ? globeZ(o.z + dz) : o.z + dz;
        const overlapZ = SPARK_HALF_DEPTH > z && -SPARK_HALF_DEPTH < before + o.depth;
        if (!overlapZ) continue;
        let hit: boolean;
        if (o.kind === 'ladder' && o.side) {
          hit = this.touchesLadder(o.side, bottom, top);
        } else {
          const moving = o.kind === 'rollingCart';
          const x0 = (moving ? obstacleX(o) : LANE_X[Math.min(...o.lanes)]) - 0.45;
          const x1 = (moving ? obstacleX(o) : LANE_X[Math.max(...o.lanes)]) + 0.45;
          const overlapX = this.x + SPARK_HALF_WIDTH > x0 && this.x - SPARK_HALF_WIDTH < x1;
          // Tables float above the floor: duck under them, but don't jump into them.
          hit = overlapX && (o.kind === 'rubble' || (bottom < obstacleHeight(o) && top > (o.base ?? 0)));
        }
        if (hit) {
          o.hit = true;
          this.hearts--;
          this.invulnerableFor = INVULNERABLE_SECONDS;
          this.flash = 1;
          events.push({ type: 'hit', heartsLeft: this.hearts });
          break;
        }
      }
    }

    for (const l of this.letters) {
      if (l.taken) continue;
      const lx = LANE_X[l.lane];
      if (Math.abs(lx - this.x) < 0.5 && Math.abs(l.z) < 0.6 && Math.abs(l.y - centerY) < 0.6) {
        l.taken = true;
        this.collected++;
        events.push({ type: 'collect', x: lx, y: l.y, z: l.z });
      }
    }
  }

  /** Whether the spark's body overlaps the slanted ladder at its current x. */
  private touchesLadder(side: -1 | 1, bottom: number, top: number): boolean {
    const { footX, topX } = ladderLine(side);
    const lo = Math.max(this.x - SPARK_HALF_WIDTH, Math.min(footX, topX));
    const hi = Math.min(this.x + SPARK_HALF_WIDTH, Math.max(footX, topX));
    if (lo > hi) return false;
    const a = ladderHeightAt(side, lo) ?? 0;
    const b = ladderHeightAt(side, hi) ?? 0;
    const ladderBottom = Math.min(a, b) - LADDER_HALF_THICKNESS;
    const ladderTop = Math.max(a, b) + LADDER_HALF_THICKNESS;
    return bottom < ladderTop && top > ladderBottom;
  }

  private end(reason: EndReason, events: GameEvent[]): void {
    this.mode = 'over';
    this.endReason = reason;
    events.push({ type: 'end', reason });
  }
}
