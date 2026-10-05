import { describe, expect, it } from 'vitest';
import { earnedSeconds, MAX_GAP, MAX_SECONDS, MIN_GAP, nextGap, runSeconds } from './reward';
import { createRng } from './spawner';

describe('reward', () => {
  it('earns seconds per rating: Again 0, Hard 2, Good 4, Easy 4', () => {
    expect(earnedSeconds([1])).toBe(0);
    expect(earnedSeconds([2])).toBe(2);
    expect(earnedSeconds([3, 4])).toBe(8);
    expect(earnedSeconds([])).toBe(0);
  });

  it('adds the base time and caps the run length', () => {
    expect(runSeconds([])).toBe(15);
    expect(runSeconds([3, 3, 2])).toBe(25);
    expect(runSeconds(Array(20).fill(4))).toBe(MAX_SECONDS);
  });

  it('picks gaps between 6 and 10 cards, covering the whole range', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const g = nextGap(rng);
      expect(g).toBeGreaterThanOrEqual(MIN_GAP);
      expect(g).toBeLessThanOrEqual(MAX_GAP);
      seen.add(g);
    }
    expect(seen.size).toBe(MAX_GAP - MIN_GAP + 1);
  });
});
