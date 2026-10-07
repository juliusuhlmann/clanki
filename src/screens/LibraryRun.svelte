<script lang="ts">
  import { onMount } from 'svelte';
  import { db, libraryRunRank, saveLibraryRun, topLibraryRuns, type Card, type LibraryRun } from '../lib/db';
  import { buildLibraryQueue, LIBRARY_LEARN_AHEAD_MS, previewIntervals, rate, Session, splitBlocks, totalLeftToday, undoRate, type Grade } from '../lib/scheduler';
  import { href } from '../lib/router.svelte';
  import { updateCard } from '../lib/store';
  import { RUN_SECONDS, RUNS_PER_LIBRARY_RUN } from '../game/reward';
  import StudyCard from '../components/StudyCard.svelte';
  import RunnerGame from '../components/RunnerGame.svelte';
  import Firefly from '../components/Firefly.svelte';
  import Orb from '../components/Orb.svelte';
  import UndoChip from '../components/UndoChip.svelte';

  // A library run: cards from all decks in three blocks, with a runner run after the first two.
  // Letters from both runs add up; the total is ranked against earlier library runs.

  /** How long a run's score shows before the cards come back on their own. */
  const RESULTS_MS = 1800;

  let deckNames = $state<Record<string, string>>({});
  let session: Session | null = null;
  let current = $state<Card | null>(null);
  let remaining = $state(0);
  let revealed = $state(false);
  let intervals = $state<Record<Grade, string> | null>(null);
  let shownAt = 0;
  let busy = false;
  let phase = $state<'loading' | 'empty' | 'cards' | 'running' | 'summary'>('loading');

  /** Answers after which each runner run starts, e.g. [4, 8] for 12 cards. */
  let runAfter = $state<number[]>([]);
  let answered = $state(0);
  /** The last answer, so it can be taken back (only until the next runner run starts). */
  let last = $state.raw<{ before: Card; reviewedAt: number; session: ReturnType<Session['snapshot']> } | null>(null);
  let runsDone = $state(0);
  let letters = $state(0);

  let result = $state<{ id: number; rank: number; of: number; top: LibraryRun[] } | null>(null);
  let leftAfter = $state(0);

  const blockStart = $derived(runsDone === 0 ? 0 : runAfter[runsDone - 1]);
  const toNextRun = $derived(runsDone < RUNS_PER_LIBRARY_RUN ? Math.max(0, runAfter[runsDone] - answered) : 0);
  const meter = $derived.by(() => {
    if (runsDone < RUNS_PER_LIBRARY_RUN) {
      const size = runAfter[runsDone] - blockStart;
      return size <= 0 ? 1 : (answered - blockStart) / size;
    }
    const done = answered - blockStart;
    return done + remaining === 0 ? 1 : done / (done + remaining);
  });

  onMount(async () => {
    const decks = await db.decks.toArray();
    deckNames = Object.fromEntries(decks.map((d) => [d.id, d.name]));
    await begin();
  });

  async function begin() {
    phase = 'loading';
    const queue = await buildLibraryQueue(Date.now());
    if (queue.length === 0) {
      phase = 'empty';
      return;
    }
    const [a, b] = splitBlocks(queue.length);
    runAfter = [a, a + b];
    answered = 0;
    runsDone = 0;
    letters = 0;
    result = null;
    last = null;
    session = new Session(queue, LIBRARY_LEARN_AHEAD_MS);
    phase = 'cards';
    showNext();
  }

  function showNext() {
    if (!session) return;
    const now = Date.now();
    current = session.next(now);
    remaining = session.remaining + (current ? 1 : 0);
    revealed = false;
    intervals = current ? previewIntervals(current, now) : null;
    shownAt = now;
  }

  function reveal() {
    if (current && !revealed) revealed = true;
  }

  async function answer(grade: Grade) {
    if (!current || !revealed || busy || !session || phase !== 'cards') return;
    busy = true;
    try {
      const now = Date.now();
      // Cap thinking time so leaving the app open doesn't distort stats.
      const durationMs = Math.min(now - shownAt, 120_000);
      const updated = await rate(current, grade, durationMs, now);
      last = { before: current, reviewedAt: now, session: session.snapshot() };
      session.answered(updated, now);
      answered++;
      showNext();
      await advance();
    } finally {
      busy = false;
    }
  }

  /** Starts the next runner run when its block is done (or the cards ran out), or ends the library run. */
  async function advance() {
    if (runsDone < RUNS_PER_LIBRARY_RUN && (answered >= runAfter[runsDone] || !current)) {
      phase = 'running';
      last = null;
    } else if (!current) {
      last = null;
      await finish();
    }
  }

  async function edit(front: string, back: string) {
    if (!current) return;
    await updateCard(current.id, front, back);
    current = { ...current, front: front.trim(), back: back.trim() };
  }

  /** Takes back the last answer and shows that card again, answer revealed. */
  async function undo() {
    if (!last || busy || !session || phase !== 'cards') return;
    busy = true;
    try {
      const now = Date.now();
      const restored = await undoRate(last.before, last.reviewedAt, now);
      session.restore(last.session);
      last = null;
      answered--;
      current = restored;
      remaining = session.remaining + 1;
      revealed = true;
      intervals = previewIntervals(restored, now);
      shownAt = now;
    } finally {
      busy = false;
    }
  }

  async function endRun(score: number) {
    letters += score;
    runsDone++;
    phase = 'cards';
    // Don't count the break as thinking time for the current card.
    shownAt = Date.now();
    await advance();
  }

  async function finish() {
    const now = Date.now();
    const id = await saveLibraryRun({ finishedAt: now, letters, cards: answered });
    const [{ rank, of }, top] = await Promise.all([libraryRunRank(id), topLibraryRuns(10)]);
    result = { id, rank, of, top };
    leftAfter = await totalLeftToday(now);
    phase = 'summary';
  }

  function rankText(rank: number, of: number): string {
    if (of === 1) return 'Your first library run';
    if (rank === 1) return '✦ New best!';
    return `#${rank} of your ${of} library runs`;
  }

  function formatDay(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
</script>

<div class="review">
  <div class="review-top">
    <a class="back" href={href({ name: 'decks' })} aria-label="Leave library run">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </a>
    {#if current && phase !== 'summary'}
      <!-- Run meter: the glowing orb travels toward the next runner run. -->
      <div class="run-meter">
        <div class="run-meter-track">
          <div class="run-meter-fill" style="width: {meter * 100}%"></div>
          <span class="run-meter-spark" style="left: {meter * 100}%"><Orb size={14} /></span>
        </div>
        <div class="run-meter-label">
          <span>
            {#if runsDone >= RUNS_PER_LIBRARY_RUN}
              Last cards · {remaining} left
            {:else if toNextRun === 0}
              Run next!
            {:else}
              Run {runsDone + 1} in {toNextRun} card{toNextRun === 1 ? '' : 's'}
            {/if}
          </span>
          <span>{letters} letter{letters === 1 ? '' : 's'}</span>
        </div>
      </div>
    {:else}
      <span class="spacer"></span>
    {/if}
    {#if last && phase === 'cards'}<UndoChip onundo={undo} />{/if}
  </div>

  {#if phase === 'loading'}
    <p class="muted">Loading…</p>
  {:else if phase === 'empty'}
    <div class="done">
      <Firefly size={72} class="spark" />
      <h1>All caught up</h1>
      <p class="muted">No cards are waiting in any deck. You can still try the run on its own.</p>
      <div class="actions">
        <a class="btn primary" href={href({ name: 'practiceRun' })}>Test the run</a>
        <a class="btn" href={href({ name: 'decks' })}>Back to decks</a>
      </div>
    </div>
  {:else if phase === 'summary' && result}
    <div class="done library-summary">
      <Firefly size={64} class="spark" />
      <p class="kicker">{rankText(result.rank, result.of)}</p>
      <h1>{letters} letter{letters === 1 ? '' : 's'}</h1>
      <p class="muted">{answered} card{answered === 1 ? '' : 's'} answered, two runs through the library.</p>

      <ol class="leaderboard panel">
        {#each result.top as run, i (run.id)}
          <li class:current={run.id === result.id}>
            <span class="place">{i + 1}</span>
            <span class="when">{run.id === result.id ? 'This run' : formatDay(run.finishedAt)}</span>
            <span class="score">{run.letters}</span>
          </li>
        {/each}
        {#if result.rank > result.top.length}
          <li class="current">
            <span class="place">{result.rank}</span>
            <span class="when">This run</span>
            <span class="score">{letters}</span>
          </li>
        {/if}
      </ol>

      <div class="actions">
        {#if leftAfter > 0}
          <button class="btn primary" onclick={begin}>Another library run</button>
        {/if}
        <a class="btn" class:primary={leftAfter === 0} href={href({ name: 'decks' })}>Back to decks</a>
      </div>
    </div>
  {:else if current}
    <StudyCard
      card={current}
      deckName={deckNames[current.deckId] ?? ''}
      number={answered + 1}
      {revealed}
      {intervals}
      paused={phase === 'running'}
      onreveal={reveal}
      onanswer={answer}
      onedit={edit}
    />
  {/if}
</div>

{#if phase === 'running'}
  {#key runsDone}
    <RunnerGame
      seconds={RUN_SECONDS}
      title={`Run ${runsDone + 1} of ${RUNS_PER_LIBRARY_RUN}`}
      lettersBefore={letters}
      buttonLabel={current ? 'Back to cards' : runsDone + 1 < RUNS_PER_LIBRARY_RUN ? 'Next run' : 'See results'}
      autoContinueMs={RESULTS_MS}
      onfinish={endRun}
    />
  {/key}
{/if}
