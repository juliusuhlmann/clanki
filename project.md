# Clanki

Clanki (Claude + Anki) is a spaced-repetition flashcard app with a small three-lane runner game between cards. It runs offline on a Windows laptop and an Android phone.

## Vision

_TODO_

## Core features

_TODO_

## The game

_TODO_

## Scheduling and exam mode

_TODO_

## Tech stack

- PWA: Vite + TypeScript, vite-plugin-pwa (service worker + manifest)
- Target devices: Windows laptop (browser) and Android phone (installed PWA)
- Repo: https://github.com/juliusuhlmann/clanki
- Live app: https://juliusuhlmann.github.io/clanki/
- Deploy: `npm run deploy` builds and publishes `dist/` to the `gh-pages` branch

## Data and sync

_TODO_

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
