import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_BATCH_BYTES, MemoryServer, parseRequest, wins } from '../../sync/src/protocol';
import { ClankiDb, saveLibraryRun } from './db';
import { applyRepoDeck } from './repoDecks';
import { rate, Rating } from './scheduler';
import { createCard, createDeck, deleteCard, deleteDeck, updateCard } from './store';
import { link, pendingCount, syncOnce, tooLargeCount, type Transport } from './sync';

let server: MemoryServer;
let phone: ClankiDb;
let laptop: ClankiDb;
let transport: Transport;

beforeEach(async () => {
  server = new MemoryServer();
  transport = async (req) => server.handle(req);
  phone = new ClankiDb(`phone-${crypto.randomUUID()}`);
  laptop = new ClankiDb(`laptop-${crypto.randomUUID()}`);
  await link('key', phone);
  await link('key', laptop);
});

afterEach(async () => {
  await phone.delete();
  await laptop.delete();
});

const sync = (database: ClankiDb) => syncOnce(transport, database);
/** Both devices exchange everything, in either order. */
async function syncBoth() {
  await sync(phone);
  await sync(laptop);
  await sync(phone);
}
const tick = () => new Promise((r) => setTimeout(r, 2));

describe('protocol', () => {
  it('lets the newer version win and keeps ties', () => {
    expect(wins({ updatedAt: 2 }, { updatedAt: 1 })).toBe(true);
    expect(wins({ updatedAt: 1 }, { updatedAt: 1 })).toBe(false);
    expect(wins({ updatedAt: 1 }, undefined)).toBe(true);
  });

  it('rejects malformed requests', () => {
    expect(() => parseRequest({ since: -1, changes: [] })).toThrow();
    expect(() => parseRequest({ since: 0, changes: [{ kind: 'nope', id: 'x', updatedAt: 1, deleted: false, data: {} }] })).toThrow();
    expect(() => parseRequest({ since: 0, changes: [{ kind: 'card', id: 'x', updatedAt: 1, deleted: true, data: {} }] })).toThrow();
  });
});

