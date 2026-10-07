<script lang="ts">
  import { onMount } from 'svelte';
  import { Game } from '../game/engine';
  import { Renderer } from '../game/render';
  import { InputController } from '../game/input';

  let {
    seconds,
    title = 'Test run',
    lettersBefore = null,
    buttonLabel = 'Done',
    autoContinueMs = 0,
    onfinish,
  }: {
    /** Length of the run. */
    seconds: number;
    /** Shown above "Ready?", e.g. "Run 1 of 2". */
    title?: string;
    /** Letters from earlier runs of the same library run; null for a test run. */
    lettersBefore?: number | null;
    buttonLabel?: string;
    /** If set, the results show this long and then continue on their own (tap to continue sooner). */
    autoContinueMs?: number;
    /** Called with this run's letters (0 if skipped). */
    onfinish: (letters: number) => void;
  } = $props();

  let phase = $state<'intro' | 'playing' | 'results'>('intro');
  let score = $state(0);
  let endReason = $state<'time' | 'hearts' | null>(null);

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let game: Game;
  let input: InputController | null = null;
  let hintTime = 0;
  let resultsAt = 0;
  let continueTimer: ReturnType<typeof setTimeout> | undefined;
  let continued = false;

  const touch = matchMedia('(pointer: coarse)').matches;
  const hint = touch ? 'Swipe to dodge · tap to jump · collect letters' : '← → dodge · ↑ / Space jump · collect letters';

  onMount(() => {
    game = new Game();
    const renderer = new Renderer(canvas);

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
        else if (e.type === 'rumble') navigator.vibrate?.([120, 60, 120, 60, 200]);
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
      clearTimeout(continueTimer);
    };
  });

  function start() {
    input = new InputController(canvas);
    game.start(seconds);
    hintTime = 0;
    phase = 'playing';
  }

  function finish(reason: 'time' | 'hearts') {
    input?.destroy();
    input = null;
    endReason = reason;
    score = game.score;
    resultsAt = performance.now();
    phase = 'results';
    if (autoContinueMs > 0) continueTimer = setTimeout(done, autoContinueMs);
  }

  /** Leaves the results (once), by button, Enter, tap or timer. */
  function done() {
    if (continued) return;
    continued = true;
    clearTimeout(continueTimer);
    onfinish(score);
  }

  // A tap meant for the game right as time runs out shouldn't skip the results.
  const settled = () => performance.now() - resultsAt > 600;

  function onKeydown(e: KeyboardEvent) {
    if (phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      start();
    } else if (phase === 'intro' && e.key === 'Escape') {
      e.preventDefault();
      onfinish(0);
    } else if (phase === 'results' && e.key === 'Enter' && performance.now() - resultsAt > 700) {
      // Only Enter (not Space, which is also jump) and not right after the run ends.
      e.preventDefault();
      done();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="runner" bind:this={container}>
  <canvas bind:this={canvas}></canvas>

  {#if phase === 'intro'}
    <!-- A title over the dark end of the corridor; the whole screen starts the run. -->
    <button class="intro" onclick={start} aria-label="Start the run">
      <span class="intro-kicker">{title} · {seconds} s</span>
      <span class="intro-title">Ready?</span>
      <span class="intro-hint">{hint}</span>
      <span class="intro-go">{touch ? 'Tap anywhere to fly' : 'Click or press Space to fly'}</span>
    </button>
    <button class="skip-chip" onclick={() => onfinish(0)}>Skip</button>
  {:else if phase === 'results'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Enter continues too) -->
    <div class="overlay" onclick={() => autoContinueMs > 0 && settled() && done()}>
      <div class="sheet">
        <p class="kicker">{endReason === 'hearts' ? 'Out of hearts' : "Time's up"}</p>
        <h2>{score}</h2>
        <p class="muted small">{score === 1 ? 'letter' : 'letters'} collected</p>
        {#if lettersBefore !== null}
          <p class="best">{lettersBefore + score} letters this library run</p>
        {/if}
        {#if autoContinueMs > 0}
          <p class="muted small next">{buttonLabel}…</p>
          <div class="countdown"><span style="animation-duration: {autoContinueMs}ms"></span></div>
        {:else}
          <div class="buttons">
            <button class="btn primary big" onclick={done}>{buttonLabel}</button>
          </div>
        {/if}
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

  /* Start screen: a title in the dark far end of the corridor, above the firefly. The whole
     screen is the start button; it fades in rather than popping up. */
  .intro {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.35rem;
    padding: max(16vh, 5rem) 16px 16px;
    font: inherit;
    text-align: center;
    color: #f4ede4;
    /* Darker right behind the text (the corridor's lamps hang there), lighter around the firefly. */
    background:
      radial-gradient(ellipse 34rem 15rem at 50% calc(max(16vh, 5rem) + 4.5rem), rgba(20, 12, 7, 0.62), transparent 70%),
      radial-gradient(ellipse 80% 70% at 50% 35%, rgba(20, 12, 7, 0.12), rgba(20, 12, 7, 0.55));
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    animation: intro-in 0.5s ease-out both;
  }

  .intro-kicker {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(242, 195, 91, 0.85);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
  }

  .intro-title {
    font-family: var(--serif);
    font-size: clamp(2.8rem, 10vw, 4.2rem);
    font-weight: 600;
    line-height: 1.05;
    color: #fff8ef;
    text-shadow:
      0 0 28px rgba(255, 214, 140, 0.45),
      0 2px 14px rgba(0, 0, 0, 0.55);
  }

  .intro-hint {
    max-width: 22rem;
    font-size: 0.88rem;
    color: rgba(244, 237, 228, 0.75);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
  }

  /* The call to action breathes like the firefly's lantern. */
  .intro-go {
    margin-top: 1.6rem;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #e6f07a;
    text-shadow: 0 0 14px rgba(228, 240, 130, 0.5);
    animation: breathe 2.4s ease-in-out infinite;
  }

  .intro:focus-visible .intro-title {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 0.2em;
  }

  .skip-chip {
    position: absolute;
    top: calc(14px + env(safe-area-inset-top));
    right: 14px;
    padding: 0.4rem 0.95rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(244, 237, 228, 0.8);
    background: rgba(30, 20, 13, 0.55);
    border: 1px solid rgba(255, 240, 220, 0.16);
    border-radius: 999px;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    cursor: pointer;
    animation: intro-in 0.5s ease-out both;
  }

  .skip-chip:hover {
    color: #fff8ef;
    border-color: rgba(255, 240, 220, 0.32);
  }

  @keyframes intro-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @keyframes breathe {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .intro,
    .skip-chip,
    .intro-go {
      animation: none;
    }
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

  .next {
    margin: 1.1rem 0 0.5rem;
  }

  /* Empties while the results wait, then the cards come back on their own. */
  .countdown {
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 240, 220, 0.12);
    overflow: hidden;
  }

  .countdown span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    animation: countdown linear forwards;
  }

  @keyframes countdown {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
