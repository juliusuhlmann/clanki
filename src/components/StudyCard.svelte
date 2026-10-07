<script lang="ts">
  import type { Card } from '../lib/db';
  import { Rating, type Grade } from '../lib/scheduler';
  import { renderCardText } from '../lib/cardText';

  let {
    card,
    deckName,
    number,
    revealed,
    intervals,
    paused = false,
    onreveal,
    onanswer,
    onedit,
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
    /** Saves a fix to the card's text. */
    onedit: (front: string, back: string) => Promise<void>;
  } = $props();

  let editing = $state(false);
  let editFront = $state('');
  let editBack = $state('');

  // Cards from the repo's deck files get their text from the file again when it changes.
  const fromRepo = $derived(card.id.startsWith('repo-'));

  // A different card (e.g. after undo) closes the editor.
  $effect(() => {
    void card.id;
    editing = false;
  });

  function startEdit() {
    editFront = card.front;
    editBack = card.back;
    editing = true;
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!editFront.trim() || !editBack.trim()) return;
    await onedit(editFront, editBack);
    editing = false;
  }

  function editKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      editing = false;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }

  const BUTTONS: { grade: Grade; label: string; key: string }[] = [
    { grade: Rating.Again, label: 'Again', key: '1' },
    { grade: Rating.Hard, label: 'Hard', key: '2' },
    { grade: Rating.Good, label: 'Good', key: '3' },
    { grade: Rating.Easy, label: 'Easy', key: '4' },
  ];

  function onKeydown(e: KeyboardEvent) {
    if (paused || editing) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      startEdit();
      return;
    }
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

<!-- Tapping the card shows the answer, like the button (Space/Enter for the keyboard). -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article
  class="catalog-card"
  class:tappable={!revealed && !editing}
  onclick={(e) => {
    if (revealed || editing || (e.target as HTMLElement).closest('button, a')) return;
    onreveal();
  }}
>
  <div class="catalog-head">
    <span>{deckName}</span>
    <span class="catalog-head-end">
      No. {number}
      {#if !editing}
        <button class="card-edit" onclick={startEdit} aria-label="Edit card" title="Edit card (E)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      {/if}
    </span>
  </div>
  {#if editing}
    <form class="card-form card-edit-form" onsubmit={saveEdit}>
      <label>
        Front
        <!-- svelte-ignore a11y_autofocus -->
        <textarea bind:value={editFront} rows="2" onkeydown={editKeydown} autofocus></textarea>
      </label>
      <label>Back <textarea bind:value={editBack} rows="3" onkeydown={editKeydown}></textarea></label>
      {#if fromRepo}
        <p class="muted small">This card comes from a deck file in the repo. The next update of that file puts its text back, so fix it there too.</p>
      {/if}
      <div class="row">
        <button class="btn primary small" type="submit" disabled={!editFront.trim() || !editBack.trim()}>Save</button>
        <button class="btn ghost small" type="button" onclick={() => (editing = false)}>Cancel</button>
      </div>
    </form>
  {:else}
    <div class="catalog-body">
      <p class="front">{@html renderCardText(card.front)}</p>
      {#if revealed}
        <p class="answer">{@html renderCardText(card.back)}</p>
      {/if}
    </div>
  {/if}
</article>

<div class="answer-bar" class:hidden={editing}>
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
