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
  const best = liveQuery(async () => {
    const row = await db.settings.get('runnerBestLetters');
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

<!-- The library run: a lamp over a shelf at the bottom; the deck list scrolls behind it. -->
<div class="lamp-dock">
  <div class="lamp-shelf"></div>
  <a class="lamp-run" href={href({ name: 'practiceRun' })} aria-label="Library run">
    <div class="lamp-swing">
      <div class="lamp-cone"></div>
      <svg class="lamp-svg" viewBox="0 0 100 80" aria-hidden="true">
        <defs>
          <linearGradient id="lamp-cord" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3a2a1e" stop-opacity="0" />
            <stop offset="1" stop-color="#3a2a1e" />
          </linearGradient>
          <!-- Polished brass: dark edges, a bright band left of centre. -->
          <linearGradient id="lamp-brass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#4f3512" />
            <stop offset="0.3" stop-color="#e9c877" />
            <stop offset="0.45" stop-color="#b98d3c" />
            <stop offset="0.8" stop-color="#7a5620" />
            <stop offset="1" stop-color="#3f2a0e" />
          </linearGradient>
          <linearGradient id="lamp-shadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1c1208" stop-opacity="0.45" />
            <stop offset="0.6" stop-color="#1c1208" stop-opacity="0" />
          </linearGradient>
          <!-- The lit inside of the shade, seen from slightly below. -->
          <radialGradient id="lamp-inside" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#fffaf0" />
            <stop offset="0.35" stop-color="#ffe2a6" />
            <stop offset="1" stop-color="#c98a35" />
          </radialGradient>
          <radialGradient id="lamp-halo">
            <stop offset="0" stop-color="#ffd98f" stop-opacity="0.55" />
            <stop offset="1" stop-color="#ffd98f" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="58" r="34" fill="url(#lamp-halo)" />
        <rect x="49.2" y="-14" width="1.6" height="36" fill="url(#lamp-cord)" />
        <!-- Fitting: a small cap and collar. -->
        <rect x="45.5" y="20" width="9" height="6" rx="2" fill="url(#lamp-brass)" />
        <rect x="43.5" y="25" width="13" height="2.4" rx="1.2" fill="#8a6528" />
        <!-- The flared bell shade. -->
        <path
          d="M50 26.5 C44.5 26.5 41.5 27.8 40.5 30.5 L16 55.5 L84 55.5 L59.5 30.5 C58.5 27.8 55.5 26.5 50 26.5 Z"
          fill="url(#lamp-brass)"
        />
        <path
          d="M50 26.5 C44.5 26.5 41.5 27.8 40.5 30.5 L16 55.5 L84 55.5 L59.5 30.5 C58.5 27.8 55.5 26.5 50 26.5 Z"
          fill="url(#lamp-shadow)"
        />
        <!-- Specular streak on the brass. -->
        <path d="M40.5 33 L26 49" stroke="#fff3d0" stroke-opacity="0.55" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <!-- Glowing inside and the rolled rim. -->
        <ellipse cx="50" cy="56" rx="34" ry="4.4" fill="url(#lamp-inside)" />
        <ellipse cx="50" cy="56" rx="34" ry="4.4" fill="none" stroke="#d6ae5c" stroke-width="1.3" />
        <ellipse cx="50" cy="55.6" rx="8" ry="2.2" fill="#ffffff" />
      </svg>
    </div>
    <div class="lamp-pool"></div>
    <span class="lamp-label">
      <span class="lamp-title">Library run</span>
      <span class="lamp-best">{$best ? `Best: ${$best} letters` : 'Start a run'}</span>
    </span>
  </a>
</div>
