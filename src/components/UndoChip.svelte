<script lang="ts">
  // Takes back the last answer while studying; also Z or Backspace.
  let { onundo }: { onundo: () => void } = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      e.preventDefault();
      onundo();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<button class="undo-chip" onclick={onundo} aria-label="Undo last answer" title="Undo last answer (Z)">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
  Undo
</button>
