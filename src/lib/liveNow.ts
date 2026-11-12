import { liveQuery } from 'dexie';
import { readable, type Readable } from 'svelte/store';

/** How often time-dependent counts are worked out again while the screen is open. */
const TICK_MS = 30_000;

/**
 * Like Dexie's liveQuery, but the query gets the current time and also re-runs every half minute
 * and when the app comes back to the foreground. A plain liveQuery only re-runs on database
 * changes, so cards coming due later (learning steps, the next study day) weren't counted, and
 * two devices showed different numbers depending on when each last recounted.
 */
export function liveQueryNow<T>(query: (now: number) => Promise<T>): Readable<T | undefined> {
  return readable<T | undefined>(undefined, (set) => {
    let sub: { unsubscribe(): void } | undefined;
    // The previous value stays shown while the new query runs, so nothing flickers.
    const run = () => {
      sub?.unsubscribe();
      sub = liveQuery(() => query(Date.now())).subscribe({ next: set, error: (err) => console.warn('Query failed', err) });
    };
    const onVisible = () => {
      if (!document.hidden) run();
    };
    run();
    const timer = setInterval(run, TICK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      sub?.unsubscribe();
    };
  });
}
