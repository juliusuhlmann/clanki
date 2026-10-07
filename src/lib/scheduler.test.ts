import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClankiDb, libraryRunRank, saveLibraryRun, setNewPerDay, topLibraryRuns } from './db';
import {
  buildLibraryQueue,
  buildQueue,
  formatInterval,
  LIBRARY_LEARN_AHEAD_MS,
  libraryRunSize,
  rate,
  Rating,
  retrievability,
  Session,
  splitBlocks,
  startOfStudyDay,
  State,
  totalLeftToday,
  undoRate,
} from './scheduler';
import { createCard, createDeck } from './store';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let db: ClankiDb;

beforeEach(() => {
  db = new ClankiDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('rate', () => {
  it('Good on a new card schedules a short learning step and logs the review', async () => {
    const deck = await createDeck('Test', db);
    const card = await createCard(deck.id, 'front', 'back', db);
    const now = Date.now();

    const updated = await rate(card, Rating.Good, 3000, now, db);

    expect(updated.fsrs.state).not.toBe(State.New);
    expect(updated.due).toBeGreaterThan(now);
    expect(updated.due).toBeLessThan(now + DAY);
    expect(await db.cards.get(card.id)).toEqual(updated);

    const reviews = await db.reviews.toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ cardId: card.id, rating: Rating.Good, stateBefore: State.New });
  });

  it('Easy schedules further out than Again', async () => {
    const deck = await createDeck('Test', db);
    const a = await createCard(deck.id, 'a', 'a', db);
    const b = await createCard(deck.id, 'b', 'b', db);
    const now = Date.now();

    const again = await rate(a, Rating.Again, 1000, now, db);
    const easy = await rate(b, Rating.Easy, 1000, now, db);

    expect(easy.due).toBeGreaterThan(again.due);
    expect(easy.due - now).toBeGreaterThanOrEqual(DAY);
  });
});

describe('undoRate', () => {
  it('restores the card, removes the review and leaves a tombstone for sync', async () => {
    const deck = await createDeck('Test', db);
    const card = await createCard(deck.id, 'front', 'back', db);
    const now = Date.now();
    await rate(card, Rating.Again, 1000, now, db);

    const restored = await undoRate(card, now, now + 5000, db);

    expect(restored).toEqual({ ...card, updatedAt: now + 5000 });
    expect(await db.cards.get(card.id)).toEqual(restored);
    expect(await db.reviews.count()).toBe(0);
    expect(await db.deletions.toArray()).toEqual([{ kind: 'review', id: `${card.id}|${now}`, at: now + 5000 }]);
  });

  it('puts the session back as it was before the answer', async () => {
    const deck = await createDeck('Test', db);
    const a = await createCard(deck.id, 'a', 'a', db);
    const b = await createCard(deck.id, 'b', 'b', db);
    const now = Date.now();
    const session = new Session([a, b]);

    session.next(now);
    const before = session.snapshot();
    session.answered(await rate(a, Rating.Again, 1000, now, db), now);
    expect(session.remaining).toBe(2);
    session.restore(before);
    expect(session.remaining).toBe(1);
    expect(session.next(now)?.id).toBe(b.id);
  });
});

describe('buildQueue', () => {
  it('puts due cards first and respects the daily new-card limit', async () => {
    await setNewPerDay(2, db);
    const deck = await createDeck('Test', db);
    const cards = [];
    for (let i = 0; i < 5; i++) cards.push(await createCard(deck.id, `q${i}`, `a${i}`, db));

    // Make card 4 a review card that is overdue.
    const now = Date.now();
    await db.cards.update(cards[4].id, { due: now - DAY, fsrs: { ...cards[4].fsrs, state: State.Review } });

    const queue = await buildQueue(deck.id, now, db);
    expect(queue.map((c) => c.front)).toEqual(['q4', 'q0', 'q1']);
  });

  it('counts new cards already studied today against the limit', async () => {
    await setNewPerDay(2, db);
    const deck = await createDeck('Test', db);
    const first = await createCard(deck.id, 'q0', 'a0', db);
    await createCard(deck.id, 'q1', 'a1', db);
    await createCard(deck.id, 'q2', 'a2', db);
    const now = Date.now();

    await rate(first, Rating.Easy, 1000, now, db);

    const queue = await buildQueue(deck.id, now, db);
    expect(queue.map((c) => c.front)).toEqual(['q1']);
  });
});

describe('Session', () => {
  it('brings cards due soon back after the rest of the queue', async () => {
    const deck = await createDeck('Test', db);
    const a = await createCard(deck.id, 'a', 'a', db);
    const b = await createCard(deck.id, 'b', 'b', db);
    const now = Date.now();
    const session = new Session([a, b]);

    expect(session.next(now)?.id).toBe(a.id);
    session.answered(await rate(a, Rating.Again, 1000, now, db), now);
    expect(session.next(now)?.id).toBe(b.id);
    session.answered(await rate(b, Rating.Easy, 1000, now, db), now);
    // Only "a" (answered Again) remains, shown early since nothing else is left.
    expect(session.next(now)?.id).toBe(a.id);
    expect(session.next(now)).toBeNull();
  });

  it('with the library-run window, only brings back cards answered Again', async () => {
    const deck = await createDeck('Test', db);
    const a = await createCard(deck.id, 'a', 'a', db);
    const b = await createCard(deck.id, 'b', 'b', db);
    const now = Date.now();
    const session = new Session([a, b], LIBRARY_LEARN_AHEAD_MS);

    session.next(now);
    session.answered(await rate(a, Rating.Again, 1000, now, db), now);
    session.next(now);
    // Good on a new card is a 10 minute step: it waits for a later session.
    session.answered(await rate(b, Rating.Good, 1000, now, db), now);
    expect(session.next(now)?.id).toBe(a.id);
    expect(session.next(now)).toBeNull();
  });
});

