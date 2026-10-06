import './style.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';

mount(App, { target: document.querySelector<HTMLDivElement>('#app')! });

registerSW({
  immediate: true,
  // An installed app is usually resumed from the background rather than restarted, so also
  // look for a new version whenever it comes back to the foreground. If there is one, the
  // service worker updates and the page reloads into it.
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) registration.update().catch(() => {});
    });
  },
});

// Ask the browser not to evict our storage (cards live in IndexedDB).
navigator.storage?.persist?.();
