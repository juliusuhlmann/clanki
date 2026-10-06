import { Rating, State } from 'ts-fsrs';
import type { Card, Deck } from './db';
import { scheduler, studyDayStart, startOfStudyDay, toFsrsCard } from './fsrs';

// Exam mode: a deck with an exam date is scheduled to reach TARGET recall on exam day, instead of
// FSRS's steady 90%. FSRS still models memory (stability, recall over time); only *when* a card
// comes back changes:
// - Cards may dip to a floor that rises from 80% to 90% as the exam nears (cheap, effective reviews).
// - Every card that wouldn't make TARGET on its own gets one last review in the final window
//   (8 to 2 days before), placed as late as safe and spread over the window's days.
// - The day before the exam stays free, except for cards that need relearning.
// - New cards are paced so everything is learned 10 days before the exam.
// - Once the exam is over, the deck is back to normal scheduling.

/** Recall every card should have on exam day. */
export const TARGET = 0.95;
/** Recall a card may drop to before a review: FLOOR_LOW early on, rising to FLOOR_HIGH at the final window. */
export const FLOOR_LOW = 0.8;
export const FLOOR_HIGH = 0.9;
/** Days over which the floor rises, ending at the final window. */
const FLOOR_RAMP_DAYS = 30;
/** All new cards are learned by this many days before the exam. */
export const LEARNED_BY_DAYS = 10;
/** The final pass happens from FINAL_FIRST to FINAL_LAST days before the exam. */
export const FINAL_FIRST = 8;
export const FINAL_LAST = 2;
/** Recall is predicted for this hour of the exam day (only the date is known; morning is the safe side). */
const EXAM_HOUR = 8;
/** Default daily time for all exam decks together, in minutes (Settings). */
export const DEFAULT_DAILY_MINUTES = 40;

const DAY = 86_400_000;

/** The moment recall has to be good: 8:00 on the exam day. */
export function examMoment(examDate: string): number {
  const [y, m, d] = examDate.split('-').map(Number);
  return new Date(y, m - 1, d, EXAM_HOUR).getTime();
}

/** The exam the deck is scheduled for, if it's still ahead. */
export function activeExam(deck: Pick<Deck, 'examDate'> | undefined, now: number): number | null {
  if (!deck?.examDate) return null;
  const t = examMoment(deck.examDate);
  return now < t ? t : null;
}

/** Study days from the day of `now` to the day of `t` (0 = today). */
export function daysUntil(now: number, t: number): number {
  return Math.round((startOfStudyDay(t) - startOfStudyDay(now)) / DAY);
}

/** Predicted recall at time `at` for a card that has been reviewed (0 for new cards). */
export function recallAt(card: Pick<Card, 'fsrs'>, at: number): number {
  if (card.fsrs.state === State.New || card.fsrs.last_review === null) return 0;
  return scheduler.forgetting_curve(Math.max(0, (at - card.fsrs.last_review) / DAY), card.fsrs.stability);
}

/** Recall at the exam if the card is answered "Good" at `reviewAt`. */
function recallAfterGood(card: Pick<Card, 'due' | 'fsrs'>, reviewAt: number, exam: number): number {
  const next = scheduler.repeat(toFsrsCard(card), new Date(reviewAt))[Rating.Good].card;
  return scheduler.forgetting_curve((exam - reviewAt) / DAY, next.stability);
}

/** The lowest recall allowed at time `t` before an exam at `exam`. */
export function floorAt(t: number, exam: number): number {
  const daysToWindow = (exam - t) / DAY - FINAL_FIRST;
  if (daysToWindow <= 0) return FLOOR_HIGH;
  if (daysToWindow >= FLOOR_RAMP_DAYS) return FLOOR_LOW;
  return FLOOR_HIGH - (FLOOR_HIGH - FLOOR_LOW) * (daysToWindow / FLOOR_RAMP_DAYS);
}

/** Normal long-term due date: FSRS stability is the time until recall falls to 90%. */
export function normalDue(card: Pick<Card, 'due' | 'fsrs'>): number {
  const { last_review, stability, state } = card.fsrs;
  if (state !== State.Review || last_review === null) return card.due;
  return last_review + Math.max(1, Math.round(stability)) * DAY;
}

/** Cards already planned per day, `days from today` → count, used to spread reviews out. */
export type DayLoad = Map<number, number>;

/** Before the final window, a review may move up to this many days earlier to a quieter day. */
export const SPREAD_DAYS = 2;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** The day with the fewest planned reviews; on a tie the latest, which is the most efficient. */
function leastBusy(days: number[], load: DayLoad | undefined): number {
  const busy = (day: number) => load?.get(day) ?? 0;
  return days.reduce((a, b) => (busy(b) <= busy(a) ? b : a));
}

/**
 * When a reviewed card (FSRS state Review) should come back before the exam, or null if it
 * needs nothing before the exam (then its normal due date, which is after the exam, applies).
 * `earliest` is the first allowed day, counted from the day of `now` (1 after answering it today).
 */
export function planExamDue(card: Pick<Card, 'due' | 'fsrs'>, exam: number, now: number, earliest: number, load?: DayLoad): number | null {
  if (card.fsrs.state !== State.Review || card.fsrs.last_review === null) return null;
  if (recallAt(card, exam) >= TARGET) return null;

  const examDay = daysUntil(now, exam);
  const windowFirst = examDay - FINAL_FIRST;
  const windowLast = examDay - FINAL_LAST;
  const at = (day: number) => studyDayStart(now, day);

  // The last day the card is still at or above the floor (at least `earliest`).
  let floorDay = earliest;
  for (let day = earliest; day < examDay; day++) {
    if (recallAt(card, at(day)) < floorAt(at(day), exam)) break;
    floorDay = day;
  }

  // Well before the exam: come back just before dropping below the floor, or up to SPREAD_DAYS
  // earlier if that day is less busy (never later, which would go below the floor).
  if (floorDay < windowFirst) return at(leastBusy(range(Math.max(earliest, floorDay - SPREAD_DAYS), floorDay), load));

  // Final pass: as late as allowed, on a day of the window where a "Good" gets it to TARGET,
  // preferring the least busy day so the window's work is spread out.
  const first = Math.max(earliest, windowFirst);
  const last = Math.min(floorDay, windowLast);
  if (first <= last) {
    let candidates: number[] = [];
    for (let day = first; day <= last; day++) if (recallAfterGood(card, at(day), exam) >= TARGET) candidates.push(day);
    if (!candidates.length) candidates = [last];
    return at(leastBusy(candidates, load));
  }

  // Past the window (a card answered wrongly late on): once more the day before the exam,
  // which otherwise stays free; answered on that day itself, normal scheduling takes over.
  const eve = examDay - 1;
  return earliest <= eve ? at(eve) : null;
}

/** New cards to introduce per day so the deck is fully learned LEARNED_BY_DAYS before the exam. */
export function newCardsNeeded(unlearned: number, exam: number, now: number): number {
  const daysLeft = daysUntil(now, exam) - LEARNED_BY_DAYS + 1;
  if (unlearned <= 0) return 0;
  if (daysLeft <= 1) return unlearned;
  return Math.ceil(unlearned / daysLeft);
}

/** Average predicted recall on exam day if you stopped studying now (new cards count as 0). */
export function recallIfStoppedNow(cards: Pick<Card, 'fsrs'>[], exam: number): number {
  if (!cards.length) return 0;
  return cards.reduce((sum, c) => sum + recallAt(c, exam), 0) / cards.length;
}
