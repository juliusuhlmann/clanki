<script lang="ts">
  import { onMount } from 'svelte';
  import { drawFirefly } from '../game/firefly';

  /**
   * The game's firefly hovering in place: it drifts on a smooth path that never quite repeats
   * (a few slow sine waves with unrelated periods), flutters slightly, leans into its motion
   * and blinks now and then. Fills its parent. `onmove` reports where it is (0–1 across) and how
   * brightly it glows, so the light it casts can follow it.
   */
  let {
    size = 26,
    onmove,
  }: { size?: number; onmove?: (x: number, glow: number) => void } = $props();

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = size / 2.2;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Resizing clears the canvas; without the animation loop, draw the still firefly again.
      if (still) requestAnimationFrame(frame);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Position at time t: slow wandering plus a quick, small flutter.
    const ax = () => Math.max(0, w / 2 - r * 3);
    const ay = () => Math.max(0, h / 2 - r * 2.5);
    const pos = (t: number): [number, number] => [
      w / 2 + ax() * (0.6 * Math.sin(t * 0.43) + 0.4 * Math.sin(t * 1.07 + 1.3)),
      h / 2 + ay() * (0.55 * Math.sin(t * 0.71 + 2.1) + 0.35 * Math.sin(t * 1.63)) + 1.2 * Math.sin(t * 8.3),
    ];

    const start = performance.now() - Math.random() * 60_000;
    let raf = 0;
    const frame = (now: number) => {
      const t = still ? 0 : (now - start) / 1000;
      const [x, y] = still ? [w / 2, h / 2] : pos(t);
      // Lean into the direction of travel.
      const vx = still ? 0 : (pos(t + 0.05)[0] - x) / 0.05;
      // The lantern breathes and, every few seconds, flashes.
      const blink = Math.pow(Math.max(0, Math.sin(t * 0.37 + 0.5)), 24) + 0.6 * Math.pow(Math.max(0, Math.sin(t * 0.61)), 30);
      const glow = 0.85 + 0.1 * Math.sin(t * 1.9) + 0.45 * blink;

      ctx.clearRect(0, 0, w, h);
      drawFirefly(ctx, x, y, r, { t, tilt: Math.max(-1, Math.min(1, vx / 60)), air: 0.3, alpha: 1, glow, halo: 1 });
      onmove?.(w ? x / w : 0.5, glow);
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
