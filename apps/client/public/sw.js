/*
 * BCMS service worker.
 *
 * Strategy per request type:
 *   • Navigations      → network first; offline falls back to the cached shell.
 *   • /assets/* (Vite) → cache first. Filenames are content-hashed, so a cached
 *                        copy can never be stale.
 *   • Other same-origin GETs → network first, cache as offline fallback.
 *   • Cross-origin     → not touched. v1 cached EVERY GET cache-first,
 *                        including third-party scripts (the Clerk auth SDK,
 *                        Stripe) and uploaded avatars — those were then pinned
 *                        on the device forever and never updated.
 *   • API (/api/*)     → never cached.
 *
 * Bump CACHE_NAME to drop every previously cached response on activate.
 */
const CACHE_NAME = 'bcms-web-v3';
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-icon.svg', '/pwa-192.png', '/apple-touch-icon.png'];
/** Old hashed bundles pile up across deploys; keep the cache bounded. */
const MAX_ENTRIES = 150;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function trimCache() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const excess = keys.length - MAX_ENTRIES;
  if (excess <= 0) return;
  // Oldest insertions first; never evict the app shell.
  const shell = new Set(APP_SHELL.map((path) => new URL(path, self.location.origin).href));
  const evictable = keys.filter((request) => !shell.has(request.url));
  await Promise.all(evictable.slice(0, excess).map((request) => cache.delete(request)));
}

function isCacheable(response) {
  return response && response.status === 200 && response.type === 'basic';
}

/**
 * A request for a chunk that no longer exists (old deploy) is answered with
 * index.html by the SPA fallback. Never cache that under the .js/.css URL —
 * v1 did, which pinned the broken response on the device.
 */
function isAssetResponse(response) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  return !type.includes('text/html');
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response) && isAssetResponse(response)) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).then(trimCache);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