describe('sync', () => {
  it('brings decks and cards made on one device to the other', async () => {
    const deck = await createDeck('Analysis', phone);
    const card = await createCard(deck.id, 'Q', 'A', phone);
    await syncBoth();
    expect(await laptop.decks.get(deck.id)).toEqual(await phone.decks.get(deck.id));
    expect(await laptop.cards.get(card.id)).toEqual(await phone.cards.get(card.id));
  });

  it('carries review progress and history both ways', async () => {
    const deck = await createDeck('Analysis', phone);
    const card = await createCard(deck.id, 'Q', 'A', phone);
    await syncBoth();

    await tick();
    const reviewed = await rate((await laptop.cards.get(card.id))!, Rating.Good, 1000, Date.now(), laptop);
    await syncBoth();

    expect((await phone.cards.get(card.id))?.due).toBe(reviewed.due);
    expect(await phone.reviews.count()).toBe(1);
    expect(await laptop.reviews.count()).toBe(1);
  });

  it('merges changes both devices made while offline', async () => {
    const deck = await createDeck('Analysis', phone);
    const a = await createCard(deck.id, 'A?', 'a', phone);
    const b = await createCard(deck.id, 'B?', 'b', phone);
    await syncBoth();

    // Offline: the phone edits one card, the laptop studies another and adds a third.
    await tick();
    await updateCard(a.id, 'A, edited?', 'a', phone);
    await rate((await laptop.cards.get(b.id))!, Rating.Easy, 1000, Date.now(), laptop);
    const c = await createCard(deck.id, 'C?', 'c', laptop);
    await syncBoth();

    for (const device of [phone, laptop]) {
      expect((await device.cards.get(a.id))?.front).toBe('A, edited?');
      expect((await device.cards.get(b.id))?.fsrs.reps).toBe(1);
      expect(await device.cards.get(c.id)).toBeDefined();
      expect(await device.reviews.count()).toBe(1);
    }
  });

  it('keeps the later answer when both devices studied the same card offline', async () => {
    const deck = await createDeck('Analysis', phone);
    const card = await createCard(deck.id, 'Q', 'A', phone);
    await syncBoth();

    const now = Date.now();
    await rate((await phone.cards.get(card.id))!, Rating.Again, 1000, now + 1000, phone);
    const later = await rate((await laptop.cards.get(card.id))!, Rating.Easy, 1000, now + 2000, laptop);
    await syncBoth();

    for (const device of [phone, laptop]) {
      expect((await device.cards.get(card.id))?.due).toBe(later.due);
      expect(await device.reviews.count()).toBe(2);
    }
  });

  it('deletes cards, their history and whole decks everywhere', async () => {
    const deck = await createDeck('Analysis', phone);
    const keep = await createCard(deck.id, 'keep', 'x', phone);
    const drop = await createCard(deck.id, 'drop', 'x', phone);
    await rate(drop, Rating.Good, 1000, Date.now(), phone);
    const other = await createDeck('Old', phone);
    await createCard(other.id, 'old', 'x', phone);
    await syncBoth();
    expect(await laptop.cards.count()).toBe(3);

    await tick();
    await deleteCard(drop.id, laptop);
    await deleteDeck(other.id, laptop);
    await syncBoth();

    for (const device of [phone, laptop]) {
      expect((await device.cards.toArray()).map((c) => c.id)).toEqual([keep.id]);
      expect(await device.reviews.count()).toBe(0);
      expect(await device.decks.get(other.id)).toBeUndefined();
      expect(await device.deletions.count()).toBe(0);
    }
  });

  it('syncs finished library runs', async () => {
    await saveLibraryRun({ finishedAt: Date.now(), letters: 17, cards: 12 }, phone);
    await syncBoth();
    expect((await laptop.libraryRuns.toArray()).map((r) => r.letters)).toEqual([17]);
  });

  it("doesn't let a device's fresh copy of a repo deck overwrite progress from another device", async () => {
    const file = { id: 'ana', name: 'Analysis', cards: [{ id: 'c1', front: 'Q', back: 'A' }] };
    await applyRepoDeck(file, Date.now(), phone);
    const reviewed = await rate((await phone.cards.get('repo-ana:c1'))!, Rating.Good, 1000, Date.now(), phone);
    await sync(phone);

    // The laptop opens the new app version later, offline, and creates the deck from the file itself.
    await tick();
    await applyRepoDeck(file, Date.now(), laptop);
    await syncBoth();

    expect((await laptop.cards.get('repo-ana:c1'))?.due).toBe(reviewed.due);
    expect((await phone.cards.get('repo-ana:c1'))?.due).toBe(reviewed.due);
  });

  it('has nothing left to send after a sync, and sends a lot in chunks', async () => {
    const deck = await createDeck('Big', phone);
    const now = Date.now();
    await phone.cards.bulkAdd(
      Array.from({ length: 1200 }, (_, i) => ({
        id: `c${i}`,
        deckId: deck.id,
        front: `Q${i}`,
        back: 'A',
        createdAt: now + i,
        updatedAt: now,
        due: now,
        fsrs: { stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null },
      })),
    );
    await syncBoth();
    expect(await laptop.cards.count()).toBe(1200);

    await tick();
    expect(await pendingCount(phone)).toBe(0);
    expect(await pendingCount(laptop)).toBe(0);
  });

  it('syncs cards with big embedded images in several requests, and skips ones too big to sync', async () => {
    const deck = await createDeck('Images', phone);
    const image = (bytes: number) => `![graph](data:image/png;base64,${'A'.repeat(bytes)})`;
    // Each about 1.2 MB: three don't fit in one request.
    const big = [];
    for (let i = 0; i < 3; i++) big.push(await createCard(deck.id, `Q${i}`, image(1_200_000), phone));
    const huge = await createCard(deck.id, 'too big', image(2_500_000), phone);
    const small = await createCard(deck.id, 'small', 'A', phone);

    const requests: number[] = [];
    transport = async (req) => {
      requests.push(JSON.stringify(req).length);
      return server.handle(req);
    };
    await syncBoth();

    expect(Math.max(...requests)).toBeLessThan(MAX_BATCH_BYTES);
    for (const c of [...big, small]) expect((await laptop.cards.get(c.id))?.back).toBe(c.back);
    expect(await laptop.cards.get(huge.id)).toBeUndefined();
    expect(await tooLargeCount(phone)).toBe(1);
    expect(await pendingCount(phone)).toBe(0);
  });

  it('does nothing harmful when synced again and again', async () => {
    const deck = await createDeck('Analysis', phone);
    await createCard(deck.id, 'Q', 'A', phone);
    await syncBoth();
    const before = await laptop.cards.toArray();
    await syncBoth();
    await syncBoth();
    expect(await laptop.cards.toArray()).toEqual(before);
  });
});
