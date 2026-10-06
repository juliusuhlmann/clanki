<script lang="ts">
  import { onMount } from 'svelte';
  import { db, getSetting, type Card } from '../lib/db';
  import { buildQueue, previewIntervals, rate, Rating, Session, type Grade } from '../lib/scheduler';
  import { href } from '../lib/router.svelte';
  import { earnedSeconds, nextGap, runSeconds } from '../game/reward';
  import RunnerGame from '../components/RunnerGame.svelte';
  import Firefly from '../components/Firefly.svelte';
  import Orb from '../components/Orb.svelte';

  let { deckId }: { deckId: string } = $props();

  const BUTTONS: { grade: Grade; label: string; key: string }[] = [
    { grade: Rating.Again, label: 'Again', key: '1' },
    { grade: Rating.Hard, label: 'Hard', key: '2' },
    { grade: Rating.Good, label: 'Good', key: '3' },
    { grade: Rating.Easy, label: 'Easy', key: '4' },
  ];

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

  // Runner game between cards. Only ratings feed in; the game never affects scheduling.
  let gamesEnabled = $state(false);
  let gap = $state(nextGap());
  let ratingsSinceRun = $state<number[]>([]);
  let playing = $state(false);
  let run = $state({ seconds: 0, earned: 0 });
  /** "+4s" feedback after an answer that earned run time; key restarts the animation. */
  let toast = $state<{ text: string; key: number } | null>(null);

  const meterProgress = $derived(Math.min(1, ratingsSinceRun.length / gap));
  const cardsToRun = $derived(Math.max(0, gap - ratingsSinceRun.length));

  onMount(async () => {
    deckName = (await db.decks.get(deckId))?.name ?? '';
    gamesEnabled = await getSetting('gamesEnabled', true);
    session = new Session(await buildQueue(deckId, Date.now()));
    loading = false;
    showNext();
  });

  function startRun() {
    run = { seconds: runSeconds(ratingsSinceRun), earned: earnedSeconds(ratingsSinceRun) };
    playing = true;
  }

  function endRun() {
    playing = false;
    ratingsSinceRun = [];
    gap = nextGap();
    // Don't count the break as thinking time for the current card.
    shownAt = Date.now();
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
      session.answered(updated, now);
      reviewedCount++;
      ratingsSinceRun = [...ratingsSinceRun, grade];
      const gained = earnedSeconds([grade]);
      if (gamesEnabled && gained > 0) toast = { text: `+${gained}s`, key: now };
      showNext();
      if (gamesEnabled && current && ratingsSinceRun.length >= gap) startRun();
    } finally {
      busy = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (playing) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      reveal();
      return;
    }
    const button = BUTTONS.find((b) => b.key === e.key);
    if (revealed && button) {
      e.preventDefault();
      answer(button.grade);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="review">
  <div class="review-top">
    <a class="back" href={href({ name: 'deck', deckId })} aria-label="Back to deck">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </a>
    {#if current && gamesEnabled}
      <!-- Run meter: the glowing orb travels toward the next library run. -->
      <div class="run-meter" aria-label="{cardsToRun} cards until the next library run">
        <div class="run-meter-track">
          <div class="run-meter-fill" style="width: {meterProgress * 100}%"></div>
          <span class="run-meter-spark" style="left: {meterProgress * 100}%"><Orb size={14} /></span>
          {#key toast?.key}
            {#if toast}<span class="earned-toast">{toast.text}</span>{/if}
          {/key}
        </div>
        <div class="run-meter-label">
          <span>{cardsToRun === 0 ? 'Run next!' : `Run in ${cardsToRun} card${cardsToRun === 1 ? '' : 's'}`}</span>
          <span>{runSeconds(ratingsSinceRun)}s banked</span>
        </div>
      </div>
    {:else}
      <span class="spacer"></span>
    {/if}
    {#if current}<span class="muted small">{remaining} left</span>{/if}
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if current}
    <article class="catalog-card">
      <div class="catalog-head">
        <span>{deckName}</span>
        <span>No. {reviewedCount + 1}</span>
      </div>
      <div class="catalog-body">
        <p class="front">{current.front}</p>
        {#if revealed}
          <p class="answer">{current.back}</p>
        {/if}
      </div>
    </article>

    <div class="answer-bar">
      {#if !revealed}
        <button class="btn primary wide" onclick={reveal}>Show answer <kbd>Space</kbd></button>
      {:else if intervals}
        {#each BUTTONS as b (b.grade)}
          <button class="btn grade grade-{b.label.toLowerCase()}" onclick={() => answer(b.grade)}>
            <span class="grade-label">{b.label}</span>
            <span class="grade-interval">{intervals[b.grade]}</span>
            <kbd>{b.key}</kbd>
          </button>
        {/each}
      {/if}
    </div>
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
        {#if gamesEnabled && ratingsSinceRun.length >= 3}
          <button class="btn primary" onclick={startRun}>Bonus library run · {runSeconds(ratingsSinceRun)}s</button>
        {/if}
        <a class="btn" class:primary={!(gamesEnabled && ratingsSinceRun.length >= 3)} href={href({ name: 'decks' })}
          >Back to decks</a
        >
      </div>
    </div>
  {/if}
</div>

{#if playing}
  <RunnerGame seconds={run.seconds} onfinish={endRun} />
{/if}
