import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import { db as defaultDb, getNewPerDay, type Card, type ClankiDb, type FsrsState } from './db';

export { Rating, State };
export type { Grade };

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Cards due again within this window come back in the same session. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

/** A new study day starts at 4:00 local time, so late-night sessions count for the previous day. */
const DAY_ROLLOVER_HOUR = 4;

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

export function startOfStudyDay(now: number): number {
  const d = new Date(now);
  if (d.getHours() < DAY_ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  return d.getTime();
}

function toFsrsCard(card: Card): FsrsCard {
  const { last_review, ...rest } = card.fsrs;
  return {
    ...rest,
    state: rest.state as State,
    due: new Date(card.due),
    ...(last_review !== null ? { last_review: new Date(last_review) } : {}),
  };
}

function fromFsrsCard(c: FsrsCard): { due: number; fsrs: FsrsState } {
  return {
    due: c.due.getTime(),
    fsrs: {
      stability: c.stability,
      difficulty: c.difficulty,
      elapsed_days: c.elapsed_days,
      scheduled_days: c.scheduled_days,
      learning_steps: c.learning_steps,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state,
      last_review: c.last_review ? c.last_review.getTime() : null,
    },
  };
}

/** Scheduling fields for a brand-new card. */
export function newCardSchedule(now: number): { due: number; fsrs: FsrsState } {
  return fromFsrsCard(createEmptyCard(new Date(now)));
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

/** Interval label for each answer button, e.g. { 1: "1m", 2: "6m", 3: "10m", 4: "3d" }. */
export function previewIntervals(card: Card, now: number): Record<Grade, string> {
  const preview = scheduler.repeat(toFsrsCard(card), new Date(now));
  const labels = {} as Record<Grade, string>;
  for (const grade of GRADES) {
    labels[grade] = formatInterval(preview[grade].card.due.getTime() - now);
  }
  return labels;
}

/** FSRS probability (0–1) of recalling the card right now, or null for cards never studied. */
export function retrievability(card: Card, now: number): number | null {
  if (card.fsrs.state === State.New) return null;
  return scheduler.get_retrievability(toFsrsCard(card), new Date(now), false);
}

/** Applies a rating, saves the card and appends to the review log in one transaction. */
export async function rate(
  card: Card,
  grade: Grade,
  durationMs: number,
  now: number,
  database: ClankiDb = defaultDb,
): Promise<Card> {
  const { card: next, log } = scheduler.next(toFsrsCard(card), new Date(now), grade);
  const updated: Card = { ...card, ...fromFsrsCard(next), updatedAt: now };
  await database.transaction('rw', database.cards, database.reviews, async () => {
    await database.cards.put(updated);
    await database.reviews.add({
      cardId: card.id,
      deckId: card.deckId,
      rating: grade,
      reviewedAt: now,
      durationMs,
      stateBefore: card.fsrs.state,
      scheduledDays: log.scheduled_days,
    });
  });
  return updated;
}

/** Number of distinct new cards first studied in this deck today. */
export async function newIntroducedToday(deckId: string, now: number, database: ClankiDb = defaultDb): Promise<number> {
  const since = startOfStudyDay(now);
  const reviews = await database.reviews
    .where('reviewedAt')
    .aboveOrEqual(since)
    .filter((r) => r.deckId === deckId && r.stateBefore === State.New)
    .toArray();
  return new Set(reviews.map((r) => r.cardId)).size;
}

/** Today's queue for a deck: due cards (oldest first), then new cards up to the daily limit. */
export async function buildQueue(deckId: string, now: number, database: ClankiDb = defaultDb): Promise<Card[]> {
  const cards = await database.cards.where('deckId').equals(deckId).toArray();
  const due = cards.filter((c) => c.fsrs.state !== State.New && c.due <= now).sort((a, b) => a.due - b.due);
  const remainingNew = Math.max(0, (await getNewPerDay(database)) - (await newIntroducedToday(deckId, now, database)));
  const fresh = cards
    .filter((c) => c.fsrs.state === State.New)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, remainingNew);
  return [...due, ...fresh];
}

export async function deckCounts(
  deckId: string,
  now: number,
  database: ClankiDb = defaultDb,
): Promise<{ due: number; new: number; total: number }> {
  const cards = await database.cards.where('deckId').equals(deckId).toArray();
  const due = cards.filter((c) => c.fsrs.state !== State.New && c.due <= now).length;
  const totalNew = cards.filter((c) => c.fsrs.state === State.New).length;
  const remainingNew = Math.max(0, (await getNewPerDay(database)) - (await newIntroducedToday(deckId, now, database)));
  return { due, new: Math.min(totalNew, remainingNew), total: cards.length };
}

/**
 * A study session. Cards answered "Again" (or still in short learning steps)
 * come back once they are due, or earlier if nothing else is left.
 */
export class Session {
  private queue: Card[];
  private learning: Card[] = [];

  constructor(queue: Card[]) {
    this.queue = [...queue];
  }

  get remaining(): number {
    return this.queue.length + this.learning.length;
  }

  /** The next card to show, or null when the session is finished. */
  next(now: number): Card | null {
    this.learning.sort((a, b) => a.due - b.due);
    if (this.learning.length && this.learning[0].due <= now) return this.learning.shift()!;
    if (this.queue.length) return this.queue.shift()!;
    return this.learning.shift() ?? null;
  }

  /** Call after rating a card; keeps it in the session if it is due again soon. */
  answered(updated: Card, now: number): void {
    if (updated.due <= now + LEARN_AHEAD_MS) this.learning.push(updated);
  }
}
