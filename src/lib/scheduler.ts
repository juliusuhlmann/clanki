import { createEmptyCard, Rating, State, type Grade } from 'ts-fsrs';
import {
  activeExam,
  daysUntil,
  DEFAULT_DAILY_MINUTES,
  examMoment,
  newCardsNeeded,
  normalDue,
  planExamDue,
  recallIfStoppedNow,
  type DayLoad,
} from './exam';
import { fromFsrsCard, scheduler, startOfStudyDay, toFsrsCard } from './fsrs';
import { db as defaultDb, getNewPerDay, getSetting, type Card, type ClankiDb, type Deck, type FsrsState } from './db';

export { Rating, State };
export type { Grade };

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Cards due again within this window come back in the same session. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

export { startOfStudyDay };

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
  const scheduled = fromFsrsCard(next);
  // In a deck with an upcoming exam, reviewed cards come back on the exam plan instead (exam.ts).
  const exam = activeExam(await database.decks.get(card.deckId), now);
  if (exam !== null) {
    const planned = planExamDue(scheduled, exam, now, 1, await examLoad(now, database));
    if (planned !== null) scheduled.due = planned;
  }
  const updated: Card = { ...card, ...scheduled, updatedAt: now };
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

/**
 * New cards per day for a deck: the daily limit, or more if an upcoming exam needs a faster pace
 * to have every card learned in time (exam.ts).
 */
export async function newPerDayFor(deckId: string, cards: Card[], now: number, database: ClankiDb = defaultDb): Promise<number> {
  const normal = await getNewPerDay(database);
  const exam = activeExam(await database.decks.get(deckId), now);
  if (exam === null) return normal;
  const unlearned = cards.filter((c) => c.fsrs.state === State.New).length;
  return Math.max(normal, newCardsNeeded(unlearned + (await newIntroducedToday(deckId, now, database)), exam, now));
}

async function remainingNewToday(deckId: string, cards: Card[], now: number, database: ClankiDb): Promise<number> {
  return Math.max(0, (await newPerDayFor(deckId, cards, now, database)) - (await newIntroducedToday(deckId, now, database)));
}

/** Reviewed cards of decks with an upcoming exam, counted by the day they're due (days from today). */
export async function examLoad(now: number, database: ClankiDb = defaultDb): Promise<DayLoad> {
  const examDecks = (await database.decks.toArray()).filter((d) => activeExam(d, now) !== null).map((d) => d.id);
  const load: DayLoad = new Map();
  if (!examDecks.length) return load;
  const cards = await database.cards.where('deckId').anyOf(examDecks).toArray();
  for (const c of cards) {
    if (c.fsrs.state !== State.Review) continue;
    const day = daysUntil(now, c.due);
    load.set(day, (load.get(day) ?? 0) + 1);
  }
  return load;
}

/**
 * Sets or clears a deck's exam date and re-plans its reviewed cards: on the exam plan while the
 * exam is ahead, back to normal long-term intervals otherwise.
 */
export async function setExamDate(deckId: string, examDate: string | null, now: number, database: ClankiDb = defaultDb): Promise<void> {
  await database.transaction('rw', database.decks, database.cards, async () => {
    const deck = await database.decks.get(deckId);
    if (!deck) return;
    const { examDate: _old, ...rest } = deck;
    const next: Deck = examDate ? { ...rest, examDate } : rest;
    await database.decks.put({ ...next, updatedAt: now });

    const exam = activeExam(next, now);
    const load = exam === null ? undefined : await examLoad(now, database);
    const cards = await database.cards.where('deckId').equals(deckId).toArray();
    for (const card of cards) {
      if (card.fsrs.state !== State.Review) continue;
      const due = (exam === null ? null : planExamDue(card, exam, now, 0, load)) ?? normalDue(card);
      if (due === card.due) continue;
      if (load) {
        const from = daysUntil(now, card.due);
        load.set(from, (load.get(from) ?? 1) - 1);
        load.set(daysUntil(now, due), (load.get(daysUntil(now, due)) ?? 0) + 1);
      }
      await database.cards.update(card.id, { due, updatedAt: now });
    }
  });
}

/** Today's queue for a deck: due cards (oldest first), then new cards up to the daily limit. */
export async function buildQueue(deckId: string, now: number, database: ClankiDb = defaultDb): Promise<Card[]> {
  const cards = await database.cards.where('deckId').equals(deckId).toArray();
  const due = cards.filter((c) => c.fsrs.state !== State.New && c.due <= now).sort((a, b) => a.due - b.due);
  const remainingNew = await remainingNewToday(deckId, cards, now, database);
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
  const remainingNew = await remainingNewToday(deckId, cards, now, database);
  return { due, new: Math.min(totalNew, remainingNew), total: cards.length };
}

/**
 * A study session. Cards answered "Again" (or still in short learning steps)
 * come back once they are due, or earlier if nothing else is left.
 */
export class Session {
  private queue: Card[];
  private learning: Card[] = [];

