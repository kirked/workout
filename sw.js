/* Service worker: keeps a copy of the app on the device so it opens with no internet.
   Strategy: serve the cached page instantly, then refresh the cache in the background.
   When the refresh finds a new version, a flag is stored; the page asks ("check") on launch
   and when brought back to the foreground, and offers a one-tap reload when the flag is set. */
'use strict';

const CACHE = 'workout-v1';
const PAGE = new URL('./index.html', self.registration.scope).href;
const FLAG = new URL('./__update-ready', self.registration.scope).href;   // cache entry, not a real file

/** Fetch the latest page into the cache; flag it if it differs from the copy we had. */
async function refresh() {
  const cache = await caches.open(CACHE);
  const res = await fetch(PAGE, { cache: 'no-cache' }).catch(() => null);
  if (!res || !res.ok) return;
  const old = await cache.match(PAGE);
  const [fresh, prev] = await Promise.all([res.clone().text(), old ? old.text() : null]);
  await cache.put(PAGE, res);
  if (prev !== null && fresh !== prev) await cache.put(FLAG, new Response('1'));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await refresh();
    if (!(await caches.match(PAGE))) throw new Error('could not cache the app');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Any page load within the app's folder (e.g. "/workout/" or "/workout/index.html") gets the app.
  const isPage = req.mode === 'navigate' || req.url === PAGE;
  if (!isPage) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(PAGE);
    if (cached) {
      // This load shows the newest cached copy, so any pending "update ready" is now satisfied.
      e.waitUntil(cache.delete(FLAG).then(refresh));
      return cached;
    }
    const res = await fetch(PAGE, { cache: 'no-cache' }).catch(() => null);
    if (res && res.ok) { await cache.put(PAGE, res.clone()); return res; }
    return new Response('Offline — open the app once with a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }));
});

// The page asks whether a newer version is waiting.
self.addEventListener('message', e => {
  if (e.data?.type !== 'check') return;
  e.waitUntil((async () => {
    await refresh();
    if (await caches.match(FLAG)) e.source?.postMessage({ type: 'update-ready' });
  })());
});
