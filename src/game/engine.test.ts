import { describe, expect, it } from 'vitest';
import { BOOST_GAIN, BOOST_SECONDS, Game, type Action, type GameEvent } from './engine';
import { CART_HEIGHT, LADDER_TOP_Y, PILE_HEIGHT } from './spawner';

const DT = 1 / 60;

/** Runs the game for `seconds`, returning all events. */
function simulate(game: Game, seconds: number, actionsAt: Record<number, Action> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const a = actionsAt[i];
    events.push(...game.update(DT, a ? [a] : []));
  }
  return events;
}

/** A started game with no random rows, so tests control the obstacles. */
function emptyGame(seconds = 30): Game {
  const game = new Game(1);
  game.start(seconds);
  // Push the first random row far into the future.
  (game as unknown as { untilNextRow: number }).untilNextRow = 1e9;
  return game;
}

function addObstacle(game: Game, kind: 'pile' | 'cart', lane: number, z: number) {
  game.obstacles.push({
    kind,
    lanes: [lane],
    z,
    depth: 0.7,
    height: kind === 'pile' ? PILE_HEIGHT : CART_HEIGHT,
    variant: 1,
    hit: false,
  });
}

function addLadder(game: Game, side: -1 | 1, z: number) {
  game.obstacles.push({ kind: 'ladder', lanes: [1], side, z, depth: 0.5, height: LADDER_TOP_Y, variant: 1, hit: false });
}

describe('Game', () => {
  it('hits a pile in the player lane and loses a heart', () => {
    const game = emptyGame();
    addObstacle(game, 'pile', 1, 5);
    const events = simulate(game, 1);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(game.hearts).toBe(2);
    expect(game.invulnerableFor).toBeGreaterThan(0);
  });

  it('jumping clears a pile', () => {
    const game = emptyGame();
    addObstacle(game, 'pile', 1, 5);
    // At ~11 units/s the pile arrives after ~0.45s; jump a little before.
    const events = simulate(game, 1.2, { 15: 'jump' });
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(game.hearts).toBe(3);
  });

  it('jumping does not clear a cart, but changing lanes does', () => {
    const jumper = emptyGame();
    addObstacle(jumper, 'cart', 1, 5);
    simulate(jumper, 1.2, { 15: 'jump' });
    expect(jumper.hearts).toBe(2);

    const dodger = emptyGame();
    addObstacle(dodger, 'cart', 1, 5);
    simulate(dodger, 1.2, { 5: 'left' });
    expect(dodger.hearts).toBe(3);
  });

  it('cannot be hit twice while invulnerable', () => {
    const game = emptyGame();
    addObstacle(game, 'pile', 1, 3);
    addObstacle(game, 'pile', 1, 4.2);
    simulate(game, 1);
    expect(game.hearts).toBe(2);
  });

  it('ends when time runs out', () => {
    const game = emptyGame(2);
    const events = simulate(game, 2.5);
    expect(events).toContainEqual({ type: 'end', reason: 'time' });
    expect(game.mode).toBe('over');
  });

  it('ends when hearts reach zero', () => {
    const game = emptyGame();
    for (let i = 0; i < 3; i++) addObstacle(game, 'cart', 1, 4 + i * 20);
    const events = simulate(game, 8);
    expect(game.hearts).toBe(0);
    expect(events).toContainEqual({ type: 'end', reason: 'hearts' });
  });

  it('a letter gives a 20% speed boost that fades out', () => {
    const boosted = emptyGame();
    const plain = emptyGame();
    boosted.letters.push({ lane: 1, z: 2, y: 0.5, char: 'C', taken: false, phase: 0 });
    plain.letters.push({ lane: 0, z: 2, y: 0.5, char: 'C', taken: false, phase: 0 });
    simulate(boosted, 0.3);
    simulate(plain, 0.3);
    expect(boosted.boost).toBeGreaterThan(0.85);
    expect(boosted.speed / plain.speed).toBeGreaterThan(1.17);
    expect(boosted.speed / plain.speed).toBeLessThanOrEqual(1 + BOOST_GAIN + 1e-9);

    simulate(boosted, BOOST_SECONDS);
    simulate(plain, BOOST_SECONDS);
    expect(boosted.boost).toBe(0);
    expect(boosted.speed).toBeCloseTo(plain.speed);
    expect(boosted.score).toBeGreaterThan(plain.score);
  });

  it('a second letter refills the boost instead of stacking', () => {
    const game = emptyGame();
    game.letters.push({ lane: 1, z: 2, y: 0.5, char: 'C', taken: false, phase: 0 });
    game.letters.push({ lane: 1, z: 3, y: 0.5, char: 'L', taken: false, phase: 0 });
    const base = emptyGame();
    simulate(game, 0.5);
    simulate(base, 0.5);
    expect(game.speed / base.speed).toBeLessThanOrEqual(1 + BOOST_GAIN + 1e-9);
  });

  describe('leaning ladder (on the left wall)', () => {
    it('hits in the middle lane unless you jump', () => {
      const stay = emptyGame();
      addLadder(stay, -1, 5);
      simulate(stay, 1.2);
      expect(stay.hearts).toBe(2);

      const jump = emptyGame();
      addLadder(jump, -1, 5);
      simulate(jump, 1.2, { 15: 'jump' });
      expect(jump.hearts).toBe(3);
    });

    it('lets you glide under it in the wall-side lane, but not jump there', () => {
      const under = emptyGame();
      addLadder(under, -1, 5);
      simulate(under, 1.2, { 2: 'left' });
      expect(under.hearts).toBe(3);

      const jumpUnder = emptyGame();
      addLadder(jumpUnder, -1, 5);
      simulate(jumpUnder, 1.2, { 2: 'left', 15: 'jump' });
      expect(jumpUnder.hearts).toBe(2);
    });

    it('leaves the far lane open', () => {
      const game = emptyGame();
      addLadder(game, -1, 5);
      simulate(game, 1.2, { 2: 'right' });
      expect(game.hearts).toBe(3);
    });
  });

  it('spawns obstacles during a normal run', () => {
    const game = new Game(3);
    game.start(30);
    simulate(game, 5);
    expect(game.obstacles.length + game.letters.length).toBeGreaterThan(0);
  });
});
