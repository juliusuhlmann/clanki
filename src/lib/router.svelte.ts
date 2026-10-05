// Hash-based routing: each screen is a browser history entry, so Android's back button works.

export type Route =
  | { name: 'decks' }
  | { name: 'deck'; deckId: string }
  | { name: 'review'; deckId: string }
  | { name: 'settings' }
  /** Development only: opens the runner game directly. */
  | { name: 'devRunner' };

function parse(hash: string): Route {
  const [, screen, id] = hash.replace(/^#/, '').split('/');
  if (import.meta.env.DEV && screen === 'dev-runner') return { name: 'devRunner' };
  if (screen === 'deck' && id) return { name: 'deck', deckId: decodeURIComponent(id) };
  if (screen === 'review' && id) return { name: 'review', deckId: decodeURIComponent(id) };
  if (screen === 'settings') return { name: 'settings' };
  return { name: 'decks' };
}

export const router = $state({ route: parse(location.hash) });

window.addEventListener('hashchange', () => {
  router.route = parse(location.hash);
});

export function href(route: Route): string {
  switch (route.name) {
    case 'decks':
      return '#/';
    case 'deck':
      return `#/deck/${encodeURIComponent(route.deckId)}`;
    case 'review':
      return `#/review/${encodeURIComponent(route.deckId)}`;
    case 'settings':
      return '#/settings';
    case 'devRunner':
      return '#/dev-runner';
  }
}

export function navigate(route: Route): void {
  location.hash = href(route);
}
