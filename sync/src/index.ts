// Clanki sync worker: one endpoint, POST /sync, storing records in D1 (schema.sql).
// Each request pushes the device's changes (the newer updatedAt wins) and returns everything
// changed since the device's cursor. Protected by a single shared key (secret SYNC_KEY).

import { PAGE_SIZE, parseRequest, type SyncRecord, type SyncResponse } from './protocol';

// The few D1 types used here, so the worker needs no extra type packages.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface Env {
  DB: D1Database;
  SYNC_KEY: string;
}

const ALLOWED_ORIGINS = ['https://juliusuhlmann.github.io'];
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};
}

/** Compares two strings in time independent of where they differ. */
function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

interface Row {
  kind: string;
  id: string;
  updated_at: number;
  deleted: number;
  data: string | null;
  seq: number;
}

// Insert, or replace only if newer; either way the row gets the next sequence number.
const UPSERT = `
  INSERT INTO records (kind, id, updated_at, deleted, data, seq)
  VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
  ON CONFLICT (kind, id) DO UPDATE SET
    updated_at = excluded.updated_at,
    deleted = excluded.deleted,
    data = excluded.data,
    seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM records)
  WHERE excluded.updated_at > records.updated_at`;

async function sync(env: Env, body: unknown): Promise<SyncResponse> {
  const req = parseRequest(body);
  if (req.changes.length) {
    await env.DB.batch(
      req.changes.map((c) =>
        env.DB.prepare(UPSERT).bind(c.kind, c.id, c.updatedAt, c.deleted ? 1 : 0, c.deleted ? null : JSON.stringify(c.data)),
      ),
    );
  }
  const { results } = await env.DB.prepare(
    'SELECT kind, id, updated_at, deleted, data, seq FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2',
  )
    .bind(req.since, PAGE_SIZE + 1)
    .all<Row>();
  const page = results.slice(0, PAGE_SIZE);
  return {
    cursor: page.length ? page[page.length - 1].seq : req.since,
    changes: page.map(
      (r): SyncRecord => ({
        kind: r.kind as SyncRecord['kind'],
        id: r.id,
        updatedAt: r.updated_at,
        deleted: r.deleted === 1,
        data: r.data === null ? null : JSON.parse(r.data),
      }),
    ),
    more: results.length > PAGE_SIZE,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(allowedOrigin(request.headers.get('Origin')));
    const json = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (new URL(request.url).pathname !== '/sync') return json(404, { error: 'not found' });
    if (request.method !== 'POST') return json(405, { error: 'use POST' });

    const auth = request.headers.get('Authorization') ?? '';
    if (!env.SYNC_KEY || !sameKey(auth, `Bearer ${env.SYNC_KEY}`)) return json(401, { error: 'wrong sync key' });

    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return json(413, { error: 'too large' });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'body must be JSON' });
    }
    try {
      return json(200, await sync(env, body));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Validation errors are the client's; anything else is ours.
      return json(/^(bad|body|"changes")/.test(message) ? 400 : 500, { error: message });
    }
  },
};
