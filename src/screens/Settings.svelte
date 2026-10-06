<script lang="ts">
  import { onMount } from 'svelte';
  import { getNewPerDay, getSetting, setNewPerDay, setSetting } from '../lib/db';
  import { DEFAULT_DAILY_MINUTES } from '../lib/exam';
  import { RUN_SECONDS } from '../game/reward';
  import { exportData, backupFileName, parseBackup, planImport, applyImport, type ImportPlan } from '../lib/backup';
  import { href } from '../lib/router.svelte';
  import { link, unlink } from '../lib/sync';
  import { refreshStatus, syncNow, syncStatus } from '../lib/syncRunner.svelte';

  let newPerDay = $state<number | null>(null);
  let saved = $state(false);
  let persisted = $state<boolean | null>(null);
  let plan = $state<ImportPlan | null>(null);
  let importError = $state('');
  let importDone = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  let syncKey = $state('');
  let online = $state(navigator.onLine);
  let now = $state(Date.now());

  onMount(() => {
    void (async () => {
      newPerDay = await getNewPerDay();
      dailyMinutes = await getSetting<number>('examDailyMinutes', DEFAULT_DAILY_MINUTES);
      persisted = (await navigator.storage?.persisted?.()) ?? null;
      await refreshStatus();
    })();
    const onlineChange = () => (online = navigator.onLine);
    window.addEventListener('online', onlineChange);
    window.addEventListener('offline', onlineChange);
    // Keeps "synced 2 min ago" current.
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      window.removeEventListener('online', onlineChange);
      window.removeEventListener('offline', onlineChange);
      clearInterval(timer);
    };
  });

  function ago(at: number): string {
    const minutes = Math.floor((now - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  async function doLink(e: SubmitEvent) {
    e.preventDefault();
    if (!syncKey.trim()) return;
    await link(syncKey);
    syncKey = '';
    now = Date.now();
    await syncNow();
    now = Date.now();
  }

  async function doUnlink() {
    await unlink();
    await refreshStatus();
  }

  let dailyMinutes = $state<number | null>(null);

  async function saveDailyMinutes() {
    if (dailyMinutes === null || !Number.isFinite(dailyMinutes)) return;
    dailyMinutes = Math.max(5, Math.min(600, Math.round(dailyMinutes)));
    await setSetting('examDailyMinutes', dailyMinutes);
  }

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
  <label class="setting">
    <span class="label">
      Daily time for exams
      <span class="hint">Minutes a day for all decks with an exam date; you're warned when the plan needs more.</span>
    </span>
    <input type="number" min="5" max="600" inputmode="numeric" bind:value={dailyMinutes} onchange={saveDailyMinutes} />
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

<p class="section-label">Sync</p>
<section class="panel settings-group">
  {#if syncStatus.linked}
    <div class="setting">
      <span class="label">
        Phone and laptop
        <span class="hint">
          {#if syncStatus.syncing}
            Syncing…
          {:else if syncStatus.error}
            <span class="error">{syncStatus.error}</span>
            {#if syncStatus.pending}
              {syncStatus.pending} change{syncStatus.pending === 1 ? '' : 's'} will sync once it works again.
            {/if}
          {:else if !online}
            Offline. {syncStatus.pending
              ? `${syncStatus.pending} change${syncStatus.pending === 1 ? '' : 's'} will sync when you're back online.`
              : 'Everything is synced.'}
          {:else if syncStatus.lastAt}
            Synced {ago(syncStatus.lastAt)}.
          {:else}
            Not synced yet.
          {/if}
          {#if syncStatus.tooLarge}
            <span class="error">
              {syncStatus.tooLarge} card{syncStatus.tooLarge === 1 ? ' is' : 's are'} too big to sync (images over ~1.9 MB)
              and stay{syncStatus.tooLarge === 1 ? 's' : ''} on this device only.
            </span>
          {/if}
        </span>
      </span>
      <button class="btn small" onclick={() => syncNow()} disabled={syncStatus.syncing || !online}>Sync now</button>
    </div>
    <div class="setting">
      <span class="label">
        Unlink this device
        <span class="hint">Stops syncing. Cards stay on this device.</span>
      </span>
      <button class="btn small ghost" onclick={doUnlink}>Unlink</button>
    </div>
  {:else}
    <form class="setting" onsubmit={doLink}>
      <span class="label">
        Link this device
        <span class="hint">Paste the sync key. Cards and progress then sync across your devices.</span>
      </span>
      <input type="password" bind:value={syncKey} placeholder="Sync key" aria-label="Sync key" autocomplete="off" />
      <button class="btn small primary" type="submit" disabled={!syncKey.trim()}>Link</button>
    </form>
  {/if}
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
