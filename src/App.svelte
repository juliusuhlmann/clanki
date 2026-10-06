<script lang="ts">
  import { router, href, navigate } from './lib/router.svelte';
  import Decks from './screens/Decks.svelte';
  import Deck from './screens/Deck.svelte';
  import Review from './screens/Review.svelte';
  import Settings from './screens/Settings.svelte';
  import RunnerGame from './components/RunnerGame.svelte';
  import Firefly from './components/Firefly.svelte';

  let online = $state(navigator.onLine);
  const home = $derived(router.route.name === 'decks');
  $effect(() => {
    document.documentElement.classList.toggle('home', home);
  });
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<!-- On the home screen the greeting is the heading, so the bar only holds settings. -->
<header class="topbar" class:home>
  <div class="topbar-inner">
    {#if !home}
      <a class="brand" href={href({ name: 'decks' })}>
        <Firefly size={28} />
        Clanki
      </a>
    {/if}
    {#if !online}<span class="offline-pill">Offline</span>{/if}
    <a class="icon-btn" href={href({ name: 'settings' })} aria-label="Settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </a>
  </div>
</header>

<main class="content" class:home>
  {#if router.route.name === 'decks'}
    <Decks />
  {:else if router.route.name === 'deck'}
    {#key router.route.deckId}
      <Deck deckId={router.route.deckId} />
    {/key}
  {:else if router.route.name === 'review'}
    {#key router.route.deckId}
      <Review deckId={router.route.deckId} />
    {/key}
  {:else if router.route.name === 'settings'}
    <Settings />
  {:else if router.route.name === 'practiceRun'}
    <RunnerGame seconds={30} earned={0} practice onfinish={() => navigate({ name: 'decks' })} />
  {/if}
</main>
