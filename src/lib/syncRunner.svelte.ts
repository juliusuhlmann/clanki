import Dexie from 'dexie';
import { db, getSetting } from './db';
import { syncRepoDecks } from './repoDecks';
import { httpTransport, KEY_SETTING, LAST_SYNC, pendingCount, SyncError, syncOnce } from './sync';

// Runs sync in the app: when it starts, when the device comes online or back to the foreground,
// and a few seconds after cards are studied or changed. Status is shown in Settings.

/** The sync worker (sync/, deployed to Cloudflare); VITE_SYNC_URL points a dev build at a local one. */
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL ?? 'https://clanki-sync.juliusuhlmann.workers.dev/sync';

export const syncStatus = $state({
  linked: false,
  syncing: false,
  lastAt: 0,
  pending: 0,
  error: '',
});

let running: Promise<void> | null = null;
let again = false;

/** Syncs now (or right after a sync that is already running). Never throws; errors go to syncStatus. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncRound();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncRound(): Promise<void> {
  const key = await getSetting(KEY_SETTING, '');
  syncStatus.linked = key !== '';
  if (!key || !navigator.onLine) {
    await refreshStatus();
    return;
  }
  syncStatus.syncing = true;
  try {
    await syncOnce(httpTransport(SYNC_URL, key));
    syncStatus.error = '';
  } catch (err) {
    syncStatus.error = err instanceof SyncError ? err.message : 'Sync failed.';
    console.warn('Sync failed', err);
  } finally {
    syncStatus.syncing = false;
    await refreshStatus();
  }
}

export async function refreshStatus(): Promise<void> {
  syncStatus.linked = (await getSetting(KEY_SETTING, '')) !== '';
  syncStatus.lastAt = await getSetting<number>(LAST_SYNC, 0);
  syncStatus.pending = syncStatus.linked ? await pendingCount() : 0;
}

const SYNCED_TABLES = ['decks', 'cards', 'reviews', 'libraryRuns', 'deletions'];
let debounce: ReturnType<typeof setTimeout> | undefined;

/** Starts syncing for the app's lifetime. Call once, after mounting. */
export async function startSync(): Promise<void> {
  // Pull first, so decks from the repo are merged on top of what other devices already did.
  await syncNow();
  await syncRepoDecks();
  void syncNow();

  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncNow();
  });
  // While the app is open: retries after a failure, and picks up what the other device did.
  setInterval(() => {
    if (!document.hidden) void syncNow();
  }, 60_000);
  // A few seconds after studying or editing; sync's own settings writes don't count.
  Dexie.on('storagemutated', (parts) => {
    const touched = Object.keys(parts).some((part) => SYNCED_TABLES.some((t) => part.startsWith(`idb://${db.name}/${t}/`)));
    if (!touched) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 3000);
  });
}
