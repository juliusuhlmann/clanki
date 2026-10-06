<script lang="ts">
  import { onMount } from 'svelte';
  import { getNewPerDay, setNewPerDay } from '../lib/db';
  import { RUN_SECONDS } from '../game/reward';
  import { exportData, backupFileName, parseBackup, planImport, applyImport, type ImportPlan } from '../lib/backup';
  import { href } from '../lib/router.svelte';

  let newPerDay = $state<number | null>(null);
  let saved = $state(false);
  let persisted = $state<boolean | null>(null);
  let plan = $state<ImportPlan | null>(null);
  let importError = $state('');
  let importDone = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  onMount(async () => {
    newPerDay = await getNewPerDay();
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  });

  async function saveNewPerDay() {
    if (newPerDay === null || !Number.isFinite(newPerDay)) return;
    newPerDay = Math.max(0, Math.min(999, Math.round(newPerDay)));
    await setNewPerDay(newPerDay);
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }

  async function doExport() {
    const now = Date.now();
    const data = await exportData(now);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(now);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onFileChosen(e: Event) {
    importError = '';
    importDone = '';
    plan = null;
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      plan = await planImport(parseBackup(await file.text()));
    } catch (err) {
      importError = err instanceof Error ? err.message : String(err);
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async function confirmImport() {
    if (!plan) return;
    try {
      await applyImport(plan);
      importDone = 'Import complete.';
    } catch (err) {
      importError = err instanceof Error ? err.message : String(err);
    }
    plan = null;
  }

  const nothingToImport = $derived(plan !== null && Object.values(plan.summary).every((n) => n === 0));
</script>

<a class="back" href={href({ name: 'decks' })}>← Decks</a>
<div class="page-head">
  <h1>Settings</h1>
</div>

<p class="section-label">Study</p>
<section class="panel settings-group">
  <label class="setting">
    <span class="label">
      New cards per day
      <span class="hint">Per deck. {#if saved}<strong>Saved.</strong>{/if}</span>
    </span>
    <input type="number" min="0" max="999" inputmode="numeric" bind:value={newPerDay} onchange={saveNewPerDay} />
  </label>
</section>

<p class="section-label">Library run</p>
<section class="panel settings-group">
  <div class="setting">
    <span class="label">
      Test the run
      <span class="hint">One {RUN_SECONDS}s run through the library, no cards. Doesn't count toward your best runs.</span>
    </span>
    <a class="btn small" href={href({ name: 'practiceRun' })}>Start</a>
  </div>
</section>

<p class="section-label">Backup</p>
<section class="panel settings-group">
  <div class="setting">
    <span class="label">
      Export
      <span class="hint">Save all decks, cards and history to a file.</span>
    </span>
    <button class="btn small" onclick={doExport}>Export</button>
  </div>
  <div class="setting">
    <span class="label">
      Import
      <span class="hint">Merge a backup: new cards are added, the newer version of a card wins.</span>
    </span>
    <button class="btn small" onclick={() => fileInput?.click()}>Choose file…</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onFileChosen} />
  </div>

  {#if importError}<p class="error import-summary">{importError}</p>{/if}
  {#if importDone}<p class="ok import-summary">{importDone}</p>{/if}

  {#if plan}
    <div class="import-summary">
      {#if nothingToImport}
        <p>Everything in this file is already here. Nothing to import.</p>
        <button class="btn" onclick={() => (plan = null)}>OK</button>
      {:else}
        <p>This import will add or update:</p>
        <ul>
          <li>{plan.summary.newDecks} new decks, {plan.summary.updatedDecks} updated</li>
          <li>{plan.summary.newCards} new cards, {plan.summary.updatedCards} updated</li>
          <li>{plan.summary.newReviews} review log entries</li>
        </ul>
        <div class="row">
          <button class="btn primary small" onclick={confirmImport}>Import</button>
          <button class="btn ghost small" onclick={() => (plan = null)}>Cancel</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<p class="section-label">Storage</p>
<section class="panel settings-group">
  <div class="setting">
    <span class="label">
      On this device
      <span class="hint">
        {#if persisted === true}
          Protected from automatic cleanup.
        {:else if persisted === false}
          The browser may clear it if space runs low. Install the app and export backups regularly.
        {:else}
          Your cards never leave this device unless you export them.
        {/if}
      </span>
    </span>
  </div>
</section>
