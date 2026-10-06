import { describe, expect, it } from 'vitest';
import { BOOST_GAIN, BOOST_SECONDS, Game, LANE_X, START_HEARTS, type Action, type GameEvent } from './engine';
import { CART_HEIGHT, LADDER_TOP_Y, PILE_HEIGHT, TABLE_BASE, TABLE_DEPTH, TABLE_HEIGHT } from './spawner';

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
    expect(game.hearts).toBe(START_HEARTS - 1);
    expect(game.invulnerableFor).toBeGreaterThan(0);
  });

  it('jumping clears a pile', () => {
    const game = emptyGame();
    addObstacle(game, 'pile', 1, 5);
    // At ~11 units/s the pile arrives after ~0.45s; jump a little before.
    const events = simulate(game, 1.2, { 15: 'jump' });
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(game.hearts).toBe(START_HEARTS);
  });

  it('down drops back to the ground quickly mid-jump, and does nothing on the ground', () => {
    const game = emptyGame();
    simulate(game, 0.1, { 0: 'jump' });
    expect(game.jumpY).toBeGreaterThan(0.3);
    simulate(game, 0.15, { 0: 'down' });
    expect(game.onGround).toBe(true);
    simulate(game, 0.1, { 0: 'down' });
    expect(game.jumpY).toBe(0);
  });

  it('a rolling cart hits you in the lane it drifts into, not the one it left', () => {
    for (const [lane, hits] of [
      [0, true],
      [1, false],
    ] as const) {
      const game = emptyGame();
      game.lane = lane;
      game.x = LANE_X[lane];
      game.obstacles.push({ kind: 'rollingCart', lanes: [0], fromLane: 1, z: 32, depth: 0.8, height: CART_HEIGHT, variant: 1, hit: false });
      const events = simulate(game, 3.5);
      expect(events.some((e) => e.type === 'hit')).toBe(hits);
    }
  });

  it('you glide under a reading table, but jumping into it hits', () => {
    const table = (game: Game) =>
      game.obstacles.push({ kind: 'table', lanes: [0, 1], base: TABLE_BASE, z: 5, depth: TABLE_DEPTH, height: TABLE_HEIGHT, variant: 1, hit: false });
    const glide = emptyGame();
    table(glide);
    expect(simulate(glide, 1.2).some((e) => e.type === 'hit')).toBe(false);
    const jump = emptyGame();
    table(jump);
    expect(simulate(jump, 1.2, { 15: 'jump' }).some((e) => e.type === 'hit')).toBe(true);
  });

  it('falling books land as a pile you can hit or jump over', () => {
    const books = (game: Game) =>
      game.obstacles.push({ kind: 'books', lanes: [1], side: -1, z: 30, depth: 0.7, height: PILE_HEIGHT, variant: 1, hit: false });
    const stay = emptyGame();
    books(stay);
    expect(simulate(stay, 3.5).some((e) => e.type === 'hit')).toBe(true);
    const jump = emptyGame();
    books(jump);
    // ~30 units at 11+/s: arrives after ~2.6s.
    expect(simulate(jump, 3.5, { 145: 'jump' }).some((e) => e.type === 'hit')).toBe(false);
  });

  it('jumping does not clear a cart, but changing lanes does', () => {
    const jumper = emptyGame();
    addObstacle(jumper, 'cart', 1, 5);
    simulate(jumper, 1.2, { 15: 'jump' });
    expect(jumper.hearts).toBe(START_HEARTS - 1);

    const dodger = emptyGame();
    addObstacle(dodger, 'cart', 1, 5);
    simulate(dodger, 1.2, { 5: 'left' });
    expect(dodger.hearts).toBe(START_HEARTS);
  });

  it('cannot be hit twice while invulnerable', () => {
    const game = emptyGame();
    addObstacle(game, 'pile', 1, 3);
    addObstacle(game, 'pile', 1, 4.2);
    simulate(game, 1);
    expect(game.hearts).toBe(START_HEARTS - 1);
  });

  it('ends when time runs out', () => {
    const game = emptyGame(2);
    const events = simulate(game, 2.5);
    expect(events).toContainEqual({ type: 'end', reason: 'time' });
    expect(game.mode).toBe('over');
  });

  it('ends when hearts reach zero', () => {
    const game = emptyGame();
    for (let i = 0; i < START_HEARTS; i++) addObstacle(game, 'cart', 1, 4 + i * 20);
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
      expect(stay.hearts).toBe(START_HEARTS - 1);

      const jump = emptyGame();
      addLadder(jump, -1, 5);
      simulate(jump, 1.2, { 15: 'jump' });
      expect(jump.hearts).toBe(START_HEARTS);
    });

    it('lets you glide under it in the wall-side lane, but not jump there', () => {
      const under = emptyGame();
      addLadder(under, -1, 5);
      simulate(under, 1.2, { 2: 'left' });
      expect(under.hearts).toBe(START_HEARTS);

      const jumpUnder = emptyGame();
      addLadder(jumpUnder, -1, 5);
      simulate(jumpUnder, 1.2, { 2: 'left', 15: 'jump' });
      expect(jumpUnder.hearts).toBe(START_HEARTS - 1);
    });

    it('leaves the far lane open', () => {
      const game = emptyGame();
      addLadder(game, -1, 5);
      simulate(game, 1.2, { 2: 'right' });
      expect(game.hearts).toBe(START_HEARTS);
    });
  });

  it('spawns obstacles during a normal run', () => {
    const game = new Game(3);
    game.start(30);
    simulate(game, 5);
    expect(game.obstacles.length + game.letters.length).toBeGreaterThan(0);
  });
});
