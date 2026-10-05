<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db';
  import { deckCounts } from '../lib/scheduler';
  import { createDeck, renameDeck, deleteDeck } from '../lib/store';
  import { href } from '../lib/router.svelte';

  // Re-runs whenever the decks, cards, reviews or settings it reads change.
  const decks = liveQuery(async () => {
    const all = await db.decks.orderBy('name').toArray();
    const now = Date.now();
    return Promise.all(all.map(async (deck) => ({ deck, counts: await deckCounts(deck.id, now) })));
  });

  let newName = $state('');
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let confirmDeleteId = $state<string | null>(null);

  async function addDeck(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createDeck(newName);
    newName = '';
  }

  async function saveRename(e: SubmitEvent) {
    e.preventDefault();
    if (editingId && editName.trim()) await renameDeck(editingId, editName);
    editingId = null;
  }

  async function confirmDelete(id: string) {
    await deleteDeck(id);
    confirmDeleteId = null;
  }
</script>

<h1>Decks</h1>

{#if $decks === undefined}
  <p class="muted">Loading…</p>
{:else if $decks.length === 0}
  <p class="muted">No decks yet. Create your first one below.</p>
{:else}
  <ul class="list">
    {#each $decks as { deck, counts } (deck.id)}
      <li class="panel deck">
        {#if editingId === deck.id}
          <form class="row" onsubmit={saveRename}>
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={editName} aria-label="Deck name" autofocus />
            <button class="btn primary" type="submit">Save</button>
            <button class="btn" type="button" onclick={() => (editingId = null)}>Cancel</button>
          </form>
        {:else if confirmDeleteId === deck.id}
          <p>Delete <strong>{deck.name}</strong> and all {counts.total} cards? This can't be undone.</p>
          <div class="row">
            <button class="btn danger" onclick={() => confirmDelete(deck.id)}>Delete</button>
            <button class="btn" onclick={() => (confirmDeleteId = null)}>Cancel</button>
          </div>
        {:else}
          <a class="deck-main" href={href({ name: 'deck', deckId: deck.id })}>
            <span class="deck-name">{deck.name}</span>
            <span class="counts">
              <span class="count due" title="Due">{counts.due} due</span>
              <span class="count new" title="New today">{counts.new} new</span>
              <span class="muted">· {counts.total} cards</span>
            </span>
          </a>
          <div class="row">
            <a
              class="btn primary"
              class:disabled={counts.due + counts.new === 0}
              href={href({ name: 'review', deckId: deck.id })}>Study</a
            >
            <button
              class="btn"
              onclick={() => {
                editingId = deck.id;
                editName = deck.name;
              }}>Rename</button
            >
            <button class="btn" onclick={() => (confirmDeleteId = deck.id)}>Delete</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<form class="row add" onsubmit={addDeck}>
  <input bind:value={newName} placeholder="New deck name" aria-label="New deck name" />
  <button class="btn primary" type="submit" disabled={!newName.trim()}>Add deck</button>
</form>
