<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db, topLibraryRuns } from '../lib/db';
  import { deckCounts, libraryRunSize } from '../lib/scheduler';
  import { createDeck, renameDeck, deleteDeck } from '../lib/store';
  import { href } from '../lib/router.svelte';
  import FlyingFirefly from '../components/FlyingFirefly.svelte';

  // Re-runs whenever the decks, cards, reviews or settings it reads change.
  const decks = liveQuery(async () => {
    const all = await db.decks.orderBy('name').toArray();
    const now = Date.now();
    return Promise.all(all.map(async (deck) => ({ deck, counts: await deckCounts(deck.id, now) })));
  });
  const best = liveQuery(async () => (await topLibraryRuns(1))[0]?.letters ?? 0);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Burning the midnight oil' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const totalToday = $derived(($decks ?? []).reduce((sum, d) => sum + d.counts.due + d.counts.new, 0));

  // The glow under the firefly follows it; set straight on the element, as it changes every frame.
  let runTile: HTMLAnchorElement | undefined = $state();
  function lightFollows(x: number, glow: number) {
    runTile?.style.setProperty('--fx', x.toFixed(3));
    runTile?.style.setProperty('--glow', glow.toFixed(3));
  }

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

{#if $decks && $decks.length > 0}
  <p class="section-label">Decks</p>
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
  <!-- With no decks yet, this one box is the whole empty state. -->
  <button class="add-trigger" class:first={$decks?.length === 0} onclick={() => (adding = true)}>
    {$decks?.length === 0 ? '+ Create your first deck' : '+ New deck'}
  </button>
{/if}

<!-- The library run: a firefly hovering at the bottom of the screen; the deck list scrolls behind it. -->
<div class="run-dock">
  <a class="run-tile" href={href({ name: 'libraryRun' })} aria-label="Library run" bind:this={runTile}>
    <div class="run-air"><FlyingFirefly size={34} onmove={lightFollows} /></div>
    <div class="run-pool"></div>
    <span class="run-label">
      <span class="run-title">Library run</span>
      <span class="run-best">
        {#if totalToday > 0}
          {libraryRunSize(totalToday)} cards{$best ? ` · Best: ${$best}` : ''}
        {:else}
          {$best ? `Best: ${$best} letters` : 'All caught up'}
        {/if}
      </span>
    </span>
  </a>
</div>
