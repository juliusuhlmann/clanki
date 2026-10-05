import './style.css';
import { registerSW } from 'virtual:pwa-register';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="shell">
    <div class="spark" aria-hidden="true"></div>
    <h1>Clanki</h1>
    <p class="tagline">Flashcards, with a little run in between.</p>
    <p class="status" id="status"></p>
    <p class="hint" id="hint"></p>
  </main>
`;

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const hint = document.querySelector<HTMLParagraphElement>('#hint')!;

function updateOnlineStatus() {
  status.textContent = navigator.onLine ? 'Online' : 'Offline – and still working';
  status.dataset.state = navigator.onLine ? 'online' : 'offline';
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

const installed = window.matchMedia('(display-mode: standalone)').matches;
hint.textContent = installed
  ? 'Running as an installed app.'
  : 'Tip: in Chrome, open the menu and choose "Install app" (or "Add to Home screen").';

registerSW({
  immediate: true,
  onOfflineReady() {
    hint.textContent = 'Ready to work offline.';
  },
});

// Ask the browser not to evict our storage (cards will live in IndexedDB later).
navigator.storage?.persist?.();
