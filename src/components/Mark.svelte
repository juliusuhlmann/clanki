<script lang="ts">
  import { MARK_COLOR, RAY_WIDTH, markPath } from '../lib/mark';

  let { size = 24, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg class={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
  <path d={markPath(50, 50, 50)} stroke={MARK_COLOR} stroke-width={RAY_WIDTH * 50} stroke-linecap="round" fill="none" />
</svg>
