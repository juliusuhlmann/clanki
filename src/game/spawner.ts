// Generates rows of obstacles and letters. Every row leaves at least one lane
// completely empty, and rows are spaced so the player can always reach it.

export type ObstacleKind = 'pile' | 'cart' | 'ladder' | 'rollingCart' | 'table' | 'books';

export interface ObstacleSpec {
  kind: ObstacleKind;
  /**
   * Lane indices (0 = left, 1 = middle, 2 = right) the obstacle covers. A rolling cart
   * covers the lane it ends up in; a reading table covers every lane it spans.
   */
  lanes: number[];
  /** Ladders: the wall it leans on. Falling books: the wall they fall from. */
  side?: -1 | 1;
  /** Rolling carts: the lane the cart starts in before drifting into `lanes[0]`. */
  fromLane?: number;
  /** Height of the obstacle's underside (0 if it stands on the floor; tables float above you). */
  base?: number;
  /** Depth along the track, in world units. */
  depth: number;
  /** Height of the top in world units; only piles (and fallen books) are low enough to jump over. */
  height: number;
  /** Seed for the obstacle's look (book colours, sizes). */
  variant: number;
}

export interface LetterSpec {
  lane: number;
  /** Offset along the track relative to the row. */
  dz: number;
  /** Height above the floor (centre of the letter). */
  y: number;
  char: string;
}

export interface Row {
  obstacles: ObstacleSpec[];
  letters: LetterSpec[];
  /** Distance to travel before the next row is spawned. */
  gapAfter: number;
}

export const PILE_HEIGHT = 0.5;
export const CART_HEIGHT = 1.45;

// A ladder leans across the corridor: its foot stands on the floor just past the
// middle lane, its top rests on the bookshelf. Low over the middle lane (jump it),
// high over the wall-side lane (glide under it), absent over the far lane.
export const WALL_X = 2.35;
export const LADDER_TOP_Y = 3.6;
export const LADDER_FOOT_X = 0.3;
/** Distance between the two rails (along the track), wide enough to see the rungs. */
export const LADDER_DEPTH = 0.9;

/** The ladder's line in the x/y plane: foot on the floor, top against the wall. */
export function ladderLine(side: -1 | 1): { footX: number; topX: number; topY: number } {
  return { footX: -side * LADDER_FOOT_X, topX: side * WALL_X, topY: LADDER_TOP_Y };
}

/** Height of the ladder at sideways position x, or null where there is no ladder. */
export function ladderHeightAt(side: -1 | 1, x: number): number | null {
  const { footX, topX, topY } = ladderLine(side);
  const t = (x - footX) / (topX - footX);
  return t < 0 || t > 1 ? null : t * topY;
}

// Rolling cart: drifts from one lane into the next while still far away, then rolls
// straight, so by the time it's close it's simply a cart in a lane.
export const ROLL_START_Z = 30;
export const ROLL_END_Z = 15;

/** A rolling cart's sideways position at distance z. */
export function rollingCartX(fromLane: number, toLane: number, z: number, laneX: readonly number[]): number {
  const t = Math.min(1, Math.max(0, (ROLL_START_Z - z) / (ROLL_START_Z - ROLL_END_Z)));
  const e = t * t * (3 - 2 * t);
  return laneX[fromLane] + (laneX[toLane] - laneX[fromLane]) * e;
}

// Reading table: you glide underneath (the spark's top is at ~0.67), but any jump hits it,
// and it's too tall (lamp and books on top) to jump over.
export const TABLE_BASE = 0.8;
export const TABLE_HEIGHT = 1.5;
export const TABLE_DEPTH = 1.5;

// Falling books: three books tumble off a high shelf one after another and stack into
// a pile in a lane. The last lands at z ≈ 12, well before it reaches you.
export const BOOK_THICKNESS = [0.15, 0.16, 0.19];
export const BOOK_FALL_START_Z = 27;
export const BOOK_FALL_LENGTH = 10;
export const BOOK_STAGGER = 2;

/** 0..1 fall progress of book i (0 = still on the shelf, 1 = landed) at distance z. */
export function bookFall(i: number, z: number): number {
  const start = BOOK_FALL_START_Z - i * BOOK_STAGGER;
  return Math.min(1, Math.max(0, (start - z) / BOOK_FALL_LENGTH));
}

/** Height of the landed part of a falling-books pile at distance z. */
export function booksHeightAt(z: number): number {
  let h = 0;
  BOOK_THICKNESS.forEach((t, i) => {
    if (bookFall(i, z) >= 1) h += t;
  });
  return h;
}

/** Lanes a player gliding along the floor (no jump) can't get through, once the row is close. */
export function glideBlocked(o: ObstacleSpec): number[] {
  return o.kind === 'table' ? [] : o.lanes;
}

const WORD = 'CLANKI';
const LETTER_SPACING = 2.2;

/** Small, fast, seedable RNG (mulberry32). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minimum distance between rows: about 0.6s, still enough to cross two lanes at this speed. */
export function minGap(speed: number): number {
  return Math.max(6, speed * 0.6);
}

type Pattern = 'pile' | 'cart' | 'pair' | 'ladder' | 'letters' | 'rollingCart' | 'table' | 'books';

export class Spawner {
  private letterIndex = 0;

  constructor(private rng: () => number) {}

