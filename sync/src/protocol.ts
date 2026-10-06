// The sync protocol between the app and the sync worker, plus the merge rule both sides use.
// Every synced thing is a record identified by (kind, id); the newer updatedAt wins, ties keep
// what is already there, and deletions are records too (tombstones) so they win the same way.

export const KINDS = ['deck', 'card', 'review', 'libraryRun'] as const;
export type Kind = (typeof KINDS)[number];

export interface SyncRecord {
  kind: Kind;
  id: string;
  /** ms timestamp of the change (for a tombstone: when it was deleted). */
  updatedAt: number;
  deleted: boolean;
  /** The record as stored in the app's database; null for tombstones. */
  data: unknown;
}

export interface SyncRequest {
  /** Server cursor from the last sync: changes after it come back. 0 on a device's first sync. */
  since: number;
  changes: SyncRecord[];
}

export interface SyncResponse {
  cursor: number;
  changes: SyncRecord[];
  /** More changes are waiting after `cursor`. */
  more: boolean;
}

/** Most changes a client sends per request, and most a server returns per page. */
export const MAX_PUSH = 500;
export const PAGE_SIZE = 1000;

/** Whether an incoming version should replace the stored one. */
export function wins(incoming: { updatedAt: number }, stored: { updatedAt: number } | undefined): boolean {
  return stored === undefined || incoming.updatedAt > stored.updatedAt;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates a request body; throws a short message if it isn't one. */
export function parseRequest(body: unknown): SyncRequest {
  if (!isObj(body)) throw new Error('body must be an object');
  const { since, changes } = body;
  if (typeof since !== 'number' || !Number.isInteger(since) || since < 0) throw new Error('bad "since"');
  if (!Array.isArray(changes) || changes.length > MAX_PUSH) throw new Error(`"changes" must be an array of at most ${MAX_PUSH}`);
  for (const c of changes) {
    if (
      !isObj(c) ||
      !KINDS.includes(c.kind as Kind) ||
      typeof c.id !== 'string' ||
      c.id === '' ||
      c.id.length > 300 ||
      typeof c.updatedAt !== 'number' ||
      !Number.isFinite(c.updatedAt) ||
      typeof c.deleted !== 'boolean' ||
      (c.deleted ? c.data !== null : !isObj(c.data))
    ) {
      throw new Error('bad change');
    }
  }
  return { since, changes: changes as SyncRecord[] };
}

/** The server's behaviour in memory: what the worker does with D1. Used by tests. */
export class MemoryServer {
  private rows = new Map<string, SyncRecord & { seq: number }>();
  private seq = 0;

  handle(request: SyncRequest): SyncResponse {
    const req = parseRequest(JSON.parse(JSON.stringify(request)));
    for (const c of req.changes) {
      const key = `${c.kind}|${c.id}`;
      if (wins(c, this.rows.get(key))) this.rows.set(key, { ...c, seq: ++this.seq });
    }
    const after = [...this.rows.values()].filter((r) => r.seq > req.since).sort((a, b) => a.seq - b.seq);
    const page = after.slice(0, PAGE_SIZE);
    return {
      cursor: page.length ? page[page.length - 1].seq : req.since,
      changes: page.map(({ seq: _seq, ...r }) => r),
      more: after.length > PAGE_SIZE,
    };
  }
}
