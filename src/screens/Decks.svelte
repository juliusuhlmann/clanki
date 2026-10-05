<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db';
  import { deckCounts } from '../lib/scheduler';
  import { createDeck, renameDeck, deleteDeck } from '../lib/store';
  import { href } from '../lib/router.svelte';
  import Mark from '../components/Mark.svelte';

  // Re-runs whenever the decks, cards, reviews or settings it reads change.
  const decks = liveQuery(async () => {
    const all = await db.decks.orderBy('name').toArray();
    const now = Date.now();
    return Promise.all(all.map(async (deck) => ({ deck, counts: await deckCounts(deck.id, now) })));
  });
  const best = liveQuery(async () => {
    const row = await db.settings.get('runnerBest');
    return typeof row?.value === 'number' ? row.value : 0;
  });

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Burning the midnight oil' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const totalToday = $derived(($decks ?? []).reduce((sum, d) => sum + d.counts.due + d.counts.new, 0));

  let adding = $state(false);
  let newName = $state('');
  let menuId = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let confirmDeleteId = $state<string | null>(null);

  async function addDeck(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createDeck(newName);
    newName = '';
    adding = false;
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

<svelte:window onclick={() => (menuId = null)} />

<div class="page-head">
  <h1>{greeting}</h1>
  <p class="muted">
    {#if $decks === undefined}
      &nbsp;
    {:else if $decks.length === 0}
      Create a deck to start filling the library.
    {:else if totalToday === 0}
      You're all caught up. Nothing due right now.
    {:else}
      {totalToday} card{totalToday === 1 ? '' : 's'} waiting for you today.
    {/if}
  </p>
</div>

<a class="run-tile" href={href({ name: 'practiceRun' })}>
  <Mark size={38} class="mark" />
  <div>
    <h3>Library run</h3>
    <p>{$best ? `Best ${$best} m · ` : ''}Practice anytime. Earned every 6–10 cards.</p>
  </div>
  <span class="go" aria-hidden="true">→</span>
</a>

<p class="section-label">Decks</p>

{#if $decks && $decks.length === 0}
  <div class="empty panel">
    <Mark size={40} />
    <p>No decks yet.</p>
  </div>
{:else if $decks}
  <ul class="list">
    {#each $decks as { deck, counts } (deck.id)}
      <li class="panel deck">
        {#if editingId === deck.id}
          <form class="row" style="flex:1" onsubmit={saveRename}>
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={editName} aria-label="Deck name" autofocus style="flex:1;width:auto" />
            <button class="btn primary" type="submit">Save</button>
            <button class="btn ghost" type="button" onclick={() => (editingId = null)}>Cancel</button>
          </form>
        {:else if confirmDeleteId === deck.id}
          <div class="confirm">
            <p>Delete <strong>{deck.name}</strong> and its {counts.total} cards? This can't be undone.</p>
            <div class="row">
              <button class="btn danger small" onclick={() => confirmDelete(deck.id)}>Delete deck</button>
              <button class="btn ghost small" onclick={() => (confirmDeleteId = null)}>Cancel</button>
            </div>
          </div>
        {:else}
          <a class="deck-main" href={href({ name: 'deck', deckId: deck.id })}>
            <span class="deck-name">{deck.name}</span>
            <span class="deck-meta">
              {#if counts.due}<span class="pill due">{counts.due} due</span>{/if}
              {#if counts.new}<span class="pill new">{counts.new} new</span>{/if}
              <span>{counts.total} card{counts.total === 1 ? '' : 's'}</span>
            </span>
          </a>
          {#if counts.due + counts.new > 0}
            <a class="btn primary small" href={href({ name: 'review', deckId: deck.id })}>Study</a>
          {/if}
          <div class="menu-wrap">
            <button
              class="icon-btn"
              aria-label="Deck options"
              onclick={(e) => {
                e.stopPropagation();
                menuId = menuId === deck.id ? null : deck.id;
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
            {#if menuId === deck.id}
              <div class="menu" role="menu">
                <button
                  role="menuitem"
                  onclick={() => {
                    editingId = deck.id;
                    editName = deck.name;
                  }}>Rename</button
                >
                <button role="menuitem" class="danger-text" onclick={() => (confirmDeleteId = deck.id)}>Delete</button>
              </div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if adding}
  <form class="add-row" onsubmit={addDeck}>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={newName} placeholder="Deck name, e.g. Analysis 1" aria-label="New deck name" autofocus />
    <button class="btn primary" type="submit" disabled={!newName.trim()}>Add</button>
    <button class="btn ghost" type="button" onclick={() => (adding = false)}>Cancel</button>
  </form>
{:else}
  <button class="add-trigger" onclick={() => (adding = true)}>+ New deck</button>
{/if}
