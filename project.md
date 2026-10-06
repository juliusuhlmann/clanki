# Clanki

Clanki (Claude + Anki) is a spaced-repetition flashcard app with a small three-lane runner game between cards. It runs offline on a Windows laptop and an Android phone.

## Vision

_TODO_

## Core features

Done (steps 2–3):
- Decks: create, rename, delete; deck list shows due / new counts
- Cards: add, edit, delete, search (plain multi-line text)
- Review: show answer → Again / Hard / Good / Easy with interval previews; keyboard shortcuts (Space, 1–4)
- FSRS scheduling (ts-fsrs, 90% target retention, fuzz on); cards in learning steps return in the same session (20-minute learn-ahead)
- Daily new-card limit per deck (default 20); the study day starts at 4:00
- Hash routing, so Android's back button moves between screens

## The game

Library run (step 4), in `src/game/` + `src/components/RunnerGame.svelte`:
- A little firefly (`src/game/firefly.ts`) flies down a dim three-lane library corridor (pseudo-3D, plain canvas 2D, no image assets). Deliberately simple, seen from behind, no face: flat shapes, a round body that is almost all glowing lantern (a thin brown band under the head), a round head, two buzzing translucent wings and antennae with glowing tips
- Its lantern lights the scene: a warm pool on the floor ahead, a glow on the nearby bookshelf, obstacles tinted as they come close, and darkness closing in away from it. The light breathes slowly and flares on a letter boost; it leaves a trail of twinkling motes
- Controls: swipe left/right (or ←/→, A/D) to change lane; swipe up, tap, ↑/W or Space to jump; swipe down (or ↓/S) mid-jump to drop straight back down
- Obstacles: book piles (jump or dodge), book carts (dodge), and ladders leaning across the corridor against a bookshelf: low over the middle lane (jump), high over the wall-side lane (glide under; jumping there hits it), absent over the far lane, where a book cart sometimes stands. Every row leaves a lane you can glide through without jumping, and rows are spaced so you can always react
- Speed: starts at 17 m/s and ramps toward 46 m/s (time constant 18s). Rows are at least 0.6s apart. The first obstacles arrive about two seconds into a run; from 3s in, three more kinds: **rolling carts** drift from one lane into the next while still far away (settled by 18 m out; scuff lines show the direction); **reading tables** across 2 or 3 lanes (green leather top, banker's lamp, books) that you glide under, while any jump hits them, so arriving mid-jump means swiping down; **falling books** tip off a high shelf one by one and stack into a jumpable pile, with a shadow on the landing spot as a warning, finished by ~15 m out
- Glowing letters are collectibles: each one adds 1 to the score, and the firefly's lantern flares briefly. They don't change speed
- Score = letters collected in the run. The HUD shows a gold "A" and the count; the best is kept in settings (`runnerBestLetters`) and shown on the home screen's lamp
- 2 hearts; a hit costs a heart, flashes the screen and vibrates the phone; the run ends when time or hearts run out
- Appears every 6–10 cards (random). Length = 15s + earned seconds (Again 0, Hard +2, Good +4, Easy +4), max 40s. A bonus run is offered at the end of a session if ≥3 cards were answered since the last run
- Skippable, and can be turned off in Settings. The game never affects scheduling
- "Try the library run" on the deck list (`#/run`) starts a free 30s practice run
- Dev only: `window.__runner` exposes `{ game, paused }` for inspection

## Scheduling and exam mode

_TODO_

## Design

"Reading room", Claude-desktop-like, in `src/style.css`:
- Warm ivory light mode / warm charcoal dark mode (follows the system), terracotta `#d97757` only for primary actions
- Serif headings (Source Serif 4, bundled for offline use), system sans for UI text, soft 1px borders
- The firefly is the mascot: `src/components/Firefly.svelte` draws the game's firefly (same code) as a still icon for the header logo, the library-run tile and empty states. `src/components/Orb.svelte` is its glowing lantern as a sphere
- App icon: a glowing lime sphere on a warm dark-brown tile (`public/icons/`; the PNGs are generated with System.Drawing, full-bleed so they work as maskable icons)
- Game ties: flashcards are library catalogue cards; a run meter during review shows the glowing orb moving toward the next run, with "+4s" when an answer earns time; a dark "library run" tile on the home screen

## Tech stack

- PWA: Vite + TypeScript + Svelte 5, vite-plugin-pwa (service worker + manifest)
- Storage: Dexie (IndexedDB); scheduling: ts-fsrs
- Tests: vitest + fake-indexeddb (`npm test`); `npm run build` runs svelte-check first
- TypeScript is pinned to 6.x because svelte-check doesn't support TS 7 yet
- Target devices: Windows laptop (browser) and Android phone (installed PWA)
- Repo: https://github.com/juliusuhlmann/clanki
- Live app: https://juliusuhlmann.github.io/clanki/
- Deploy: every push to `main` runs `.github/workflows/deploy.yml` (install, test, build, publish to GitHub Pages). Watch it with `gh run watch` or on the repo's Actions tab

## Data and sync

- Everything is stored on the device in IndexedDB (Dexie), in `src/lib/db.ts`: tables `decks`, `cards` (FSRS state + indexed `due`), `reviews` (an append-only log of every answer, for future exam mode, stats and the leech boss) and `settings`
- Backup: Settings → Export downloads `clanki-backup-YYYY-MM-DD.json`; Import merges it (new items added, the newer `updatedAt` wins, reviews deduplicated) after showing a summary
- Moving cards between laptop and phone currently means export on one device and import on the other
- Known limitation: deletions don't sync. Importing an older backup brings deleted cards back

## Roadmap

1. **Project setup and offline shell**
   Create a Vite + TypeScript project, make it an installable PWA (manifest + service worker), and deploy it free.
   _Goal: install it on the phone and it opens with no internet._
2. **Cards and storage**
   Add cards (front/back) and decks, stored in IndexedDB via Dexie, plus JSON export/import for backups.
   _Goal: create cards on the laptop, back them up, load them on the phone._
3. **Review loop with FSRS**
   Show a card, reveal the answer, rate it Again/Hard/Good/Easy, and schedule it with ts-fsrs. Log every review.
   _Goal: a working spaced-repetition app._
4. **The runner game**
   Build a canvas game with a little spark in three lanes, obstacles, and swipe/arrow-key controls. Insert it every N cards, with correct cards adding game seconds.
   _Goal: the core study-and-play loop._
5. **Exam mode**
   Add exam dates per deck, the exam-day recall target, a retention floor, windowed reviews, and a daily cap.
   _Goal: balanced reviews across the semester that peak on exam day._
6. **Polish and extras**
   Add the leech boss, power-ups, deck worlds, stats (retention, streaks), and optional sync (OneDrive backup or Supabase).

Each step leaves something usable; steps 1–3 alone give a working flashcard app.

## Open questions

_TODO_
