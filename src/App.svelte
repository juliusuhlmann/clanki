<script lang="ts">
  import { router, href, navigate } from './lib/router.svelte';
  import Decks from './screens/Decks.svelte';
  import Deck from './screens/Deck.svelte';
  import Review from './screens/Review.svelte';
  import Settings from './screens/Settings.svelte';
  import RunnerGame from './components/RunnerGame.svelte';
  import Mark from './components/Mark.svelte';

  let online = $state(navigator.onLine);
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<header class="topbar">
  <a class="brand" href={href({ name: 'decks' })}>
    <Mark size={24} />
    Clanki
  </a>
  <span class="badge" data-state={online ? 'online' : 'offline'}>{online ? 'Online' : 'Offline'}</span>
  <a class="icon-link" href={href({ name: 'settings' })} aria-label="Settings">⚙</a>
</header>

<main class="content">
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
