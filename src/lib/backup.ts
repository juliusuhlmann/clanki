import { db as defaultDb, type Card, type ClankiDb, type Deck, type Review } from './db';

export interface BackupFile {
  app: 'clanki';
  version: 1;
  exportedAt: number;
  decks: Deck[];
  cards: Card[];
  reviews: Review[];
}

export interface ImportPlan {
  decks: Deck[];
  cards: Card[];
  reviews: Review[];
  summary: {
    newDecks: number;
    updatedDecks: number;
    newCards: number;
    updatedCards: number;
    newReviews: number;
  };
}

export async function exportData(now: number, database: ClankiDb = defaultDb): Promise<BackupFile> {
  const [decks, cards, reviews] = await Promise.all([
    database.decks.toArray(),
    database.cards.toArray(),
    database.reviews.toArray(),
  ]);
  return {
    app: 'clanki',
    version: 1,
    exportedAt: now,
    decks,
    cards,
    // Review ids are local auto-increment keys; they get reassigned on import.
    reviews: reviews.map(({ id: _id, ...r }) => r),
  };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `clanki-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isDeck(v: unknown): v is Deck {
  return isObj(v) && isStr(v.id) && isStr(v.name) && isNum(v.createdAt) && isNum(v.updatedAt);
}

function isCard(v: unknown): v is Card {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.deckId) &&
    isStr(v.front) &&
    isStr(v.back) &&
    isNum(v.createdAt) &&
    isNum(v.updatedAt) &&
    isNum(v.due) &&
    isObj(v.fsrs) &&
    isNum(v.fsrs.state) &&
    isNum(v.fsrs.stability) &&
    isNum(v.fsrs.difficulty)
  );
}

function isReview(v: unknown): v is Review {
  return isObj(v) && isStr(v.cardId) && isStr(v.deckId) && isNum(v.rating) && isNum(v.reviewedAt);
}

/** Parses and validates a backup file; throws a readable error if it isn't one. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isObj(data) || data.app !== 'clanki') throw new Error('This is not a Clanki backup file.');
  if (data.version !== 1) throw new Error(`Unsupported backup version: ${String(data.version)}.`);
  if (!Array.isArray(data.decks) || !data.decks.every(isDeck)) throw new Error('The backup contains invalid decks.');
  if (!Array.isArray(data.cards) || !data.cards.every(isCard)) throw new Error('The backup contains invalid cards.');
  if (!Array.isArray(data.reviews) || !data.reviews.every(isReview))
    throw new Error('The backup contains invalid reviews.');
  return data as unknown as BackupFile;
}

/** Works out what an import would change: newer decks/cards win, reviews are deduplicated. */
export async function planImport(file: BackupFile, database: ClankiDb = defaultDb): Promise<ImportPlan> {
  const plan: ImportPlan = {
    decks: [],
    cards: [],
    reviews: [],
    summary: { newDecks: 0, updatedDecks: 0, newCards: 0, updatedCards: 0, newReviews: 0 },
  };

  const existingDecks = new Map((await database.decks.toArray()).map((d) => [d.id, d]));
  for (const deck of file.decks) {
    const current = existingDecks.get(deck.id);
    if (!current) {
      plan.decks.push(deck);
      plan.summary.newDecks++;
    } else if (deck.updatedAt > current.updatedAt) {
      plan.decks.push(deck);
      plan.summary.updatedDecks++;
    }
  }

  const existingCards = new Map((await database.cards.toArray()).map((c) => [c.id, c]));
  for (const card of file.cards) {
    const current = existingCards.get(card.id);
    if (!current) {
      plan.cards.push(card);
      plan.summary.newCards++;
    } else if (card.updatedAt > current.updatedAt) {
      plan.cards.push(card);
      plan.summary.updatedCards++;
    }
  }

  const reviewKey = (r: Review) => `${r.cardId}|${r.reviewedAt}`;
  const existingReviews = new Set((await database.reviews.toArray()).map(reviewKey));
  for (const { id: _id, ...review } of file.reviews) {
    const key = reviewKey(review);
    if (!existingReviews.has(key)) {
      existingReviews.add(key);
      plan.reviews.push(review);
      plan.summary.newReviews++;
    }
  }

  return plan;
}

export async function applyImport(plan: ImportPlan, database: ClankiDb = defaultDb): Promise<void> {
  await database.transaction('rw', database.decks, database.cards, database.reviews, async () => {
    await database.decks.bulkPut(plan.decks);
    await database.cards.bulkPut(plan.cards);
    await database.reviews.bulkAdd(plan.reviews);
  });
}
