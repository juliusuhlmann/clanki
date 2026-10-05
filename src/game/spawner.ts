// Generates rows of obstacles and letters. Every row leaves at least one lane
// completely empty, and rows are spaced so the player can always reach it.

export type ObstacleKind = 'pile' | 'cart' | 'ladder';

export interface ObstacleSpec {
  kind: ObstacleKind;
  /** Lane indices (0 = left, 1 = middle, 2 = right) the obstacle blocks. */
  lanes: number[];
  /** Depth along the track, in world units. */
  depth: number;
  /** Height in world units; only piles are low enough to jump over. */
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
export const LADDER_HEIGHT = 2.8;

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

/** Minimum distance between rows: enough time to cross two lanes at this speed. */
export function minGap(speed: number): number {
  return Math.max(7, speed * 0.8);
}

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

  next(speed: number): Row {
    const lanes = [0, 1, 2];
    const roll = this.rng();
    let obstacles: ObstacleSpec[] = [];
    let letters: LetterSpec[] = [];
    let extra = 0;

    if (roll < 0.25) {
      const lane = this.pick(lanes);
      obstacles = [this.pile(lane)];
      if (this.rng() < 0.6) letters = this.letterArc(lane);
    } else if (roll < 0.45) {
      obstacles = [this.cart(this.pick(lanes))];
    } else if (roll < 0.7) {
      const free = this.pick(lanes);
      obstacles = lanes
        .filter((l) => l !== free)
        .map((l) => (this.rng() < 0.5 ? this.pile(l) : this.cart(l)));
      if (this.rng() < 0.5) letters = this.letterLine(free, 3);
    } else if (roll < 0.85) {
      const start = this.pick([0, 1]);
      obstacles = [
        { kind: 'ladder', lanes: [start, start + 1], depth: 0.25, height: LADDER_HEIGHT, variant: this.variant() },
      ];
      const free = start === 0 ? 2 : 0;
      if (this.rng() < 0.6) letters = this.letterLine(free, 3);
    } else {
      letters = this.letterLine(this.pick(lanes), 5);
      extra = 5 * LETTER_SPACING;
    }

    const gapAfter = Math.max(minGap(speed) + this.rng() * speed * 0.6, extra + 3);
    return { obstacles, letters, gapAfter };
  }
}
