/* Public application assets only; API responses and personal reports are never cached. */
const CACHE = 'regiomovil-shell-v1';
const CORE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  .../* BUILD_ASSETS */ [],
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('regiomovil-shell-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    // Only application routes may replace the offline application shell.
    if (url.pathname !== '/index.html' && /\/[^/]+\.[^/]+$/.test(url.pathname)) return;
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE);
            await cache.put('/index.html', copy);
          }
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || CORE.includes(url.pathname))
    event.respondWith(
      // Public static bytes do not vary by Origin. Module/font requests add that
      // header while precache requests omit it; preserve the exact URL/search.
      caches.match(event.request, { ignoreVary: true }).then(
        (cached) =>
          cached ||
          fetch(event.request).then(async (response) => {
            if (response.ok) {
              const copy = response.clone();
              const cache = await caches.open(CACHE);
              await cache.put(event.request, copy);
            }
            return response;
          }),
      ),
    );
});
