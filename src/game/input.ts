import type { Action } from './engine';

const SWIPE_MIN_PX = 28;

/** Turns swipes, taps and arrow keys into game actions. */
export class InputController {
  private queue: Action[] = [];
  private start: { x: number; y: number; id: number } | null = null;
  private swiped = false;

  constructor(private target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', this.onKey);
  }

  /** Returns and clears the actions since the last call. */
  take(): Action[] {
    const actions = this.queue;
    this.queue = [];
    return actions;
  }

  destroy(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('keydown', this.onKey);
  }

  private onDown = (e: PointerEvent) => {
    this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.swiped = false;
  };

  // Fire as soon as the finger has moved far enough, so swipes feel instant.
  private onMove = (e: PointerEvent) => {
    if (!this.start || this.swiped || e.pointerId !== this.start.id) return;
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    this.swiped = true;
    if (Math.abs(dx) > Math.abs(dy)) this.queue.push(dx < 0 ? 'left' : 'right');
    else if (dy < 0) this.queue.push('jump');
  };

  private onUp = (e: PointerEvent) => {
    if (!this.start || e.pointerId !== this.start.id) return;
    if (!this.swiped) this.queue.push('jump'); // a tap jumps
    this.start = null;
  };

  private onCancel = () => {
    this.start = null;
  };

  private onKey = (e: KeyboardEvent) => {
    const map: Record<string, Action> = {
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowUp: 'jump',
      w: 'jump',
      W: 'jump',
      ' ': 'jump',
    };
    const action = map[e.key];
    if (action && !e.repeat) {
      e.preventDefault();
      this.queue.push(action);
    }
  };
}
