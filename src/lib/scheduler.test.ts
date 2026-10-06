import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClankiDb, setNewPerDay } from './db';
import { buildQueue, formatInterval, rate, Rating, retrievability, Session, startOfStudyDay, State } from './scheduler';
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
