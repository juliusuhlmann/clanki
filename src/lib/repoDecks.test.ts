import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClankiDb } from './db';
import { applyRepoDeck, parseRepoDeck, repoDeckId, type RepoDeckFile } from './repoDecks';
import { rate, Rating } from './scheduler';
import { createCard } from './store';

let db: ClankiDb;

beforeEach(() => {
  db = new ClankiDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

const deck = (cards: [string, string, string][], name = 'Analysis'): RepoDeckFile => ({
  id: 'ana',
  name,
  cards: cards.map(([id, front, back]) => ({ id, front, back })),
});

describe('every deck file in decks/', () => {
  // Runs in CI before deploying, so a broken file never reaches the app.
  const files = import.meta.glob<unknown>('../../decks/*.json', { import: 'default', eager: true });
  it.each(Object.entries(files))('%s is valid', (path, data) => {
    expect(() => parseRepoDeck(data, path)).not.toThrow();
  });

  it('use distinct deck ids', () => {
    const ids = Object.entries(files).map(([path, data]) => parseRepoDeck(data, path).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parseRepoDeck', () => {
  it('rejects missing fields, bad ids and duplicate card ids', () => {
    expect(() => parseRepoDeck({ id: 'a', name: 'A', cards: [{ id: 'x', front: 'q' }] }, 'f.json')).toThrow(/f.json: card "x"/);
    expect(() => parseRepoDeck({ id: 'a b', name: 'A', cards: [] }, 'f.json')).toThrow(/"id"/);
    const twice = { id: 'x', front: 'q', back: 'a' };
    expect(() => parseRepoDeck({ id: 'a', name: 'A', cards: [twice, twice] }, 'f.json')).toThrow(/used twice/);
  });
});

describe('applyRepoDeck', () => {
  it('adds the deck and its cards in file order', async () => {
    const now = Date.now();
    expect(await applyRepoDeck(deck([['c1', 'Q1', 'A1'], ['c2', 'Q2', 'A2']]), now, db)).toEqual({ added: 2, updated: 0, removed: 0 });

    expect((await db.decks.get(repoDeckId('ana')))?.name).toBe('Analysis');
    const cards = await db.cards.orderBy('id').toArray();
    expect(cards.map((c) => [c.id, c.front])).toEqual([
      ['repo-ana:c1', 'Q1'],
      ['repo-ana:c2', 'Q2'],
    ]);
    expect(cards[0].createdAt).toBeLessThan(cards[1].createdAt);
  });

  it('updates text and deck name but keeps review progress, and removes cards gone from the file', async () => {
    const now = Date.now();
    await applyRepoDeck(deck([['c1', 'Q1', 'A1'], ['c2', 'Q2', 'A2']]), now, db);
    const reviewed = await rate((await db.cards.get('repo-ana:c1'))!, Rating.Good, 1000, now, db);
    const manual = await createCard(repoDeckId('ana'), 'my own', 'card', db);

    const result = await applyRepoDeck(deck([['c1', 'Q1 fixed', 'A1'], ['c3', 'Q3', 'A3']], 'Analysis I'), now + 1000, db);
    expect(result).toEqual({ added: 1, updated: 1, removed: 1 });

    const c1 = (await db.cards.get('repo-ana:c1'))!;
    expect(c1.front).toBe('Q1 fixed');
    expect(c1.fsrs).toEqual(reviewed.fsrs);
    expect(await db.cards.get('repo-ana:c2')).toBeUndefined();
    expect(await db.cards.get(manual.id)).toBeDefined();
    expect((await db.decks.get(repoDeckId('ana')))?.name).toBe('Analysis I');
  });

  it('changes nothing when applied twice', async () => {
    const file = deck([['c1', 'Q1', 'A1']]);
    await applyRepoDeck(file, Date.now(), db);
    expect(await applyRepoDeck(file, Date.now(), db)).toEqual({ added: 0, updated: 0, removed: 0 });
  });
});
