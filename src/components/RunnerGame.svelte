<script lang="ts">
  import { onMount } from 'svelte';
  import { Game } from '../game/engine';
  import { Renderer } from '../game/render';
  import { InputController } from '../game/input';
  import { getSetting, setSetting } from '../lib/db';

  let {
    seconds,
    practice = false,
    onfinish,
  }: {
    /** Length of the run. */
    seconds: number;
    /** A free run started from the deck list rather than earned by studying. */
    practice?: boolean;
    onfinish: () => void;
  } = $props();

  let phase = $state<'intro' | 'playing' | 'results'>('intro');
  let score = $state(0);
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
  const hint = touch ? 'Swipe to dodge · tap to jump · letters = boost' : '← → dodge · ↑ / Space jump · letters = boost';

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
    <!-- Just "Ready?" over the corridor: tap it to fly, or skip. The controls hint shows in-game. -->
    <div class="overlay ready">
      <button class="ready-btn" onclick={start}>Ready?</button>
      <button class="skip-btn" onclick={onfinish}>Skip</button>
    </div>
  {:else if phase === 'results'}
    <div class="overlay">
      <div class="sheet">
        <p class="kicker">{endReason === 'hearts' ? 'Out of hearts' : "Time's up"}</p>
        <h2>{score} m</h2>
        <p class="muted small">through the library</p>
        <p class="best">{newBest ? '✦ New best!' : `Best: ${best} m`}</p>
        <div class="buttons">
          <button class="btn primary big" onclick={onfinish}>{practice ? 'Done' : 'Back to cards'}</button>
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

  .overlay.ready {
    flex-direction: column;
    gap: 1.1rem;
    background: radial-gradient(ellipse at center, rgba(20, 12, 7, 0.1), rgba(20, 12, 7, 0.55));
  }

  /* A plain pill button in the app's accent colour, with a soft lamp glow. */
  .ready-btn {
    min-width: 11rem;
    min-height: 54px;
    padding: 0.8rem 2.4rem;
    font: inherit;
    font-size: 1.15rem;
    font-weight: 600;
    color: #fffaf3;
    background: var(--accent);
    border: 0;
    border-radius: 999px;
    box-shadow: 0 8px 28px rgba(217, 119, 87, 0.45);
    cursor: pointer;
    transition: transform 0.12s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .ready-btn:hover {
    background: var(--accent-strong);
  }

  .ready-btn:active {
    transform: scale(0.97);
  }

  .skip-btn {
    padding: 0.5rem 1rem;
    font: inherit;
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(244, 237, 228, 0.65);
    background: none;
    border: 0;
    cursor: pointer;
  }

  .skip-btn:hover {
    color: #f4ede4;
  }

  .sheet {
    width: min(100%, 22rem);
    padding: 1.75rem 1.5rem 1.5rem;
    text-align: center;
    color: #f4ede4;
    background: rgba(38, 26, 18, 0.82);
    border: 1px solid rgba(242, 195, 91, 0.22);
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 230, 190, 0.08);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .sheet .muted {
    color: rgba(244, 237, 228, 0.65);
  }

  .sheet .btn:not(.primary) {
    color: #f4ede4;
    background: rgba(255, 240, 220, 0.06);
    border-color: rgba(255, 240, 220, 0.14);
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
    margin: 0.3rem 0 0.25rem;
    font-size: 2.1rem;
    color: #fff8ef;
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
