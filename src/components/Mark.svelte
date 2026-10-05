<script lang="ts">
  import { MARK_COLOR, markPath } from '../lib/mark';

  let { size = 24, class: className = '' }: { size?: number; class?: string } = $props();

  const d = markPath(50, 50, 50);
</script>

<svg class={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
  <path {d} fill={MARK_COLOR} />
</svg>
