// How answering cards turns into runner time. Only ratings feed in here;
// nothing from the game ever flows back into scheduling.

export const BASE_SECONDS = 15;
export const MAX_SECONDS = 40;
export const MIN_GAP = 6;
export const MAX_GAP = 10;

/** Seconds earned per rating: Again 0, Hard 2, Good 4, Easy 4. */
const SECONDS_PER_RATING: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 4 };

export function earnedSeconds(ratings: number[]): number {
  return ratings.reduce((sum, r) => sum + (SECONDS_PER_RATING[r] ?? 0), 0);
}

/** Length of a run: base time plus earned time, capped. */
export function runSeconds(ratings: number[]): number {
  return Math.min(MAX_SECONDS, BASE_SECONDS + earnedSeconds(ratings));
}

/** Number of cards until the next run, between MIN_GAP and MAX_GAP inclusive. */
export function nextGap(rng: () => number = Math.random): number {
  return MIN_GAP + Math.floor(rng() * (MAX_GAP - MIN_GAP + 1));
}
