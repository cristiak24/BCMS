import { createElement, lazy, useSyncExternalStore, type ComponentType } from 'react';
import { createStaleChunkGuard } from '../utils/staleChunk';

/**
 * Route-level code splitting that survives deploys and gives instant feedback.
 *
 * WHY
 * ---
 * Every screen is a lazy chunk with a content-hashed name. A phone keeps the
 * app open for days; after a deploy the old in-memory app still asks for the
 * OLD chunk names, which no longer exist. Cloudflare answers the missing .js
 * with index.html (SPA fallback), the dynamic import rejects, and the screen
 * never renders — "it freezes when I change pages, a refresh fixes it". On a
 * slow mobile connection even a healthy first visit to a screen showed
 * nothing for seconds, which read as the same freeze.
 *
 * WHAT
 * ----
 *  • lazyRoute(): a failed chunk import reloads the page once (so the fresh
 *    index.html + chunk names are picked up), guarded against reload loops.
 *  • A pending-import counter drives <RouteProgress/>, a thin bar shown the
 *    moment a tap starts loading a screen.
 *  • prefetchRoutes(): warm the chunks a role will use, during idle time, so
 *    most navigations don't wait on the network at all.
 */

type Factory<T> = () => Promise<{ default: T }>;

const RELOAD_KEY = 'bcms.chunk-reload-at';

let pending = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function track<T>(promise: Promise<T>) {
  pending += 1;
  emit();
  return promise.finally(() => {
    pending -= 1;
    emit();
  });
}

function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|MIME type|ChunkLoadError|Unable to preload CSS/i.test(message);
}

/**
 * Reload once to pick up the current deploy (utils/staleChunk.ts). True when
 * the failure is handled — including every later report while that reload
 * is under way; false if this page already came from such a reload.
 */
export const reloadForStaleChunk = createStaleChunkGuard({
  now: () => Date.now(),
  read: () => Number(sessionStorage.getItem(RELOAD_KEY) || 0),
  write: (value) => sessionStorage.setItem(RELOAD_KEY, String(value)),
  reload: () => window.location.reload(),
});

const loaded = new WeakMap<Factory<unknown>, Promise<unknown>>();
/** Modules whose import already settled, so they can render synchronously. */
const resolved = new WeakMap<Factory<unknown>, unknown>();

function load<T>(factory: Factory<T>): Promise<{ default: T }> {
  const cached = loaded.get(factory as Factory<unknown>);
  if (cached) return cached as Promise<{ default: T }>;

  const promise = factory().then((module) => {
    if (!module) {
      // A stale chunk, already handled: our `vite:preloadError` listener
      // cancelled the event to reload the page, and Vite's preload helper
      // then resolves the import with undefined instead of throwing. Reading
      // `.default` here flashed the error screen until the reload landed
      // (E2E-1). Stay pending — the page is going away.
      loaded.delete(factory as Factory<unknown>);
      return new Promise<{ default: T }>(() => {});
    }
    resolved.set(factory as Factory<unknown>, module.default);
    return module;
  }, (error) => {
    // Allow a later retry instead of caching the failure.
    loaded.delete(factory as Factory<unknown>);
    throw error;
  });
  loaded.set(factory as Factory<unknown>, promise);
  return promise;
}

/** Start loading route chunks right now (not in idle time); errors are ignored. */
export function preloadRoutes(factories: Factory<unknown>[]) {
  factories.forEach((factory) => {
    load(factory).catch(() => undefined);
  });
}

export function lazyRoute<T extends ComponentType<any>>(factory: Factory<T>) {
  const Lazy = lazy(() => track(
    load(factory).catch((error) => {
      if (isChunkLoadError(error) && reloadForStaleChunk()) {
        // Keep the Suspense fallback up while the page reloads.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }),
  ));

  // React.lazy suspends on its first render even when the chunk was already
  // prefetched, which flashed the loading fallback on every first visit to a
  // screen. Render an already-loaded module directly instead.
  function LazyRoute(props: any) {
    const Loaded = resolved.get(factory as Factory<unknown>) as ComponentType<any> | undefined;
    return createElement(Loaded ?? Lazy, props);
  }
  return LazyRoute as unknown as T;
}

/** Warm chunks in idle time; failures are ignored (the real navigation retries). */
export function prefetchRoutes(factories: Factory<unknown>[]) {
  const run = () => {
    factories.forEach((factory, index) => {
      window.setTimeout(() => {
        load(factory).catch(() => undefined);
      }, index * 150);
    });
  };

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else window.setTimeout(run, 1500);
}

export function useRouteLoading() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending > 0,
    () => false,
  );
}

if (typeof window !== 'undefined') {
  // Vite fires this when a <link rel=modulepreload>/CSS preload for a chunk
  // fails — the same stale-deploy situation, caught before the import.
  // Cancelling the event makes the failed import resolve with undefined,
  // which load() above holds pending until the reload replaces the page.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  });
}
