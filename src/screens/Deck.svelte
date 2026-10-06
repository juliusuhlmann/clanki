<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db, type Card } from '../lib/db';
  import { deckCounts, formatInterval, retrievability, State } from '../lib/scheduler';
  import { createCard, updateCard, deleteCard } from '../lib/store';
  import { href } from '../lib/router.svelte';
  import { renderCardText, searchableText } from '../lib/cardText';
  import Firefly from '../components/Firefly.svelte';

  let { deckId }: { deckId: string } = $props();

  const deck = liveQuery(() => db.decks.get(deckId));
  const cards = liveQuery(() => db.cards.where('deckId').equals(deckId).reverse().sortBy('createdAt'));
  const counts = liveQuery(() => deckCounts(deckId, Date.now()));

  let front = $state('');
  let back = $state('');
  let query = $state('');
  let editingId = $state<string | null>(null);
  let editFront = $state('');
  let editBack = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let frontInput: HTMLTextAreaElement | undefined = $state();

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!$cards) return [];
    if (!q) return $cards;
    return $cards.filter((c) => searchableText(c.front).includes(q) || searchableText(c.back).includes(q));
  });

  async function addCard(e: SubmitEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await createCard(deckId, front, back);
    front = '';
    back = '';
    frontInput?.focus();
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (editingId && editFront.trim() && editBack.trim()) await updateCard(editingId, editFront, editBack);
    editingId = null;
  }

  function dueLabel(card: Card): string {
    if (card.fsrs.state === State.New) return 'new';
    const now = Date.now();
    const diff = card.due - now;
    const due = diff <= 0 ? 'due now' : `due in ${formatInterval(diff)}`;
    const r = retrievability(card, now);
    return r === null ? due : `${due} · ${Math.round(r * 100)}% recall`;
  }

  // Year is only shown for cards added in an earlier year.
  function addedLabel(createdAt: number): string {
    const date = new Date(createdAt);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return `added ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}`;
  }

  // Ctrl/Cmd+Enter submits the add form from either textarea.
  function submitOnCtrlEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }
</script>

<a class="back" href={href({ name: 'decks' })}>← Decks</a>

{#if $deck === undefined && $cards !== undefined}
  <p class="muted">This deck doesn't exist anymore.</p>
{:else if $deck}
  <div class="page-head title-row">
    <div>
      <h1>{$deck.name}</h1>
      {#if $counts}
        <p class="muted small">
          {$counts.total} card{$counts.total === 1 ? '' : 's'}
          {#if $counts.due + $counts.new > 0}· {$counts.due + $counts.new} to study today{/if}
        </p>
      {/if}
    </div>
    {#if $counts && $counts.due + $counts.new > 0}
      <a class="btn primary" href={href({ name: 'review', deckId })}>Study</a>
    {/if}
  </div>

  <form class="panel card-form" onsubmit={addCard}>
    <h2>New card</h2>
    <label>
      Front
      <textarea bind:this={frontInput} bind:value={front} rows="2" placeholder="Question or term" onkeydown={submitOnCtrlEnter}></textarea>
    </label>
    <label>
      Back
      <textarea bind:value={back} rows="3" placeholder="Answer" onkeydown={submitOnCtrlEnter}></textarea>
    </label>
    <div class="row">
      <button class="btn primary" type="submit" disabled={!front.trim() || !back.trim()}>Add card</button>
      <span class="muted small"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
    </div>
  </form>

  <p class="section-label">Cards</p>
  {#if $cards && $cards.length > 0}
    <input type="search" bind:value={query} placeholder="Search cards" aria-label="Search cards" />
  {/if}

  <ul class="list">
    {#each filtered as card (card.id)}
      <li class="panel">
        {#if editingId === card.id}
          <form class="card-form" onsubmit={saveEdit}>
            <label>Front <textarea bind:value={editFront} rows="2"></textarea></label>
            <label>Back <textarea bind:value={editBack} rows="3"></textarea></label>
            <div class="row">
              <button class="btn primary small" type="submit">Save</button>
              <button class="btn ghost small" type="button" onclick={() => (editingId = null)}>Cancel</button>
            </div>
          </form>
        {:else if confirmDeleteId === card.id}
          <div class="confirm">
            <p>Delete this card and its review history?</p>
            <div class="row">
              <button
                class="btn danger small"
                onclick={async () => {
                  await deleteCard(card.id);
                  confirmDeleteId = null;
                }}>Delete</button
              >
              <button class="btn ghost small" onclick={() => (confirmDeleteId = null)}>Cancel</button>
            </div>
          </div>
        {:else}
          <div class="card-row">
            <div class="card-text">
              <p class="front">{@html renderCardText(card.front)}</p>
              <p class="back-text">{@html renderCardText(card.back)}</p>
              <p class="due-label">{dueLabel(card)} · {addedLabel(card.createdAt)}</p>
            </div>
            <button
              class="btn ghost small"
              onclick={() => {
                editingId = card.id;
                editFront = card.front;
                editBack = card.back;
              }}>Edit</button
            >
            <button class="btn ghost small" aria-label="Delete card" onclick={() => (confirmDeleteId = card.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          </div>
        {/if}
      </li>
    {:else}
      {#if $cards && $cards.length > 0}
        <p class="muted">No cards match "{query}".</p>
      {:else if $cards}
        <div class="empty panel">
          <Firefly size={36} />
          <p>No cards yet. Add your first one above.</p>
        </div>
      {/if}
    {/each}
  </ul>
{/if}
