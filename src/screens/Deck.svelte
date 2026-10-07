<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db, type Card } from '../lib/db';
  import { deckCounts, examStatus, formatInterval, retrievability, setExamDate, State } from '../lib/scheduler';
  import { createCard, updateCard, deleteCard } from '../lib/store';
  import { href } from '../lib/router.svelte';
  import { renderCardText, searchableText } from '../lib/cardText';
  import Firefly from '../components/Firefly.svelte';

  let { deckId }: { deckId: string } = $props();

  const deck = liveQuery(() => db.decks.get(deckId));
  const cards = liveQuery(() => db.cards.where('deckId').equals(deckId).reverse().sortBy('createdAt'));
  const counts = liveQuery(() => deckCounts(deckId, Date.now()));
  const exam = liveQuery(() => examStatus(deckId, Date.now()));

  let editingExam = $state(false);
  let examInput = $state('');

  /** Today's date as YYYY-MM-DD, local. */
  function todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatExamDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function startEditExam(current: string) {
    examInput = current;
    editingExam = true;
  }

  async function saveExam(e: SubmitEvent) {
    e.preventDefault();
    if (!examInput) return;
    await setExamDate(deckId, examInput, Date.now());
    editingExam = false;
  }

  async function clearExam() {
    await setExamDate(deckId, null, Date.now());
  }

  let front = $state('');
  let back = $state('');
  let query = $state('');
  let editingId = $state<string | null>(null);
  let editFront = $state('');
  let editBack = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let frontInput: HTMLTextAreaElement | undefined = $state();
  /** The new-card form stays folded away until asked for. */
  let adding = $state(false);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!$cards) return [];
    if (!q) return $cards;
    return $cards.filter((c) => searchableText(c.front).includes(q) || searchableText(c.back).includes(q));
  });

  async function addCard(e: SubmitEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await createCard(deckId, front, back);
    front = '';
    back = '';
    frontInput?.focus();
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (editingId && editFront.trim() && editBack.trim()) await updateCard(editingId, editFront, editBack);
    editingId = null;
  }

  function dueLabel(card: Card): string {
    if (card.fsrs.state === State.New) return 'new';
    const now = Date.now();
    const diff = card.due - now;
    const due = diff <= 0 ? 'due now' : `due in ${formatInterval(diff)}`;
    const r = retrievability(card, now);
    return r === null ? due : `${due} · ${Math.round(r * 100)}% recall`;
  }

  // Year is only shown for cards added in an earlier year.
  function addedLabel(createdAt: number): string {
    const date = new Date(createdAt);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return `added ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}`;
  }

  // Ctrl/Cmd+Enter submits the add form from either textarea; Esc folds it away.
  function formKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      adding = false;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }
</script>

<a class="back" href={href({ name: 'decks' })}>← Decks</a>

