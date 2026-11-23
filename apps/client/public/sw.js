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

/*
 * Web push (Val 3B). The payload carries only a short title, a fixed line and
 * a link: { title, body, url, tag }. Details load after the app opens, behind
 * the login. A newer push with the same tag replaces the older one.
 */
function safePath(value) {
  // Only paths inside this app; never another site.
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'BCMS';
  const body = typeof data.body === 'string' ? data.body.slice(0, 160) : 'Deschide aplicația pentru detalii.';
  const options = {
    body,
    icon: '/pwa-192.png',
    data: { url: safePath(data.url) },
  };
  if (typeof data.tag === 'string' && data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      // The open app routes in place (src/pwa/pushLanding.ts) — no reload.
      await open.focus();
      open.postMessage({ type: 'bcms:push-open', url: path });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
