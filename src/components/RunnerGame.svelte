<script lang="ts">
  import { onMount } from 'svelte';
  import { Game } from '../game/engine';
  import { Renderer } from '../game/render';
  import { InputController } from '../game/input';
  import { MAX_SECONDS } from '../game/reward';
  import { getSetting, setSetting } from '../lib/db';

  let {
    seconds,
    earned,
    onfinish,
  }: {
    /** Length of the run. */
    seconds: number;
    /** Seconds earned by the cards since the last run (for the intro). */
    earned: number;
    onfinish: () => void;
  } = $props();

  let phase = $state<'intro' | 'playing' | 'results'>('intro');
  let score = $state(0);
  let letters = $state(0);
  let best = $state(0);
  let newBest = $state(false);
  let endReason = $state<'time' | 'hearts' | null>(null);

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let game: Game;
  let input: InputController | null = null;
  let hintTime = 0;
  let resultsAt = 0;

  const touch = matchMedia('(pointer: coarse)').matches;
  const hint = touch ? 'Swipe ← → to dodge · swipe up or tap to jump' : '← → to dodge · ↑ or Space to jump';

  onMount(() => {
    game = new Game();
    const renderer = new Renderer(canvas);
    getSetting('runnerBest', 0).then((v) => (best = v));

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // Dev-only hook for inspecting and freezing the game from the console.
    const debug = import.meta.env.DEV ? ((window as unknown as { __runner: { game: Game; paused: boolean } }).__runner = { game, paused: false }) : null;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const events = debug?.paused ? [] : game.update(dt, input ? input.take() : []);
      for (const e of events) {
        if (e.type === 'hit') navigator.vibrate?.(60);
        else if (e.type === 'collect') renderer.burst(e.x, e.y, e.z);
        else if (e.type === 'end') finish(e.reason);
      }
      if (phase === 'playing') hintTime += dt;
      renderer.render(game, dt, {
        hint: phase === 'playing' ? hint : null,
        hintAlpha: hintTime < 2.5 ? 1 : Math.max(0, 1 - (hintTime - 2.5) / 0.6),
        showHud: phase === 'playing',
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Pause while the app is in the background.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      input?.destroy();
    };
  });

  function start() {
    input = new InputController(canvas);
    game.start(seconds);
    hintTime = 0;
    phase = 'playing';
  }

  async function finish(reason: 'time' | 'hearts') {
    input?.destroy();
    input = null;
    endReason = reason;
    score = game.score;
    letters = game.lettersCollected;
    if (score > best) {
      newBest = best > 0;
      best = score;
      await setSetting('runnerBest', score);
    }
    resultsAt = performance.now();
    phase = 'results';
  }

  function onKeydown(e: KeyboardEvent) {
    if (phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      start();
    } else if (phase === 'results' && e.key === 'Enter' && performance.now() - resultsAt > 700) {
      // Only Enter (not Space, which is also jump) and not right after the run ends.
      e.preventDefault();
      onfinish();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="runner" bind:this={container}>
  <canvas bind:this={canvas}></canvas>

  {#if phase === 'intro'}
    <div class="overlay">
      <div class="sheet">
        <p class="kicker">Break time</p>
        <h2>Library run</h2>
        <p class="time">{seconds}s</p>
        <p class="muted small">
          {#if earned === 0}
            15s base. Answer Good or Easy to earn more.
          {:else if seconds >= MAX_SECONDS && 15 + earned > MAX_SECONDS}
            {earned}s earned by your answers – that's the {MAX_SECONDS}s maximum!
          {:else}
            15s base + {earned}s earned by your answers
          {/if}
        </p>
        <p class="muted small controls">{hint}</p>
        <div class="buttons">
          <button class="btn primary big" onclick={start}>Start</button>
          <button class="btn" onclick={onfinish}>Skip</button>
        </div>
      </div>
    </div>
  {:else if phase === 'results'}
    <div class="overlay">
      <div class="sheet">
        <p class="kicker">{endReason === 'hearts' ? 'Out of hearts' : "Time's up"}</p>
        <h2>{score}</h2>
        <p class="muted small">{letters} letters collected</p>
        <p class="best">{newBest ? '✦ New best!' : `Best: ${best}`}</p>
        <div class="buttons">
          <button class="btn primary big" onclick={onfinish}>Back to cards</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .runner {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #1e130c;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: radial-gradient(ellipse at center, rgba(20, 12, 7, 0.25), rgba(20, 12, 7, 0.7));
  }

  .sheet {
    width: min(100%, 22rem);
    padding: 1.75rem 1.5rem 1.5rem;
    text-align: center;
    background: rgba(36, 32, 28, 0.88);
    border: 1px solid rgba(217, 119, 87, 0.35);
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
  }

  .kicker {
    margin: 0;
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.25rem 0 0.25rem;
    font-size: 2rem;
  }

  .time {
    margin: 0.25rem 0;
    font-size: 2.6rem;
    font-weight: 800;
    color: #f2c35b;
  }

  .controls {
    margin-top: 0.75rem;
  }

  .best {
    margin: 0.5rem 0 0;
    color: #f2c35b;
    font-weight: 600;
  }

  .buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }

  .big {
    min-height: 52px;
    font-size: 1.1rem;
  }
</style>
