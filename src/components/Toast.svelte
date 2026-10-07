<script lang="ts">
  // A short message at the bottom of the screen with one action, e.g. "Card deleted · Undo".
  let { message, action, onaction }: { message: string; action: string; onaction: () => void } = $props();
</script>

<div class="toast" role="status">
  <span>{message}</span>
  <button onclick={onaction}>{action}</button>
</div>
