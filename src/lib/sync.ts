import {
  MAX_BATCH_BYTES,
  MAX_PUSH,
  MAX_RECORD_BYTES,
  recordBytes,
  wins,
  type SyncRecord,
  type SyncRequest,
  type SyncResponse,
} from '../../sync/src/protocol';
import { isCard, isDeck, isReview } from './backup';
import { db as defaultDb, getSetting, reviewSyncId, setSetting, type ClankiDb, type Deletion, type LibraryRun } from './db';

// Syncing this device with the sync worker (sync/). Offline first: everything happens locally, and a
// sync sends what changed here since the last successful push and applies what changed elsewhere.
// Decks and cards are matched by id and the newer updatedAt wins; reviews and library runs are
// only ever added; deletions travel as tombstones (the `deletions` table until they're sent).
// Device-local state lives in settings: the key, the server cursor and how far we've pushed.

export type Transport = (request: SyncRequest) => Promise<SyncResponse>;

export const KEY_SETTING = 'syncKey';
const CURSOR = 'syncCursor';
const PUSHED_THROUGH = 'syncPushedThrough';
export const LAST_SYNC = 'syncLastAt';

/** Sends requests to the sync worker. Throws `SyncError` with a readable message on failure. */
export function httpTransport(url: string, key: string): Transport {
  return async (request) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new SyncError('Could not reach the sync server.');
    }
    if (res.status === 401) throw new SyncError('The sync key is wrong.');
    if (!res.ok) throw new SyncError(`The sync server answered ${res.status}.`);
    return (await res.json()) as SyncResponse;
  };
}

export class SyncError extends Error {}

