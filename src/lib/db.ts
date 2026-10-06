import Dexie, { type EntityTable } from 'dexie';

/** FSRS memory state, stored with plain numbers so it survives JSON export. */
export interface FsrsState {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** 0 = New, 1 = Learning, 2 = Review, 3 = Relearning */
  state: number;
  /** ms timestamp, null for cards never reviewed */
  last_review: number | null;
}

export interface Deck {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: number;
  updatedAt: number;
  /** ms timestamp of the next review; top-level so it can be indexed */
  due: number;
  fsrs: FsrsState;
}

export interface Review {
  id?: number;
  cardId: string;
  deckId: string;
  /** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy */
  rating: number;
  reviewedAt: number;
  durationMs: number;
  /** FSRS state of the card before this review (0 = New) */
  stateBefore: number;
  scheduledDays: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** A finished library run: cards plus two runner runs, scored by the letters of both runs. */
export interface LibraryRun {
  id?: number;
  finishedAt: number;
  letters: number;
  cards: number;
}

export class ClankiDb extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  libraryRuns!: EntityTable<LibraryRun, 'id'>;

  constructor(name = 'clanki') {
    super(name);
    this.version(1).stores({
      decks: 'id, name',
      cards: 'id, deckId, [deckId+due]',
      reviews: '++id, cardId, deckId, reviewedAt, [cardId+reviewedAt]',
      settings: 'key',
    });
    this.version(2).stores({
      libraryRuns: '++id, letters, finishedAt',
    });
  }
}

export const db = new ClankiDb();

/** Saves a finished library run and returns its id. */
export async function saveLibraryRun(run: Omit<LibraryRun, 'id'>, database: ClankiDb = db): Promise<number> {
  return (await database.libraryRuns.add(run)) as number;
}

/** Best library runs by letters; ties go to the earlier run. */
export async function topLibraryRuns(limit = 10, database: ClankiDb = db): Promise<LibraryRun[]> {
  const all = await database.libraryRuns.toArray();
  return all.sort((a, b) => b.letters - a.letters || a.finishedAt - b.finishedAt).slice(0, limit);
}

/** 1-based rank of a saved library run in the same order as topLibraryRuns, and how many runs there are. */
export async function libraryRunRank(id: number, database: ClankiDb = db): Promise<{ rank: number; of: number }> {
  const all = await topLibraryRuns(Infinity, database);
  return { rank: all.findIndex((r) => r.id === id) + 1, of: all.length };
}

export const DEFAULT_NEW_PER_DAY = 20;

export async function getNewPerDay(database: ClankiDb = db): Promise<number> {
  const row = await database.settings.get('newPerDay');
  return typeof row?.value === 'number' ? row.value : DEFAULT_NEW_PER_DAY;
}

export async function setNewPerDay(value: number, database: ClankiDb = db): Promise<void> {
  await database.settings.put({ key: 'newPerDay', value });
}

export async function getSetting<T extends number | boolean | string>(
  key: string,
  fallback: T,
  database: ClankiDb = db,
): Promise<T> {
  const row = await database.settings.get(key);
  return typeof row?.value === typeof fallback ? (row!.value as T) : fallback;
}

export async function setSetting(key: string, value: number | boolean | string, database: ClankiDb = db): Promise<void> {
  await database.settings.put({ key, value });
}
