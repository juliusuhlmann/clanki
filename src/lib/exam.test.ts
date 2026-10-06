import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClankiDb, setNewPerDay, type Card } from './db';
import {
  daysUntil,
  examMoment,
  FINAL_FIRST,
  FINAL_LAST,
  floorAt,
  LEARNED_BY_DAYS,
  newCardsNeeded,
  planExamDue,
  recallAt,
  recallIfStoppedNow,
  TARGET,
  type DayLoad,
} from './exam';
import { startOfStudyDay, studyDayStart } from './fsrs';
import { buildQueue, rate, Rating, setExamDate, State } from './scheduler';
import { createCard, createDeck } from './store';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** A local YYYY-MM-DD date `days` after the day of `now`. */
function dateIn(now: number, days: number): string {
  const d = new Date(studyDayStart(now, days));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A reviewed card with the given stability, last reviewed at `reviewed`. */
function reviewed(stability: number, reviewedAt: number): Pick<Card, 'due' | 'fsrs'> {
  return {
    due: reviewedAt + stability * DAY,
    fsrs: { stability, difficulty: 5, elapsed_days: 0, scheduled_days: Math.round(stability), learning_steps: 0, reps: 3, lapses: 0, state: State.Review, last_review: reviewedAt },
  };
}

describe('exam rules', () => {
  const now = new Date(2026, 9, 6, 13).getTime();

  it('aims at 8:00 on the exam day', () => {
    expect(new Date(examMoment('2026-11-20')).toString()).toContain('Nov 20 2026 08:00');
  });

  it('lets cards dip to 80% far from the exam, rising to 90% at the final window', () => {
    const exam = examMoment(dateIn(now, 100));
    expect(floorAt(now, exam)).toBe(0.8);
    expect(floorAt(exam - (FINAL_FIRST + 15) * DAY, exam)).toBeCloseTo(0.85, 5);
    expect(floorAt(exam - FINAL_FIRST * DAY, exam)).toBe(0.9);
    expect(floorAt(exam - DAY, exam)).toBe(0.9);
  });

  it('leaves a card alone that will be at 95% on exam day anyway', () => {
    const exam = examMoment(dateIn(now, 5));
    const card = reviewed(200, now);
    expect(recallAt(card, exam)).toBeGreaterThan(TARGET);
    expect(planExamDue(card, exam, now, 1)).toBeNull();
  });

  it('brings a card back when it reaches the floor, well before the exam', () => {
    const exam = examMoment(dateIn(now, 120));
    const card = reviewed(10, now);
    const due = planExamDue(card, exam, now, 1)!;
    const day = daysUntil(now, due);
    // Later than plain FSRS (10 days, at 90%), as the floor is 80% this far out.
    expect(day).toBeGreaterThan(10);
    expect(recallAt(card, due)).toBeGreaterThanOrEqual(floorAt(due, exam) - 1e-9);
    expect(recallAt(card, studyDayStart(now, day + 1))).toBeLessThan(floorAt(studyDayStart(now, day + 1), exam));
  });

  it('places the last review in the final window so that a Good answer reaches 95%', () => {
    const exam = examMoment(dateIn(now, 25));
    const card = reviewed(20, now);
    expect(recallAt(card, exam)).toBeLessThan(TARGET);
    const day = daysUntil(now, planExamDue(card, exam, now, 1)!);
    expect(day).toBeGreaterThanOrEqual(25 - FINAL_FIRST);
    expect(day).toBeLessThanOrEqual(25 - FINAL_LAST);
  });

  it('spreads the final pass to the less busy days of the window', () => {
    const exam = examMoment(dateIn(now, 25));
    const card = reviewed(20, now);
    const free = daysUntil(now, planExamDue(card, exam, now, 1)!);
    const load: DayLoad = new Map([[free, 50]]);
    const spread = daysUntil(now, planExamDue(card, exam, now, 1, load)!);
    expect(spread).not.toBe(free);
    expect(spread).toBeGreaterThanOrEqual(25 - FINAL_FIRST);
  });

  it('uses the day before the exam only for cards that still need it', () => {
    const exam = examMoment(dateIn(now, 2));
    // Answered on the last day of the window and still weak: once more the day before.
    expect(daysUntil(now, planExamDue(reviewed(1, now), exam, now, 1)!)).toBe(1);
    // Answered the day before the exam: nothing more is planned before it.
    expect(planExamDue(reviewed(1, now), examMoment(dateIn(now, 1)), now, 1)).toBeNull();
  });

  it('paces new cards to be learned 10 days before the exam', () => {
    // 30 days to the exam: days 0..20 are left for new cards.
    expect(newCardsNeeded(105, examMoment(dateIn(now, 30)), now)).toBe(5);
    expect(newCardsNeeded(40, examMoment(dateIn(now, 5)), now)).toBe(40);
    expect(newCardsNeeded(0, examMoment(dateIn(now, 30)), now)).toBe(0);
  });

  it('forecasts recall on exam day if you stopped now', () => {
    const exam = examMoment(dateIn(now, 10));
    const newCard = { fsrs: { ...reviewed(1, now).fsrs, state: State.New, last_review: null } };
    expect(recallIfStoppedNow([reviewed(400, now), newCard], exam)).toBeCloseTo(recallAt(reviewed(400, now), exam) / 2, 5);
  });
});

describe('a semester in exam mode', () => {
  let db: ClankiDb;
  beforeEach(() => {
    db = new ClankiDb(`test-${crypto.randomUUID()}`);
  });
  afterEach(async () => {
    await db.delete();
  });

  it('gets every card to 95% on exam day, with all cards learned in time and the day before free', async () => {
    const start = new Date(2026, 9, 6, 13).getTime();
    const examDays = 45;
    // 2 new cards a day would take 60 days for 120 cards: the exam pace has to step in.
    await setNewPerDay(2, db);
    const deck = await createDeck('Analysis', db);
    for (let i = 0; i < 120; i++) await createCard(deck.id, `Q${i}`, 'A', db);
    await setExamDate(deck.id, dateIn(start, examDays), start, db);
    const exam = examMoment(dateIn(start, examDays));

    const reviewsPerDay: number[] = [];
    let lastNewDay = -1;
    for (let day = 0; day < examDays; day++) {
      // Study at 13:00 each day: answer everything due with Good, learning steps included.
      let t = studyDayStart(start, day) + 9 * HOUR;
      const end = studyDayStart(start, day + 1);
      let answered = 0;
      for (;;) {
        const queue = await buildQueue(deck.id, t, db);
        if (!queue.length) {
          const learning = (await db.cards.where('deckId').equals(deck.id).toArray())
            .filter((c) => c.fsrs.state === State.Learning || c.fsrs.state === State.Relearning)
            .map((c) => c.due)
            .filter((due) => due < end - HOUR);
          if (!learning.length) break;
          t = Math.max(t, Math.min(...learning));
          continue;
        }
        if (queue[0].fsrs.state === State.New) lastNewDay = day;
        await rate(queue[0], Rating.Good, 8000, t, db);
        answered++;
        t += 30_000;
      }
      reviewsPerDay.push(answered);
    }

    const cards = await db.cards.toArray();
    expect(cards.every((c) => c.fsrs.state !== State.New)).toBe(true);
    expect(lastNewDay).toBeLessThanOrEqual(examDays - LEARNED_BY_DAYS);
    expect(Math.min(...cards.map((c) => recallAt(c, exam)))).toBeGreaterThanOrEqual(TARGET);
    expect(reviewsPerDay[examDays - 1]).toBe(0);
    // The final pass is spread out: no single day of the window carries most of the deck.
    const window = reviewsPerDay.slice(examDays - FINAL_FIRST, examDays - FINAL_LAST + 1);
    expect(Math.max(...window)).toBeLessThan(cards.length / 2);
    expect(startOfStudyDay(exam)).toBe(studyDayStart(start, examDays));
    // A whole simulated semester: several seconds, more on slow CI machines.
  }, 60_000);
});
