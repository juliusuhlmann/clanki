<script lang="ts">
  import { onMount } from 'svelte';
  import { db, type Card } from '../lib/db';
  import { buildQueue, formatInterval, libraryRunSize, nextStudyAt, previewIntervals, rate, Rating, Session, totalLeftToday, undoRate, type Grade } from '../lib/scheduler';
  import { href } from '../lib/router.svelte';
  import { updateCard } from '../lib/store';
  import StudyCard from '../components/StudyCard.svelte';
  import Firefly from '../components/Firefly.svelte';
  import Orb from '../components/Orb.svelte';
  import UndoChip from '../components/UndoChip.svelte';

  // Plain study of one deck. Library runs (with the runner game) start from the home screen.
  let { deckId }: { deckId: string } = $props();

  let deckName = $state('');
  let session: Session | null = null;
  let current = $state<Card | null>(null);
  let remaining = $state(0);
  let revealed = $state(false);
  let intervals = $state<Record<Grade, string> | null>(null);
  let shownAt = 0;
  let busy = false;
  let loading = $state(true);
  /** This session's answers, for the summary at the end. */
  let answers = $state<{ cardId: string; grade: Grade; durationMs: number }[]>([]);
  const reviewedCount = $derived(answers.length);
  /** Filled in once the session is over. */
  let after = $state<{ nextAt: number | null; leftElsewhere: number } | null>(null);
  /** The last answer, so it can be taken back. */
  let last = $state.raw<{ before: Card; reviewedAt: number; session: ReturnType<Session['snapshot']> } | null>(null);

  /** Share of this session's answers done; repeats of "Again" cards count too. */
  const progress = $derived(reviewedCount + remaining === 0 ? 0 : reviewedCount / (reviewedCount + remaining));

  onMount(async () => {
    deckName = (await db.decks.get(deckId))?.name ?? '';
    session = new Session(await buildQueue(deckId, Date.now()));
    loading = false;
    showNext();
    if (!current) await summarize();
  });

  async function summarize() {
    const now = Date.now();
    const [nextAt, leftElsewhere] = await Promise.all([nextStudyAt(deckId, now), totalLeftToday(now)]);
    after = { nextAt, leftElsewhere };
  }

  const cardsSeen = $derived(new Set(answers.map((a) => a.cardId)).size);
  const recalled = $derived(answers.length ? answers.filter((a) => a.grade !== Rating.Again).length / answers.length : 0);
  const minutes = $derived(answers.reduce((sum, a) => sum + a.durationMs, 0) / 60_000);

  function whenLabel(at: number): string {
    const diff = at - Date.now();
    if (diff <= 60_000) return 'right now';
    return `in ${formatInterval(diff)}`;
  }

  function showNext() {
    if (!session) return;
    const now = Date.now();
    current = session.next(now);
    remaining = session.remaining + (current ? 1 : 0);
    revealed = false;
    intervals = current ? previewIntervals(current, now) : null;
    shownAt = now;
  }

  function reveal() {
    if (current && !revealed) revealed = true;
  }

  async function answer(grade: Grade) {
    if (!current || !revealed || busy || !session) return;
    busy = true;
    try {
      const now = Date.now();
      // Cap thinking time so leaving the app open doesn't distort stats.
      const durationMs = Math.min(now - shownAt, 120_000);
      const updated = await rate(current, grade, durationMs, now);
      // A plain copy: $state proxies can't be stored in IndexedDB.
      last = { before: $state.snapshot(current), reviewedAt: now, session: session.snapshot() };
      session.answered(updated, now);
      answers.push({ cardId: updated.id, grade, durationMs });
      showNext();
      if (!current) await summarize();
    } finally {
      busy = false;
    }
  }

  async function edit(front: string, back: string) {
    if (!current) return;
    await updateCard(current.id, front, back);
    current = { ...current, front: front.trim(), back: back.trim() };
  }

  /** Takes back the last answer and shows that card again, answer revealed. */
  async function undo() {
    if (!last || busy || !session) return;
    busy = true;
    try {
      const now = Date.now();
      const restored = await undoRate(last.before, last.reviewedAt, now);
      session.restore(last.session);
      last = null;
      answers.pop();
      after = null;
      current = restored;
      remaining = session.remaining + 1;
      revealed = true;
      intervals = previewIntervals(restored, now);
      shownAt = now;
    } finally {
      busy = false;
    }
  }
</script>

<div class="review">
  <div class="review-top">
    <a class="back" href={href({ name: 'deck', deckId })} aria-label="Back to deck">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </a>
    {#if current}
      <div class="run-meter" aria-label="{remaining} cards left">
        <div class="run-meter-track">
          <div class="run-meter-fill" style="width: {progress * 100}%"></div>
          <span class="run-meter-spark" style="left: {progress * 100}%"><Orb size={14} /></span>
        </div>
      </div>
      <span class="muted small">{remaining} left</span>
    {:else}
      <span class="spacer"></span>
    {/if}
    {#if last}<UndoChip onundo={undo} />{/if}
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if current}
    <StudyCard
      card={current}
      {deckName}
      number={reviewedCount + 1}
      {revealed}
      {intervals}
      onreveal={reveal}
      onanswer={answer}
      onedit={edit}
    />
  {:else}
    <div class="done">
      <Firefly size={72} class="spark" />
      <h1>{reviewedCount === 0 ? 'Nothing due' : 'That’s all for now'}</h1>
      {#if reviewedCount > 0}
        <dl class="session-stats panel">
          <div><dt>Cards</dt><dd>{cardsSeen}</dd></div>
          <div><dt>Recalled</dt><dd>{Math.round(recalled * 100)}%</dd></div>
          <div><dt>Time</dt><dd>{minutes < 1 ? '<1' : Math.round(minutes)} min</dd></div>
        </dl>
      {/if}
      {#if after}
        <p class="muted">
          {#if after.nextAt !== null}
            This deck is due again {whenLabel(after.nextAt)}.
          {:else if reviewedCount === 0}
            This deck has no cards yet.
          {/if}
          {#if after.leftElsewhere > 0}
            {after.leftElsewhere} card{after.leftElsewhere === 1 ? '' : 's'} still waiting in other decks.
          {/if}
        </p>
        <div class="actions">
          {#if after.leftElsewhere > 0}
            <a class="btn primary" href={href({ name: 'libraryRun' })}>Library run · {libraryRunSize(after.leftElsewhere)} cards</a>
          {/if}
          <a class="btn" class:primary={after.leftElsewhere === 0} href={href({ name: 'decks' })}>Back to decks</a>
        </div>
      {/if}
    </div>
  {/if}
</div>
