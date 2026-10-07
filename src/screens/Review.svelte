<script lang="ts">
  import { onMount } from 'svelte';
  import { db, type Card } from '../lib/db';
  import { buildQueue, previewIntervals, rate, Session, undoRate, type Grade } from '../lib/scheduler';
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
  let reviewedCount = $state(0);
  /** The last answer, so it can be taken back. */
  let last = $state.raw<{ before: Card; reviewedAt: number; session: ReturnType<Session['snapshot']> } | null>(null);

  /** Share of this session's answers done; repeats of "Again" cards count too. */
  const progress = $derived(reviewedCount + remaining === 0 ? 0 : reviewedCount / (reviewedCount + remaining));

  onMount(async () => {
    deckName = (await db.decks.get(deckId))?.name ?? '';
    session = new Session(await buildQueue(deckId, Date.now()));
    loading = false;
    showNext();
  });

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
      reviewedCount++;
      showNext();
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
      reviewedCount--;
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
      <p class="muted">
        {reviewedCount === 0
          ? 'Come back later. New cards and reviews will be waiting.'
          : `You reviewed ${reviewedCount} card${reviewedCount === 1 ? '' : 's'}. See you on the next round.`}
      </p>
      <div class="actions">
        <a class="btn primary" href={href({ name: 'decks' })}>Back to decks</a>
      </div>
    </div>
  {/if}
</div>