{#if $deck === undefined && $cards !== undefined}
  <p class="muted">This deck doesn't exist anymore.</p>
{:else if $deck}
  <div class="page-head title-row">
    <div>
      <h1>{$deck.name}</h1>
      {#if $counts}
        <p class="muted small">
          {$counts.total} card{$counts.total === 1 ? '' : 's'}
          {#if $counts.due + $counts.new > 0}· {$counts.due + $counts.new} to study today{/if}
        </p>
      {/if}
    </div>
    {#if $counts && $counts.due + $counts.new > 0}
      <a class="btn primary" href={href({ name: 'review', deckId })}>Study</a>
    {/if}
  </div>

  <!-- Exam mode: scheduled to reach 95% on the exam day (see lib/exam.ts). -->
  <section class="panel exam">
    {#if editingExam}
      <form class="row exam-edit" onsubmit={saveExam}>
        <label class="exam-label">
          Exam date
          <input type="date" bind:value={examInput} min={todayIso()} required />
        </label>
        <button class="btn primary small" type="submit" disabled={!examInput}>Save</button>
        <button class="btn ghost small" type="button" onclick={() => (editingExam = false)}>Cancel</button>
      </form>
    {:else if $exam}
      <div class="exam-head">
        <div>
          <p class="exam-title">
            Exam {formatExamDate($exam.examDate)}
            <span class="muted">
              · {$exam.daysLeft > 1 ? `in ${$exam.daysLeft} days` : $exam.daysLeft === 1 ? 'tomorrow' : $exam.daysLeft === 0 ? 'today' : 'over'}
            </span>
          </p>
        </div>
        <button class="btn ghost small" onclick={() => startEditExam($exam.examDate)}>Change</button>
        <button class="btn ghost small" onclick={clearExam}>Remove</button>
      </div>
      {#if $exam.daysLeft >= 0}
        <ul class="exam-facts">
          <li>
            If you stopped now: <strong>{Math.round($exam.ifStoppedNow * 100)}%</strong> on exam day. The plan aims for 95%.
          </li>
          {#if $exam.newNeeded > $exam.newNormal}
            <li class="warn">
              {$exam.newNeeded} new cards a day needed to learn everything 10 days before the exam (instead of {$exam.newNormal}).
            </li>
          {/if}
          {#if $exam.busiestMinutes > $exam.dailyMinutes}
            <li class="warn">
              Busiest day of the next two weeks: about {$exam.busiestMinutes} min across your exams, more than your
              {$exam.dailyMinutes} min a day.
            </li>
          {/if}
        </ul>
      {:else}
        <p class="muted small">The exam is over, so this deck is back to normal scheduling.</p>
      {/if}
    {:else}
      <div class="exam-head">
        <p class="muted small">Add an exam date to plan this deck for 95% on exam day.</p>
        <button class="btn small" onclick={() => startEditExam('')}>Add exam date</button>
      </div>
    {/if}
  </section>

  {#if adding}
    <form class="panel card-form" onsubmit={addCard}>
      <h2>New card</h2>
      <label>
        Front
        <!-- svelte-ignore a11y_autofocus -->
        <textarea bind:this={frontInput} bind:value={front} rows="2" placeholder="Question or term" onkeydown={formKeydown} autofocus></textarea>
      </label>
      <label>
        Back
        <textarea bind:value={back} rows="3" placeholder="Answer" onkeydown={formKeydown}></textarea>
      </label>
      <div class="row">
        <button class="btn primary" type="submit" disabled={!front.trim() || !back.trim()}>Add card</button>
        <button class="btn ghost" type="button" onclick={() => (adding = false)}>Done</button>
        <span class="muted small"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
      </div>
    </form>
  {:else}
    <button class="add-trigger" onclick={() => (adding = true)}>+ Add card</button>
  {/if}

  <p class="section-label">Cards</p>
  {#if $cards && $cards.length > 0}
    <input type="search" bind:value={query} placeholder="Search cards" aria-label="Search cards" />
  {/if}

  <ul class="list">
    {#each filtered as card (card.id)}
      <li class="panel">
        {#if editingId === card.id}
          <form class="card-form" onsubmit={saveEdit}>
            <label>Front <textarea bind:value={editFront} rows="2"></textarea></label>
            <label>Back <textarea bind:value={editBack} rows="3"></textarea></label>
            <div class="row">
              <button class="btn primary small" type="submit">Save</button>
              <button class="btn ghost small" type="button" onclick={() => (editingId = null)}>Cancel</button>
            </div>
          </form>
        {:else if confirmDeleteId === card.id}
          <div class="confirm">
            <p>Delete this card and its review history?</p>
            <div class="row">
              <button
                class="btn danger small"
                onclick={async () => {
                  await deleteCard(card.id);
                  confirmDeleteId = null;
                }}>Delete</button
              >
              <button class="btn ghost small" onclick={() => (confirmDeleteId = null)}>Cancel</button>
            </div>
          </div>
        {:else}
          <div class="card-row">
            <div class="card-text">
              <p class="front">{@html renderCardText(card.front)}</p>
              <p class="back-text">{@html renderCardText(card.back)}</p>
              <p class="due-label">{dueLabel(card)} · {addedLabel(card.createdAt)}</p>
            </div>
            <button
              class="btn ghost small"
              onclick={() => {
                editingId = card.id;
                editFront = card.front;
                editBack = card.back;
              }}>Edit</button
            >
            <button class="btn ghost small" aria-label="Delete card" onclick={() => (confirmDeleteId = card.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          </div>
        {/if}
      </li>
    {:else}
      {#if $cards && $cards.length > 0}
        <p class="muted">No cards match "{query}".</p>
      {:else if $cards}
        <div class="empty panel">
          <Firefly size={36} />
          <p>No cards yet.</p>
          {#if !adding}<button class="btn primary small" onclick={() => (adding = true)}>Add your first card</button>{/if}
        </div>
      {/if}
    {/each}
  </ul>
{/if}