const isLibraryRun = (v: unknown): v is LibraryRun =>
  typeof v === 'object' && v !== null && ['finishedAt', 'letters', 'cards'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');

/** Everything changed on this device at or after `since` (local ms time), plus pending deletions. */
export async function localChanges(since: number, database: ClankiDb = defaultDb): Promise<SyncRecord[]> {
  const [decks, cards, reviews, runs, deletions] = await Promise.all([
    database.decks.filter((d) => d.updatedAt >= since).toArray(),
    database.cards.filter((c) => c.updatedAt >= since).toArray(),
    database.reviews.where('reviewedAt').aboveOrEqual(since).toArray(),
    database.libraryRuns.where('finishedAt').aboveOrEqual(since).toArray(),
    database.deletions.toArray(),
  ]);
  return [
    ...decks.map((d): SyncRecord => ({ kind: 'deck', id: d.id, updatedAt: d.updatedAt, deleted: false, data: d })),
    ...cards.map((c): SyncRecord => ({ kind: 'card', id: c.id, updatedAt: c.updatedAt, deleted: false, data: c })),
    ...reviews.map(({ id: _id, ...r }): SyncRecord => ({ kind: 'review', id: reviewSyncId(r), updatedAt: r.reviewedAt, deleted: false, data: r })),
    ...runs.map(({ id: _id, ...r }): SyncRecord => ({ kind: 'libraryRun', id: String(r.finishedAt), updatedAt: r.finishedAt, deleted: false, data: r })),
    ...deletions.map((d): SyncRecord => ({ kind: d.kind, id: d.id, updatedAt: d.at, deleted: true, data: null })),
  ];
}

/** Applies changes from the server where they are newer than what this device has. */
export async function applyRemote(changes: SyncRecord[], database: ClankiDb = defaultDb): Promise<number> {
  let applied = 0;
  const tables = [database.decks, database.cards, database.reviews, database.libraryRuns, database.deletions];
  await database.transaction('rw', tables, async () => {
    for (const r of changes) {
      // A deletion here that hasn't been sent yet counts as this device's version.
      const pending = await database.deletions.get([r.kind, r.id]);
      if (r.kind === 'deck' || r.kind === 'card') {
        const table = r.kind === 'deck' ? database.decks : database.cards;
        const local = await table.get(r.id);
        const mine = pending ? { updatedAt: pending.at } : local;
        if (!wins(r, mine)) continue;
        if (r.deleted) {
          if (!local) continue;
          await table.delete(r.id);
        } else if (r.kind === 'deck' ? isDeck(r.data) : isCard(r.data)) {
          await (table as typeof database.cards).put(r.data as never);
          if (pending) await database.deletions.delete([r.kind, r.id]);
        } else continue;
        applied++;
      } else if (r.kind === 'review') {
        const sep = r.id.lastIndexOf('|');
        const key: [string, number] = [r.id.slice(0, sep), Number(r.id.slice(sep + 1))];
        const local = database.reviews.where('[cardId+reviewedAt]').equals(key);
        if (r.deleted) {
          if (await local.count()) {
            await local.delete();
            applied++;
          }
        } else if (!pending && isReview(r.data) && !(await local.count())) {
          await database.reviews.add(r.data);
          applied++;
        }
      } else if (r.kind === 'libraryRun') {
        const local = database.libraryRuns.where('finishedAt').equals(Number(r.id));
        if (r.deleted) {
          if (await local.count()) {
            await local.delete();
            applied++;
          }
        } else if (!pending && isLibraryRun(r.data) && !(await local.count())) {
          await database.libraryRuns.add(r.data);
          applied++;
        }
      }
    }
  });
  return applied;
}

/**
 * One full sync: pushes everything changed since the last successful push (in chunks), pulls
 * everything the server has after this device's cursor, and records both. Safe to repeat.
 */
export async function syncOnce(transport: Transport, database: ClankiDb = defaultDb): Promise<{ pushed: number; pulled: number }> {
  const startedAt = Date.now();
  // Records too big for the server (huge embedded images) are skipped; Settings shows how many.
  const changes = (await localChanges(await getSetting<number>(PUSHED_THROUGH, 0, database), database)).filter(
    (c) => recordBytes(c) <= MAX_RECORD_BYTES,
  );
  let cursor = await getSetting<number>(CURSOR, 0, database);
  let pulled = 0;
  let sent = 0;
  let more = false;
  do {
    const chunk = nextBatch(changes, sent);
    const res = await transport({ since: cursor, changes: chunk });
    sent += chunk.length;
    pulled += await applyRemote(res.changes, database);
    cursor = res.cursor;
    more = res.more;
    await setSetting(CURSOR, cursor, database);
  } while (sent < changes.length || more);

  // Sent deletions are on the server now; ones made during the sync stay for next time.
  const sentDeletions = changes.filter((c) => c.deleted).map((c): [Deletion['kind'], string] => [c.kind, c.id]);
  const stillPending = await database.deletions.bulkGet(sentDeletions);
  await database.deletions.bulkDelete(sentDeletions.filter((_, i) => (stillPending[i]?.at ?? Infinity) < startedAt));
  await setSetting(PUSHED_THROUGH, startedAt, database);
  await setSetting(LAST_SYNC, Date.now(), database);
  return { pushed: changes.length, pulled };
}

/** The next request's changes from `start` on: at most MAX_PUSH records and about MAX_BATCH_BYTES. */
function nextBatch(changes: SyncRecord[], start: number): SyncRecord[] {
  let bytes = 0;
  let end = start;
  while (end < changes.length && end - start < MAX_PUSH) {
    bytes += recordBytes(changes[end]);
    if (end > start && bytes > MAX_BATCH_BYTES) break;
    end++;
  }
  return changes.slice(start, end);
}

/** Cards too big to sync (over ~1.9 MB, i.e. huge embedded images); they stay on this device only. */
export async function tooLargeCount(database: ClankiDb = defaultDb): Promise<number> {
  const cards = await database.cards.toArray();
  return cards.filter((c) => recordBytes({ kind: 'card', id: c.id, updatedAt: c.updatedAt, deleted: false, data: c }) > MAX_RECORD_BYTES).length;
}

/** Changes on this device that haven't reached the server yet. */
export async function pendingCount(database: ClankiDb = defaultDb): Promise<number> {
  const changes = await localChanges(await getSetting<number>(PUSHED_THROUGH, 0, database), database);
  return changes.filter((c) => recordBytes(c) <= MAX_RECORD_BYTES).length;
}

/** Links this device: from now on it syncs with this key, starting with everything it has. */
export async function link(key: string, database: ClankiDb = defaultDb): Promise<void> {
  await setSetting(KEY_SETTING, key.trim(), database);
  await setSetting(CURSOR, 0, database);
  await setSetting(PUSHED_THROUGH, 0, database);
}

export async function unlink(database: ClankiDb = defaultDb): Promise<void> {
  await database.settings.bulkDelete([KEY_SETTING, CURSOR, PUSHED_THROUGH, LAST_SYNC]);
}
