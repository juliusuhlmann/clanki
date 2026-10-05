<script lang="ts">
  import { onMount } from 'svelte';
  import { db, getSetting, type Card } from '../lib/db';
  import { buildQueue, previewIntervals, rate, Rating, Session, type Grade } from '../lib/scheduler';
  import { href } from '../lib/router.svelte';
  import { earnedSeconds, nextGap, runSeconds } from '../game/reward';
  import RunnerGame from '../components/RunnerGame.svelte';
  import Mark from '../components/Mark.svelte';

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
  let gap = nextGap();
  let ratingsSinceRun = $state<number[]>([]);
  let playing = $state(false);
  let run = $state({ seconds: 0, earned: 0 });

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
  <div class="title-row">
    <a class="back" href={href({ name: 'deck', deckId })}>← {deckName || 'Deck'}</a>
    {#if current}<span class="muted small">{remaining} left</span>{/if}
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if current}
    <div class="flashcard panel">
      <p class="front">{current.front}</p>
      {#if revealed}
        <hr />
        <p class="answer">{current.back}</p>
      {/if}
    </div>

    <div class="answer-bar">
      {#if !revealed}
        <button class="btn primary wide" onclick={reveal}>Show answer <kbd>Space</kbd></button>
      {:else if intervals}
        {#each BUTTONS as b (b.grade)}
          <button class="btn grade grade-{b.label.toLowerCase()}" onclick={() => answer(b.grade)}>
            <span class="grade-interval">{intervals[b.grade]}</span>
            <span>{b.label}</span>
            <kbd>{b.key}</kbd>
          </button>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="done panel">
      <Mark size={64} class="spark" />
      <h2>Done for today</h2>
      <p class="muted">
        {reviewedCount === 0
          ? 'Nothing due right now.'
          : `You reviewed ${reviewedCount} card${reviewedCount === 1 ? '' : 's'}.`}
      </p>
      {#if gamesEnabled && ratingsSinceRun.length >= 3}
        <button class="btn primary" onclick={startRun}>
          Bonus run ({runSeconds(ratingsSinceRun)}s)
        </button>
      {/if}
      <a class="btn" class:primary={!(gamesEnabled && ratingsSinceRun.length >= 3)} href={href({ name: 'decks' })}
        >Back to decks</a
      >
    </div>
  {/if}
</div>

{#if playing}
  <RunnerGame seconds={run.seconds} earned={run.earned} onfinish={endRun} />
{/if}