  /** @param learnAheadMs cards due again within this window come back in the same session. */
  constructor(
    queue: Card[],
    private learnAheadMs = LEARN_AHEAD_MS,
  ) {
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
    if (updated.due <= now + this.learnAheadMs) this.learning.push(updated);
  }
}

/**
 * In a library run only "Again" cards (1 minute step) come back; cards in longer
 * learning steps wait for a later library run, so the three blocks stay even.
 */
export const LIBRARY_LEARN_AHEAD_MS = 2 * 60 * 1000;

/** Cards in one library run, given how many are left today across all decks. */
export function libraryRunSize(left: number): number {
  if (left < 18) return left;
  if (left < 24) return Math.ceil(left / 2);
  return 12;
}

/** Splits a library run's cards into three blocks, as even as possible (17 → 6, 6, 5). */
export function splitBlocks(total: number): [number, number, number] {
  const base = Math.floor(total / 3);
  const extra = total % 3;
  return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base];
}

/** Cards left to study today across all decks (due plus new within each deck's limit). */
export async function totalLeftToday(now: number, database: ClankiDb = defaultDb): Promise<number> {
  const decks = await database.decks.toArray();
  const counts = await Promise.all(decks.map((d) => deckCounts(d.id, now, database)));
  return counts.reduce((sum, c) => sum + c.due + c.new, 0);
}

/**
 * The cards for one library run, drawn from all decks: due cards (oldest first),
 * then new cards, cut to libraryRunSize and shuffled so the decks mix.
 */
export async function buildLibraryQueue(
  now: number,
  database: ClankiDb = defaultDb,
  rng: () => number = Math.random,
): Promise<Card[]> {
  const decks = await database.decks.toArray();
  const queues = await Promise.all(decks.map((d) => buildQueue(d.id, now, database)));
  const all = queues.flat();
  const due = all.filter((c) => c.fsrs.state !== State.New).sort((a, b) => a.due - b.due);
  const fresh = all.filter((c) => c.fsrs.state === State.New).sort((a, b) => a.createdAt - b.createdAt);
  const picked = [...due, ...fresh].slice(0, libraryRunSize(all.length));
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

export interface ExamStatus {
  examDate: string;
  /** Days until the exam (0 = today); negative once it's over. */
  daysLeft: number;
  /** Average predicted recall on exam day if you stopped studying now (new cards count as 0). */
  ifStoppedNow: number;
  /** New cards per day this deck needs to be fully learned in time, and the normal limit. */
  newNeeded: number;
  newNormal: number;
  /** Busiest of the next two weeks for all exam decks together, in minutes, and the daily limit. */
  busiestMinutes: number;
  dailyMinutes: number;
}

/** Typical seconds per answer from your recent reviews (10 s until there are enough). */
export async function secondsPerAnswer(database: ClankiDb = defaultDb): Promise<number> {
  const recent = (await database.reviews.orderBy('reviewedAt').reverse().limit(300).toArray()).map((r) => r.durationMs).sort((a, b) => a - b);
  return recent.length < 20 ? 10 : Math.max(2, recent[Math.floor(recent.length / 2)] / 1000);
}

export async function examStatus(deckId: string, now: number, database: ClankiDb = defaultDb): Promise<ExamStatus | null> {
  const deck = await database.decks.get(deckId);
  if (!deck?.examDate) return null;
  const moment = examMoment(deck.examDate);
  const cards = await database.cards.where('deckId').equals(deckId).toArray();
  const newNormal = await getNewPerDay(database);
  const dailyMinutes = await getSetting<number>('examDailyMinutes', DEFAULT_DAILY_MINUTES, database);
  const status: ExamStatus = {
    examDate: deck.examDate,
    daysLeft: daysUntil(now, moment),
    ifStoppedNow: recallIfStoppedNow(cards, moment),
    newNeeded: 0,
    newNormal,
    busiestMinutes: 0,
    dailyMinutes,
  };
  if (activeExam(deck, now) === null) return status;

  const unlearned = cards.filter((c) => c.fsrs.state === State.New).length;
  status.newNeeded = newCardsNeeded(unlearned + (await newIntroducedToday(deckId, now, database)), moment, now);
  // Workload: planned reviews per day, plus about two answers for each new card of every exam deck.
  const load = await examLoad(now, database);
  let newAnswersPerDay = 0;
  for (const d of await database.decks.toArray()) {
    const exam = activeExam(d, now);
    if (exam === null) continue;
    const deckCards = d.id === deckId ? cards : await database.cards.where('deckId').equals(d.id).toArray();
    const fresh = deckCards.filter((c) => c.fsrs.state === State.New).length;
    newAnswersPerDay += 2 * Math.min(fresh, Math.max(newNormal, newCardsNeeded(fresh, exam, now)));
  }
  const seconds = await secondsPerAnswer(database);
  let busiest = 0;
  for (let day = 0; day < 14; day++) busiest = Math.max(busiest, (load.get(day) ?? 0) + newAnswersPerDay);
  status.busiestMinutes = Math.round((busiest * seconds) / 60);
  return status;
}
