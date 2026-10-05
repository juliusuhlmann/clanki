import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClankiDb } from './db';
import { applyImport, exportData, parseBackup, planImport } from './backup';
import { rate, Rating } from './scheduler';
import { createCard, createDeck } from './store';

let source: ClankiDb;
let target: ClankiDb;

beforeEach(() => {
  source = new ClankiDb(`src-${crypto.randomUUID()}`);
  target = new ClankiDb(`dst-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await source.delete();
  await target.delete();
});

async function roundTrip(from: ClankiDb, to: ClankiDb) {
  const text = JSON.stringify(await exportData(Date.now(), from));
  const plan = await planImport(parseBackup(text), to);
  await applyImport(plan, to);
  return plan;
}

describe('backup', () => {
  it('round-trips decks, cards and reviews into an empty database', async () => {
    const deck = await createDeck('Spanish', source);
    const card = await createCard(deck.id, 'hola', 'hello', source);
    await createCard(deck.id, 'adiós', 'goodbye', source);
    await rate(card, Rating.Good, 2000, Date.now(), source);

    const plan = await roundTrip(source, target);

    expect(plan.summary).toEqual({ newDecks: 1, updatedDecks: 0, newCards: 2, updatedCards: 0, newReviews: 1 });
    expect(await target.decks.toArray()).toEqual(await source.decks.toArray());
    expect(await target.cards.get(card.id)).toEqual(await source.cards.get(card.id));
    expect(await target.reviews.count()).toBe(1);
  });

  it('importing the same file twice changes nothing', async () => {
    const deck = await createDeck('Spanish', source);
    const card = await createCard(deck.id, 'hola', 'hello', source);
    await rate(card, Rating.Good, 2000, Date.now(), source);

    await roundTrip(source, target);
    const second = await roundTrip(source, target);

    expect(Object.values(second.summary).every((n) => n === 0)).toBe(true);
    expect(await target.reviews.count()).toBe(1);
  });

  it('keeps the newer version of a card', async () => {
    const deck = await createDeck('Spanish', source);
    const card = await createCard(deck.id, 'hola', 'hello', source);
    await roundTrip(source, target);

    // Edit on the target later than the source; the import must not overwrite it.
    await target.cards.update(card.id, { back: 'hi', updatedAt: card.updatedAt + 10_000 });
    let plan = await roundTrip(source, target);
    expect(plan.summary.updatedCards).toBe(0);
    expect((await target.cards.get(card.id))?.back).toBe('hi');

    // Now a newer edit on the source does win.
    await source.cards.update(card.id, { back: 'hey', updatedAt: card.updatedAt + 20_000 });
    plan = await roundTrip(source, target);
    expect(plan.summary.updatedCards).toBe(1);
    expect((await target.cards.get(card.id))?.back).toBe('hey');
  });

  it('rejects files that are not Clanki backups', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON');
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a Clanki backup');
    expect(() => parseBackup('{"app":"clanki","version":2}')).toThrow('Unsupported backup version');
    expect(() =>
      parseBackup(JSON.stringify({ app: 'clanki', version: 1, decks: [], cards: [{ id: 1 }], reviews: [] })),
    ).toThrow('invalid cards');
  });
});
