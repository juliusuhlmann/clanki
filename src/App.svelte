<script lang="ts">
  import { router, href } from './lib/router.svelte';
  import Decks from './screens/Decks.svelte';
  import Deck from './screens/Deck.svelte';
  import Review from './screens/Review.svelte';
  import Settings from './screens/Settings.svelte';
  import RunnerGame from './components/RunnerGame.svelte';

  let online = $state(navigator.onLine);
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<header class="topbar">
  <a class="brand" href={href({ name: 'decks' })}>
    <span class="spark-icon" aria-hidden="true"></span>
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
  {:else if router.route.name === 'devRunner'}
    <RunnerGame seconds={40} earned={20} onfinish={() => history.back()} />
  {/if}
</main>