describe('helpers', () => {
  it('formats intervals', () => {
    expect(formatInterval(MINUTE)).toBe('1m');
    expect(formatInterval(10 * MINUTE)).toBe('10m');
    expect(formatInterval(3 * 60 * MINUTE)).toBe('3h');
    expect(formatInterval(3 * DAY)).toBe('3d');
    expect(formatInterval(60 * DAY)).toBe('2mo');
    expect(formatInterval(365 * DAY)).toBe('1y');
  });

  it('starts the study day at 4:00', () => {
    const lateNight = new Date(2026, 9, 5, 2, 30).getTime();
    const morning = new Date(2026, 9, 5, 9, 0).getTime();
    expect(startOfStudyDay(lateNight)).toBe(new Date(2026, 9, 4, 4, 0).getTime());
    expect(startOfStudyDay(morning)).toBe(new Date(2026, 9, 5, 4, 0).getTime());
  });
});

describe('retrievability', () => {
  it('is null for new cards and decays over time after a review', async () => {
    const deck = await createDeck('Test', db);
    const card = await createCard(deck.id, 'front', 'back', db);
    const now = Date.now();
    expect(retrievability(card, now)).toBeNull();

    const reviewed = await rate(card, Rating.Good, 1000, now, db);
    const soon = retrievability(reviewed, now + MINUTE)!;
    const later = retrievability(reviewed, now + 30 * DAY)!;
    expect(soon).toBeGreaterThan(0.9);
    expect(later).toBeLessThan(soon);
    expect(later).toBeGreaterThan(0);
  });
});

describe('library runs', () => {
  it('takes everything below 18, half from 18 to 23, and 12 from 24 on', () => {
    expect([0, 5, 17].map(libraryRunSize)).toEqual([0, 5, 17]);
    expect([18, 19, 23].map(libraryRunSize)).toEqual([9, 10, 12]);
    expect([24, 40].map(libraryRunSize)).toEqual([12, 12]);
  });

  it('splits the cards into three blocks as evenly as possible', () => {
    expect(splitBlocks(12)).toEqual([4, 4, 4]);
    expect(splitBlocks(17)).toEqual([6, 6, 5]);
    expect(splitBlocks(2)).toEqual([1, 1, 0]);
  });

  it('draws cards from all decks within the new-card limit and caps at 12', async () => {
    await setNewPerDay(10, db);
    const a = await createDeck('A', db);
    const b = await createDeck('B', db);
    for (let i = 0; i < 15; i++) {
      await createCard(a.id, `a${i}`, 'x', db);
      await createCard(b.id, `b${i}`, 'x', db);
    }
    const now = Date.now();
    expect(await totalLeftToday(now, db)).toBe(20);

    const queue = await buildLibraryQueue(now, db);
    expect(queue).toHaveLength(10);
    expect(new Set(queue.map((c) => c.id)).size).toBe(10);

    await setNewPerDay(15, db);
    const full = await buildLibraryQueue(now, db);
    expect(full).toHaveLength(12);
    expect(new Set(full.map((c) => c.deckId))).toEqual(new Set([a.id, b.id]));
  });

  it('puts due cards before new ones', async () => {
    const deck = await createDeck('Test', db);
    const now = Date.now();
    for (let i = 0; i < 30; i++) await createCard(deck.id, `n${i}`, 'x', db);
    // Created last, so it would be cut if it were sorted in with the new cards.
    const old = await createCard(deck.id, 'old', 'x', db);
    await db.cards.update(old.id, { createdAt: now + 1 });
    await rate({ ...old, createdAt: now + 1 }, Rating.Good, 1000, now - 30 * DAY, db);

    const queue = await buildLibraryQueue(now, db);
    expect(queue.some((c) => c.id === old.id)).toBe(true);
  });

  it('ranks runs by letters, ties going to the earlier run', async () => {
    const first = await saveLibraryRun({ finishedAt: 1, letters: 20, cards: 12 }, db);
    await saveLibraryRun({ finishedAt: 2, letters: 35, cards: 12 }, db);
    const tie = await saveLibraryRun({ finishedAt: 3, letters: 20, cards: 12 }, db);

    expect((await topLibraryRuns(10, db)).map((r) => r.letters)).toEqual([35, 20, 20]);
    expect(await libraryRunRank(first, db)).toEqual({ rank: 2, of: 3 });
    expect(await libraryRunRank(tie, db)).toEqual({ rank: 3, of: 3 });
  });
});
