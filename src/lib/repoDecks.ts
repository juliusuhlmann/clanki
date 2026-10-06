import { db as defaultDb, getSetting, setSetting, type Card, type ClankiDb } from './db';
import { newCardSchedule } from './scheduler';

// Decks kept as JSON files in the repo's `decks/` folder (written by an agent, see decks/README.md).
// They are bundled with the app, so they also work offline. When the app starts, each file whose
// content changed since the last sync is merged in: new cards are added, changed text is updated,
// and cards removed from the file are deleted. Review progress of existing cards is kept.

export interface RepoDeckFile {
  /** Stable id, e.g. "ma4801". The app deck's id is `repo-<id>`. */
  id: string;
  name: string;
  /** In study order: new cards are introduced in this order. */
  cards: { id: string; front: string; back: string }[];
}

const ID = /^[a-z0-9][a-z0-9_-]*$/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Validates a deck file; throws an error that names the file and the problem. */
export function parseRepoDeck(data: unknown, file: string): RepoDeckFile {
  const fail = (msg: string): never => {
    throw new Error(`${file}: ${msg}`);
  };
  if (!isObj(data)) fail('not a JSON object');
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || !ID.test(d.id)) fail('"id" must be letters, digits, "-" or "_"');
  if (!isText(d.name)) fail('"name" is missing');
  if (!Array.isArray(d.cards)) fail('"cards" must be an array');
  const seen = new Set<string>();
  const cards = (d.cards as unknown[]).map((c, i) => {
    if (!isObj(c)) return fail(`card ${i} is not an object`);
    if (typeof c.id !== 'string' || !ID.test(c.id)) fail(`card ${i}: "id" must be letters, digits, "-" or "_"`);
    if (seen.has(c.id as string)) fail(`card id "${String(c.id)}" is used twice`);
    seen.add(c.id as string);
    if (!isText(c.front) || !isText(c.back)) fail(`card "${String(c.id)}" needs a non-empty "front" and "back"`);
    return { id: c.id as string, front: (c.front as string).trim(), back: (c.back as string).trim() };
  });
  return { id: d.id as string, name: (d.name as string).trim(), cards };
}

export function repoDeckId(fileId: string): string {
  return `repo-${fileId}`;
}

/** Merges one deck file into the database. Cards added by hand to the deck in the app are left alone. */
export async function applyRepoDeck(
  file: RepoDeckFile,
  now: number,
  database: ClankiDb = defaultDb,
): Promise<{ added: number; updated: number; removed: number }> {
  const deckId = repoDeckId(file.id);
  const prefix = `${deckId}:`;
  const result = { added: 0, updated: 0, removed: 0 };

  await database.transaction('rw', database.decks, database.cards, database.reviews, async () => {
    const deck = await database.decks.get(deckId);
    if (!deck) await database.decks.add({ id: deckId, name: file.name, createdAt: now, updatedAt: now });
    else if (deck.name !== file.name) await database.decks.update(deckId, { name: file.name, updatedAt: now });

    const existing = new Map((await database.cards.where('deckId').equals(deckId).toArray()).map((c) => [c.id, c]));
    const inFile = new Set<string>();
    const added: Card[] = [];
    for (const [i, c] of file.cards.entries()) {
      const id = prefix + c.id;
      inFile.add(id);
      const old = existing.get(id);
      if (!old) {
        // Distinct creation times keep the file's order as the order new cards are studied in.
        added.push({ id, deckId, front: c.front, back: c.back, createdAt: now + i, updatedAt: now, ...newCardSchedule(now) });
      } else if (old.front !== c.front || old.back !== c.back) {
        result.updated++;
        await database.cards.update(id, { front: c.front, back: c.back, updatedAt: now });
      }
    }
    await database.cards.bulkAdd(added);
    result.added = added.length;

    const gone = [...existing.keys()].filter((id) => id.startsWith(prefix) && !inFile.has(id));
    if (gone.length) {
      await database.reviews.where('cardId').anyOf(gone).delete();
      await database.cards.bulkDelete(gone);
    }
    result.removed = gone.length;
  });
  return result;
}

/** A short fingerprint of a deck file, to skip files that haven't changed since the last sync. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Merges every changed deck file from `decks/`. A deck deleted in the app stays deleted until its
 * file changes again. Invalid files are skipped (the test suite catches them before deploying).
 */
export async function syncRepoDecks(database: ClankiDb = defaultDb): Promise<void> {
  const files = import.meta.glob<unknown>('../../decks/*.json', { import: 'default' });
  for (const [path, load] of Object.entries(files)) {
    try {
      const raw = await load();
      const deck = parseRepoDeck(raw, path);
      const key = `repoDeckSync:${deck.id}`;
      const print = fingerprint(JSON.stringify(raw));
      if ((await getSetting(key, '', database)) === print) continue;
      await applyRepoDeck(deck, Date.now(), database);
      await setSetting(key, print, database);
    } catch (err) {
      console.warn('Skipping deck file', err);
    }
  }
}
