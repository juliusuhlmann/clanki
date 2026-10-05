import { db as defaultDb, type Card, type ClankiDb, type Deck } from './db';
import { newCardSchedule } from './scheduler';

export async function createDeck(name: string, database: ClankiDb = defaultDb): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now };
  await database.decks.add(deck);
  return deck;
}

export async function renameDeck(id: string, name: string, database: ClankiDb = defaultDb): Promise<void> {
  await database.decks.update(id, { name: name.trim(), updatedAt: Date.now() });
}

/** Deletes a deck together with its cards and their review history. */
export async function deleteDeck(id: string, database: ClankiDb = defaultDb): Promise<void> {
  await database.transaction('rw', database.decks, database.cards, database.reviews, async () => {
    await database.cards.where('deckId').equals(id).delete();
    await database.reviews.where('deckId').equals(id).delete();
    await database.decks.delete(id);
  });
}

// New cards are studied in creation order, so creation times must be unique even when
// several cards are added within the same millisecond.
let lastCreatedAt = 0;

export async function createCard(
  deckId: string,
  front: string,
  back: string,
  database: ClankiDb = defaultDb,
): Promise<Card> {
  const now = Math.max(Date.now(), lastCreatedAt + 1);
  lastCreatedAt = now;
  const card: Card = {
    id: crypto.randomUUID(),
    deckId,
    front: front.trim(),
    back: back.trim(),
    createdAt: now,
    updatedAt: now,
    ...newCardSchedule(now),
  };
  await database.cards.add(card);
  return card;
}

export async function updateCard(
  id: string,
  front: string,
  back: string,
  database: ClankiDb = defaultDb,
): Promise<void> {
  await database.cards.update(id, { front: front.trim(), back: back.trim(), updatedAt: Date.now() });
}

export async function deleteCard(id: string, database: ClankiDb = defaultDb): Promise<void> {
  await database.transaction('rw', database.cards, database.reviews, async () => {
    await database.reviews.where('cardId').equals(id).delete();
    await database.cards.delete(id);
  });
}
