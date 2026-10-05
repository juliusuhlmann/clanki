<script lang="ts">
  import { onMount } from 'svelte';
  import { getNewPerDay, setNewPerDay } from '../lib/db';
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
<h1>Settings</h1>

<section class="panel">
  <h2>Study</h2>
  <label class="row">
    New cards per day (per deck)
    <input
      type="number"
      min="0"
      max="999"
      inputmode="numeric"
      class="narrow"
      bind:value={newPerDay}
      onchange={saveNewPerDay}
    />
    {#if saved}<span class="muted small">Saved</span>{/if}
  </label>
</section>

<section class="panel">
  <h2>Backup</h2>
  <p class="muted small">
    Export a backup file to move your cards to another device or keep them safe. Importing merges: new cards are
    added, and the newer version of a card wins.
  </p>
  <div class="row">
    <button class="btn primary" onclick={doExport}>Export backup</button>
    <button class="btn" onclick={() => fileInput?.click()}>Import backup…</button>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      onchange={onFileChosen}
    />
  </div>

  {#if importError}<p class="error">{importError}</p>{/if}
  {#if importDone}<p class="ok">{importDone}</p>{/if}

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
          <button class="btn primary" onclick={confirmImport}>Import</button>
          <button class="btn" onclick={() => (plan = null)}>Cancel</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<section class="panel">
  <h2>Storage</h2>
  <p class="muted small">
    {#if persisted === true}
      Your data is stored on this device and protected from automatic cleanup.
    {:else if persisted === false}
      Your data is stored on this device, but the browser may clear it if space runs low. Installing the app and
      exporting backups regularly keeps it safe.
    {:else}
      Your data is stored on this device.
    {/if}
  </p>
</section>
