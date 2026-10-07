import { describe, expect, it } from 'vitest';
import { Game, LANE_X, START_HEARTS, type Action, type GameEvent } from './engine';
import { CART_HEIGHT, GLOBE_RADIUS, LADDER_TOP_Y, PILE_HEIGHT, TABLE_BASE, TABLE_DEPTH, TABLE_HEIGHT } from './spawner';

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

/**
 * Runs the game and jumps once the first obstacle is close enough that the top of the jump
 * (~0.36s after take-off) comes as it passes, whatever the current speed. Other actions as in simulate.
 */
function simulateJump(game: Game, seconds: number, actionsAt: Record<number, Action> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  let jumped = false;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const actions: Action[] = actionsAt[i] ? [actionsAt[i]] : [];
    const o = game.obstacles[0];
    if (!jumped && o && o.z <= game.speed * 0.3) {
      actions.push('jump');
      jumped = true;
    }
    events.push(...game.update(DT, actions));
  }
  return events;
}

/** A started game with no random rows, so tests control the obstacles. */
function emptyGame(seconds = 30): Game {
  const game = new Game(1);
  game.start(seconds);
  // Push the first random row far into the future.
  (game as unknown as { untilNextRow: number }).untilNextRow = 1e9;
  game.obstacles = [];
  game.letters = [];
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
    const events = simulateJump(game, 1.2);
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
    expect(simulateJump(jump, 1.2).some((e) => e.type === 'hit')).toBe(true);
  });

  it('falling books land as a pile you can hit or jump over', () => {
    const books = (game: Game) =>
      game.obstacles.push({ kind: 'books', lanes: [1], side: -1, z: 30, depth: 0.7, height: PILE_HEIGHT, variant: 1, hit: false });
    const stay = emptyGame();
    books(stay);
    expect(simulate(stay, 3.5).some((e) => e.type === 'hit')).toBe(true);
    const jump = emptyGame();
    books(jump);
    expect(simulateJump(jump, 3.5).some((e) => e.type === 'hit')).toBe(false);
  });

  it('jumping does not clear a cart, but changing lanes does', () => {
    const jumper = emptyGame();
    addObstacle(jumper, 'cart', 1, 5);
    simulateJump(jumper, 1.2);
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
    for (let i = 0; i < START_HEARTS; i++) addObstacle(game, 'cart', 1, 4 + i * 35);
    const events = simulate(game, 8);
    expect(game.hearts).toBe(0);
    expect(events).toContainEqual({ type: 'end', reason: 'hearts' });
  });

  it('collecting a letter adds to the score and does not change speed', () => {
    const game = emptyGame();
    const plain = emptyGame();
    game.letters.push({ lane: 1, z: 2, y: 0.5, char: 'C', taken: false, phase: 0 });
    plain.letters.push({ lane: 0, z: 2, y: 0.5, char: 'C', taken: false, phase: 0 });
    const events = simulate(game, 0.5);
    simulate(plain, 0.5);
    expect(events.some((e) => e.type === 'collect')).toBe(true);
    expect(game.score).toBe(1);
    expect(plain.score).toBe(0);
    expect(game.speed).toBeCloseTo(plain.speed);
  });

  it('counts each letter once', () => {
    const game = emptyGame();
    for (let i = 0; i < 3; i++) game.letters.push({ lane: 1, z: 2 + i * 2, y: 0.5, char: 'C', taken: false, phase: 0 });
    simulate(game, 1.5);
    expect(game.score).toBe(3);
  });

  describe('rolling globe', () => {
    function addGlobe(game: Game, z: number) {
      game.obstacles.push({ kind: 'globe', lanes: [1], z, depth: GLOBE_RADIUS * 2, height: GLOBE_RADIUS * 2, variant: 1, hit: false });
    }

    it('hits you if you stay in its lane', () => {
      const game = emptyGame();
      addGlobe(game, 5);
      simulate(game, 1);
      expect(game.hearts).toBe(START_HEARTS - 1);
    });

    it('can be jumped, timed like the rest of its row', () => {
      const game = emptyGame();
      addGlobe(game, 5);
      simulateJump(game, 1);
      expect(game.hearts).toBe(START_HEARTS);
    });

    it('can be dodged', () => {
      const game = emptyGame();
      addGlobe(game, 5);
      simulate(game, 1, { 2: 'left' });
      expect(game.hearts).toBe(START_HEARTS);
    });
  });

  it('a long frame cannot carry a thin obstacle straight past you', () => {
    const game = emptyGame();
    game.obstacles.push({ kind: 'pile', lanes: [1], z: 0.3, depth: 0.1, height: PILE_HEIGHT, variant: 1, hit: false });
    game.update(0.05);
    expect(game.hearts).toBe(START_HEARTS - 1);
  });

  describe('leaning ladder (on the left wall)', () => {
    it('hits in the middle lane unless you jump', () => {
      const stay = emptyGame();
      addLadder(stay, -1, 5);
      simulate(stay, 1.2);
      expect(stay.hearts).toBe(START_HEARTS - 1);

      const jump = emptyGame();
      addLadder(jump, -1, 5);
      simulateJump(jump, 1.2);
      expect(jump.hearts).toBe(START_HEARTS);
    });

    it('lets you glide under it in the wall-side lane, but not jump there', () => {
      const under = emptyGame();
      addLadder(under, -1, 5);
      simulate(under, 1.2, { 2: 'left' });
      expect(under.hearts).toBe(START_HEARTS);

      const jumpUnder = emptyGame();
      addLadder(jumpUnder, -1, 5);
      simulateJump(jumpUnder, 1.2, { 2: 'left' });
      expect(jumpUnder.hearts).toBe(START_HEARTS - 1);
    });

    it('leaves the far lane open', () => {
      const game = emptyGame();
      addLadder(game, -1, 5);
      simulate(game, 1.2, { 2: 'right' });
      expect(game.hearts).toBe(START_HEARTS);
    });
  });

  it('starts with the corridor already filled, the first row about two seconds away', () => {
    const game = new Game(3);
    game.start(30);
    const nearest = Math.min(...game.obstacles.map((o) => o.z), ...game.letters.map((l) => l.z));
    expect(nearest / game.speed).toBeGreaterThan(1.8);
    expect(nearest / game.speed).toBeLessThan(2.5);
    expect(game.obstacles.length).toBeGreaterThan(1);
  });

  it('spawns obstacles during a normal run', () => {
    const game = new Game(3);
    game.start(30);
    simulate(game, 5);
    expect(game.obstacles.length + game.letters.length).toBeGreaterThan(0);
  });
});
