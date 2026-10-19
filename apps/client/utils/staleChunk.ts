/**
 * The "this tab runs an old build" decision behind src/lazyRoute.ts.
 *
 * The first stale chunk reloads the page once (a cooldown in sessionStorage
 * guards against reload loops). Every later stale-chunk failure IN THE SAME
 * PAGE is part of that same reload: Vite reports a failed dependency preload
 * and then the failed route import separately, and the second report fell
 * inside the cooldown, was treated as a real failure and flashed the error
 * screen until the reload landed (E2E-1). Once a reload is under way the
 * answer stays "handled".
 */
export type StaleChunkEnv = {
  now: () => number;
  /** Last reload time from sessionStorage (may throw: storage blocked). */
  read: () => number;
  write: (value: number) => void;
  reload: () => void;
};

export const STALE_CHUNK_COOLDOWN_MS = 30_000;

export function createStaleChunkGuard(env: StaleChunkEnv, cooldownMs = STALE_CHUNK_COOLDOWN_MS) {
  let reloading = false;
  /** True when the failure is handled by a reload (now or already under way). */
  return function handleStaleChunk(): boolean {
    if (reloading) return true;
    try {
      if (env.now() - env.read() < cooldownMs) return false;
      env.write(env.now());
    } catch {
      // Storage unavailable: still reload — a loop is unlikely without a real
      // server-side breakage, and a stuck screen is worse.
    }
    reloading = true;
    env.reload();
    return true;
  };
}
