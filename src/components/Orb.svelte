<script lang="ts">
  /** A glowing sphere, like the firefly's lantern. */
  let { size = 16, class: className = '' }: { size?: number; class?: string } = $props();

  // Gradient ids must be unique per instance.
  const id = `orb-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg class={className} width={size} height={size} viewBox="-50 -50 100 100" overflow="visible" aria-hidden="true">
  <defs>
    <radialGradient id="{id}-halo">
      <stop offset="0.3" stop-color="#e4f082" stop-opacity="0.55" />
      <stop offset="1" stop-color="#e4f082" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="{id}-ball" cx="0.47" cy="0.6" r="0.55">
      <stop offset="0" stop-color="#fffef0" />
      <stop offset="0.45" stop-color="#f8f4a4" />
      <stop offset="0.85" stop-color="#d8ea72" />
      <stop offset="1" stop-color="#c4dc5c" />
    </radialGradient>
  </defs>
  <circle r="95" fill="url(#{id}-halo)" />
  <circle r="46" fill="url(#{id}-ball)" />
</svg>
