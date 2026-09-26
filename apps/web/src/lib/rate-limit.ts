/**
 * Fixed-window in-memory rate limiter. Single-process only — fine for the
 * demo deployment, not for multiple app instances. Stored on globalThis so
 * every route bundle (and dev-mode hot reloads) share one Map.
 */
interface Window {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as { __digivaultRateLimit?: Map<string, Window> };
const buckets = (globalForRateLimit.__digivaultRateLimit ??= new Map<string, Window>());

function liveWindow(key: string, now: number): Window | undefined {
  const win = buckets.get(key);
  if (win && win.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return win;
}

/** Seconds until `key` may try again, or 0 if it is under `limit`. Does not count an attempt. */
export function rateLimitRetryAfter(key: string, limit: number): number {
  const now = Date.now();
  const win = liveWindow(key, now);
  if (!win || win.count < limit) return 0;
  return Math.max(1, Math.ceil((win.resetAt - now) / 1000));
}

/** Counts one attempt against `key`; the window starts at the first attempt. */
export function recordAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const win = liveWindow(key, now);
  if (win) win.count += 1;
  else buckets.set(key, { count: 1, resetAt: now + windowMs });
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
