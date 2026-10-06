import { fsrs, State, type Card as FsrsCard } from 'ts-fsrs';
import type { Card, FsrsState } from './db';

// The FSRS model and conversions to and from Clanki's stored cards, shared by the scheduler
// and the exam planner.

/** Normal (long-term) scheduling aims for 90% recall when a card comes due. */
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

/** A new study day starts at 4:00 local time, so late-night sessions count for the previous day. */
const DAY_ROLLOVER_HOUR = 4;

export function startOfStudyDay(now: number): number {
  const d = new Date(now);
  if (d.getHours() < DAY_ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  return d.getTime();
}

/** Start of the study day `days` after the one containing `now` (calendar days, so DST-safe). */
export function studyDayStart(now: number, days: number): number {
  const d = new Date(startOfStudyDay(now));
  d.setDate(d.getDate() + days);
  d.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  return d.getTime();
}

export function toFsrsCard(card: Pick<Card, 'due' | 'fsrs'>): FsrsCard {
  const { last_review, ...rest } = card.fsrs;
  return {
    ...rest,
    state: rest.state as State,
    due: new Date(card.due),
    ...(last_review !== null ? { last_review: new Date(last_review) } : {}),
  };
}

export function fromFsrsCard(c: FsrsCard): { due: number; fsrs: FsrsState } {
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
