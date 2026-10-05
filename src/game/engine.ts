// Runner game state and rules. Pure logic: no drawing, no DOM.
// World units: x = sideways (lanes), y = up, z = distance ahead of the player.

import { createRng, Spawner, type ObstacleKind } from './spawner';

export const LANE_X = [-1.1, 0, 1.1];
export const SPAWN_Z = 46;
export const DESPAWN_Z = -3;

/** Height of the spark's centre when gliding on the floor. */
export const HOVER_Y = 0.42;
const SPARK_HALF_HEIGHT = 0.25;
const SPARK_HALF_WIDTH = 0.28;
const SPARK_HALF_DEPTH = 0.25;

const JUMP_VELOCITY = 6.2;
const GRAVITY = 17;
const LANE_SWITCH_RATE = 16;

const START_SPEED = 11;
const MAX_EXTRA_SPEED = 9;
const ATTRACT_SPEED = 5;
const START_HEARTS = 3;
const INVULNERABLE_SECONDS = 1.2;
const FIRST_ROW_DELAY = 22;

export type Action = 'left' | 'right' | 'jump';
export type Mode = 'attract' | 'run' | 'over';
export type EndReason = 'time' | 'hearts';

export interface Obstacle {
  kind: ObstacleKind;
  lanes: number[];
  z: number;
  depth: number;
  height: number;
  variant: number;
  hit: boolean;
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
  lettersCollected = 0;
  invulnerableFor = 0;
  /** 0..1, how strongly to flash the screen after a hit. */
  flash = 0;

  lane = 1;
  x = LANE_X[1];
  /** Height above hover level (0 when gliding). */
  jumpY = 0;
  vy = 0;

  obstacles: Obstacle[] = [];
  letters: Letter[] = [];

  private spawner: Spawner;
  private untilNextRow = FIRST_ROW_DELAY;
  private runDistance = 0;
  private rng: () => number;

  constructor(seed = Date.now()) {
    this.rng = createRng(seed);
    this.spawner = new Spawner(this.rng);
  }

  get score(): number {
    return Math.floor(this.runDistance) + this.lettersCollected * 10;
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
    this.lettersCollected = 0;
    this.runDistance = 0;
    this.obstacles = [];
    this.letters = [];
    this.untilNextRow = FIRST_ROW_DELAY;
    this.endReason = null;
  }

  private act(action: Action): void {
    if (action === 'left') this.lane = Math.max(0, this.lane - 1);
    else if (action === 'right') this.lane = Math.min(2, this.lane + 1);
    else if (action === 'jump' && this.onGround) this.vy = JUMP_VELOCITY;
  }

  update(dt: number, actions: Action[] = []): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.mode === 'run') for (const a of actions) this.act(a);

    // Speed: ramps up during a run, coasts to a stop after it.
    if (this.mode === 'run') {
      this.elapsed += dt;
      this.speed = START_SPEED + MAX_EXTRA_SPEED * (1 - Math.exp(-this.elapsed / 25));
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

    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.invulnerableFor = Math.max(0, this.invulnerableFor - dt);

    // Move the world toward the player.
    for (const o of this.obstacles) o.z -= dz;
    for (const l of this.letters) l.z -= dz;
    this.obstacles = this.obstacles.filter((o) => o.z + o.depth > DESPAWN_Z);
    this.letters = this.letters.filter((l) => l.z > DESPAWN_Z && !l.taken);

    if (this.mode !== 'run') return events;

    this.runDistance += dz;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // Spawn new rows.
    this.untilNextRow -= dz;
    if (this.untilNextRow <= 0) {
      const row = this.spawner.next(this.speed);
      for (const o of row.obstacles) this.obstacles.push({ ...o, z: SPAWN_Z, hit: false });
      for (const l of row.letters)
        this.letters.push({ ...l, z: SPAWN_Z + l.dz, taken: false, phase: this.rng() * Math.PI * 2 });
      this.untilNextRow = row.gapAfter;
    }

    this.checkCollisions(events);

    if (this.hearts <= 0) this.end('hearts', events);
    else if (this.timeLeft <= 0) this.end('time', events);
    return events;
  }

  private checkCollisions(events: GameEvent[]): void {
    const bottom = HOVER_Y + this.jumpY - SPARK_HALF_HEIGHT;
    const centerY = HOVER_Y + this.jumpY;

    if (this.invulnerableFor <= 0) {
      for (const o of this.obstacles) {
        if (o.hit) continue;
        const x0 = LANE_X[Math.min(...o.lanes)] - 0.45;
        const x1 = LANE_X[Math.max(...o.lanes)] + 0.45;
        const overlapX = this.x + SPARK_HALF_WIDTH > x0 && this.x - SPARK_HALF_WIDTH < x1;
        const overlapZ = SPARK_HALF_DEPTH > o.z && -SPARK_HALF_DEPTH < o.z + o.depth;
        if (overlapX && overlapZ && bottom < o.height) {
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
        this.lettersCollected++;
        events.push({ type: 'collect', x: lx, y: l.y, z: l.z });
      }
    }
  }

  private end(reason: EndReason, events: GameEvent[]): void {
    this.mode = 'over';
    this.endReason = reason;
    events.push({ type: 'end', reason });
  }
}
