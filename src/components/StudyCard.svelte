<script lang="ts">
  import type { Card } from '../lib/db';
  import { Rating, type Grade } from '../lib/scheduler';

  let {
    card,
    deckName,
    number,
    revealed,
    intervals,
    paused = false,
    onreveal,
    onanswer,
  }: {
    card: Card;
    deckName: string;
    /** Position in the session, shown in the card's corner. */
    number: number;
    revealed: boolean;
    intervals: Record<Grade, string> | null;
    /** Ignore the keyboard, e.g. while a runner run is on screen. */
    paused?: boolean;
    onreveal: () => void;
    onanswer: (grade: Grade) => void;
  } = $props();

  const BUTTONS: { grade: Grade; label: string; key: string }[] = [
    { grade: Rating.Again, label: 'Again', key: '1' },
    { grade: Rating.Hard, label: 'Hard', key: '2' },
    { grade: Rating.Good, label: 'Good', key: '3' },
    { grade: Rating.Easy, label: 'Easy', key: '4' },
  ];

  function onKeydown(e: KeyboardEvent) {
    if (paused) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      onreveal();
      return;
    }
    const button = BUTTONS.find((b) => b.key === e.key);
    if (revealed && button) {
      e.preventDefault();
      onanswer(button.grade);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<article class="catalog-card">
  <div class="catalog-head">
    <span>{deckName}</span>
    <span>No. {number}</span>
  </div>
  <div class="catalog-body">
    <p class="front">{card.front}</p>
    {#if revealed}
      <p class="answer">{card.back}</p>
    {/if}
  </div>
</article>

<div class="answer-bar">
  {#if !revealed}
    <button class="btn primary wide" onclick={onreveal}>Show answer <kbd>Space</kbd></button>
  {:else if intervals}
    {#each BUTTONS as b (b.grade)}
      <button class="btn grade grade-{b.label.toLowerCase()}" onclick={() => onanswer(b.grade)}>
        <span class="grade-label">{b.label}</span>
        <span class="grade-interval">{intervals[b.grade]}</span>
        <kbd>{b.key}</kbd>
      </button>
    {/each}
  {/if}
</div>
