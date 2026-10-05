import { describe, expect, it } from 'vitest';
import { createRng, ladderHeightAt, minGap, PILE_HEIGHT, Spawner } from './spawner';
import { HOVER_Y } from './engine';

describe('Spawner', () => {
  it('always leaves at least one lane completely empty', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const spawner = new Spawner(createRng(seed));
      for (let i = 0; i < 2000; i++) {
        const row = spawner.next(11 + (i % 10));
        const blocked = new Set(row.obstacles.flatMap((o) => o.lanes));
        expect(blocked.size).toBeLessThan(3);
      }
    }
  });

  it('spaces rows far enough apart to cross two lanes at the current speed', () => {
    const spawner = new Spawner(createRng(7));
    for (const speed of [11, 14, 17, 20]) {
      for (let i = 0; i < 500; i++) {
        expect(spawner.next(speed).gapAfter).toBeGreaterThanOrEqual(minGap(speed));
      }
    }
  });

  it('only piles are low enough to jump over', () => {
    const spawner = new Spawner(createRng(9));
    const kinds = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      for (const o of spawner.next(12).obstacles) kinds.set(o.kind, o.height);
    }
    // Bottom of the spark at the top of a jump (apex ≈ 1.13, half height 0.25).
    const apexBottom = HOVER_Y + 1.13 - 0.25;
    expect(kinds.get('pile')).toBe(PILE_HEIGHT);
    expect(PILE_HEIGHT).toBeLessThan(apexBottom);
    expect(kinds.get('cart')).toBeGreaterThan(apexBottom);
  });

  it('leans ladders on a wall and only puts carts in the far lane beside them', () => {
    const spawner = new Spawner(createRng(11));
    let ladders = 0;
    for (let i = 0; i < 2000; i++) {
      const row = spawner.next(12);
      const ladder = row.obstacles.find((o) => o.kind === 'ladder');
      if (!ladder) continue;
      ladders++;
      expect([-1, 1]).toContain(ladder.side);
      const farLane = ladder.side === -1 ? 2 : 0;
      for (const o of row.obstacles.filter((o) => o !== ladder)) {
        expect(o.kind).toBe('cart');
        expect(o.lanes).toEqual([farLane]);
      }
    }
    expect(ladders).toBeGreaterThan(100);
  });

  it('ladder heights: low over the middle lane, high near the wall, none in the far lane', () => {
    // Leaning on the left wall.
    expect(ladderHeightAt(-1, 0)!).toBeLessThan(0.6);
    expect(ladderHeightAt(-1, -1.1)!).toBeGreaterThan(1.5);
    expect(ladderHeightAt(-1, 1.1)).toBeNull();
    // Mirrored on the right wall.
    expect(ladderHeightAt(1, 0)).toBeCloseTo(ladderHeightAt(-1, 0)!);
    expect(ladderHeightAt(1, -1.1)).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const a = new Spawner(createRng(5));
    const b = new Spawner(createRng(5));
    for (let i = 0; i < 50; i++) expect(a.next(12)).toEqual(b.next(12));
  });
});
