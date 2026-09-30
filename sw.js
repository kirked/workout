/* Service worker: keeps a copy of the app on the device so it opens with no internet.
   Strategy: serve the cached page instantly, then refresh the cache in the background,
   so a new version published to the site is picked up on the following launch. */
'use strict';

const CACHE = 'workout-v1';
const PAGE = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add(new Request(PAGE, { cache: 'reload' }))).then(() => self.skipWaiting()));
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
    const refresh = fetch(PAGE, { cache: 'no-cache' })
      .then(res => { if (res.ok) cache.put(PAGE, res.clone()); return res; })
      .catch(() => null);
    if (cached) { e.waitUntil(refresh); return cached; }
    return (await refresh) || new Response('Offline — open the app once with a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }));
});
