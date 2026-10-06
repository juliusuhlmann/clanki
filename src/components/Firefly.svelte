<script lang="ts">
  import { onMount } from 'svelte';
  import { drawFirefly } from '../game/firefly';

  /** The runner's firefly as a still icon, drawn with the same code as the game. */
  let { size = 24, class: className = '' }: { size?: number; class?: string } = $props();

  let canvas: HTMLCanvasElement;

  onMount(() => {
    // The canvas is twice the box size so the glow can spill past it.
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = size * 2;
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const r = size / 2.2;
    // Centre the firefly's bounding box (antenna tips to belly) in the box.
    drawFirefly(ctx, px / 2, px / 2 + r * 0.4, r, { t: 0, tilt: 0, air: 0, alpha: 1, glow: 1, halo: 0.6 });
  });
</script>

<span class="firefly {className}" style="width: {size}px; height: {size}px" aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
</span>

<style>
  .firefly {
    position: relative;
    display: inline-block;
    flex: none;
  }

  canvas {
    position: absolute;
    left: -50%;
    top: -50%;
    width: 200%;
    height: 200%;
    pointer-events: none;
  }
</style>
