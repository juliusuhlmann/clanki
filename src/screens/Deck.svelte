<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db';
  import { deckCounts, formatInterval, State } from '../lib/scheduler';
  import { createCard, updateCard, deleteCard } from '../lib/store';
  import { href } from '../lib/router.svelte';

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
    return $cards.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
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

  function dueLabel(due: number, state: number): string {
    if (state === State.New) return 'new';
    const diff = due - Date.now();
    return diff <= 0 ? 'due now' : `due in ${formatInterval(diff)}`;
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
  <div class="title-row">
    <h1>{$deck.name}</h1>
    {#if $counts}
      <a
        class="btn primary"
        class:disabled={$counts.due + $counts.new === 0}
        href={href({ name: 'review', deckId })}>Study ({$counts.due + $counts.new})</a
      >
    {/if}
  </div>

  <form class="panel card-form" onsubmit={addCard}>
    <h2>Add card</h2>
    <label>
      Front
      <textarea bind:this={frontInput} bind:value={front} rows="2" onkeydown={submitOnCtrlEnter}></textarea>
    </label>
    <label>
      Back
      <textarea bind:value={back} rows="3" onkeydown={submitOnCtrlEnter}></textarea>
    </label>
    <button class="btn primary" type="submit" disabled={!front.trim() || !back.trim()}>Add card</button>
  </form>

  <div class="title-row">
    <h2>Cards ({$cards?.length ?? 0})</h2>
  </div>
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
              <button class="btn primary" type="submit">Save</button>
              <button class="btn" type="button" onclick={() => (editingId = null)}>Cancel</button>
            </div>
          </form>
        {:else if confirmDeleteId === card.id}
          <p>Delete this card and its review history?</p>
          <div class="row">
            <button
              class="btn danger"
              onclick={async () => {
                await deleteCard(card.id);
                confirmDeleteId = null;
              }}>Delete</button
            >
            <button class="btn" onclick={() => (confirmDeleteId = null)}>Cancel</button>
          </div>
        {:else}
          <div class="card-text">
            <p class="front">{card.front}</p>
            <p class="back-text">{card.back}</p>
          </div>
          <div class="row card-meta">
            <span class="muted small">{dueLabel(card.due, card.fsrs.state)}</span>
            <span class="spacer"></span>
            <button
              class="btn small"
              onclick={() => {
                editingId = card.id;
                editFront = card.front;
                editBack = card.back;
              }}>Edit</button
            >
            <button class="btn small" onclick={() => (confirmDeleteId = card.id)}>Delete</button>
          </div>
        {/if}
      </li>
    {:else}
      {#if $cards && $cards.length > 0}
        <p class="muted">No cards match "{query}".</p>
      {:else if $cards}
        <p class="muted">No cards yet. Add one above.</p>
      {/if}
    {/each}
  </ul>
{/if}