  private pick<T>(items: T[]): T {
    return items[Math.floor(this.rng() * items.length)];
  }

  private variant(): number {
    return Math.floor(this.rng() * 1e9);
  }

  private nextChar(): string {
    return WORD[this.letterIndex++ % WORD.length];
  }

  private pile(lane: number): ObstacleSpec {
    return { kind: 'pile', lanes: [lane], depth: 0.7, height: PILE_HEIGHT, variant: this.variant() };
  }

  private cart(lane: number): ObstacleSpec {
    return { kind: 'cart', lanes: [lane], depth: 0.8, height: CART_HEIGHT, variant: this.variant() };
  }

  private letterLine(lane: number, count: number): LetterSpec[] {
    return Array.from({ length: count }, (_, i) => ({ lane, dz: i * LETTER_SPACING, y: 0.5, char: this.nextChar() }));
  }

  /** Letters arcing over a pile, collected by jumping. */
  private letterArc(lane: number): LetterSpec[] {
    return [
      { lane, dz: -1.6, y: 0.9, char: this.nextChar() },
      { lane, dz: 0.35, y: 1.45, char: this.nextChar() },
      { lane, dz: 2.3, y: 0.9, char: this.nextChar() },
    ];
  }

  /**
   * The next row. `variety` adds the rolling cart, reading table and falling books; the
   * game turns it on a few seconds into a run so the start stays simple.
   */
  next(speed: number, variety = true): Row {
    const lanes = [0, 1, 2];
    const patterns: [number, Pattern][] = [
      [0.2, 'pile'],
      [0.14, 'cart'],
      [0.2, 'pair'],
      [0.15, 'ladder'],
      [0.07, 'letters'],
    ];
    if (variety) patterns.push([0.12, 'rollingCart'], [0.12, 'table'], [0.1, 'books']);
    const total = patterns.reduce((s, [w]) => s + w, 0);
    let roll = this.rng() * total;
    let pattern: Pattern = 'pile';
    for (const [w, p] of patterns) {
      pattern = p;
      roll -= w;
      if (roll < 0) break;
    }

    let obstacles: ObstacleSpec[] = [];
    let letters: LetterSpec[] = [];
    let extra = 0;

    if (pattern === 'pile') {
      const lane = this.pick(lanes);
      obstacles = [this.pile(lane)];
      if (this.rng() < 0.6) letters = this.letterArc(lane);
    } else if (pattern === 'cart') {
      obstacles = [this.cart(this.pick(lanes))];
    } else if (pattern === 'pair') {
      const free = this.pick(lanes);
      obstacles = lanes
        .filter((l) => l !== free)
        .map((l) => (this.rng() < 0.5 ? this.pile(l) : this.cart(l)));
      if (this.rng() < 0.5) letters = this.letterLine(free, 3);
    } else if (pattern === 'ladder') {
      const side: -1 | 1 = this.rng() < 0.5 ? -1 : 1;
      const underLane = side < 0 ? 0 : 2;
      const farLane = side < 0 ? 2 : 0;
      obstacles = [
        { kind: 'ladder', lanes: [1], side, depth: LADDER_DEPTH, height: LADDER_TOP_Y, variant: this.variant() },
      ];
      // Sometimes a book cart stands in the far lane: go under the ladder or jump it.
      if (this.rng() < 0.5) obstacles.push(this.cart(farLane));
      if (this.rng() < 0.5) letters = this.letterLine(underLane, 3);
    } else if (pattern === 'rollingCart') {
      const from = this.pick(lanes);
      const to = from === 1 ? this.pick([0, 2]) : 1;
      obstacles = [{ ...this.cart(to), kind: 'rollingCart', fromLane: from }];
      // Sometimes a pile waits in the third lane, so the lane the cart leaves is the way through.
      const third = lanes.find((l) => l !== from && l !== to)!;
      if (this.rng() < 0.5) obstacles.push(this.pile(third));
    } else if (pattern === 'table') {
      const full = this.rng() < 0.45;
      const start = full ? 0 : this.pick([0, 1]);
      const span = full ? lanes : [start, start + 1];
      obstacles = [
        { kind: 'table', lanes: span, base: TABLE_BASE, depth: TABLE_DEPTH, height: TABLE_HEIGHT, variant: this.variant() },
      ];
      // Beside a two-lane table there's sometimes a cart, so going under is the only way.
      const beside = lanes.find((l) => !span.includes(l));
      if (beside !== undefined && this.rng() < 0.35) obstacles.push(this.cart(beside));
      // Letters under the table reward staying low.
      if (this.rng() < 0.6) letters = this.letterLine(this.pick(span), 3).map((l) => ({ ...l, dz: l.dz - 1.5 }));
    } else if (pattern === 'books') {
      const lane = this.pick(lanes);
      const side: -1 | 1 = lane === 0 ? -1 : lane === 2 ? 1 : this.rng() < 0.5 ? -1 : 1;
      obstacles = [{ ...this.pile(lane), kind: 'books', side }];
      if (this.rng() < 0.4) obstacles.push(this.cart(this.pick(lanes.filter((l) => l !== lane))));
    } else {
      letters = this.letterLine(this.pick(lanes), 5);
      extra = 5 * LETTER_SPACING;
    }

    const gapAfter = Math.max(minGap(speed) + this.rng() * speed * 0.4, extra + 3);
    return { obstacles, letters, gapAfter };
  }
}
