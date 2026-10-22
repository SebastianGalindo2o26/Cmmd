const CACHE_NAME = 'pos-tablet-shell-v2';
const CACHE_PREFIX = 'pos-tablet-shell-';
const SHELL_PREFIX = '/tablet/';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

function isCacheableApi(request) {
  if (request.method !== 'GET') return false;
  const pathname = new URL(request.url).pathname;
  return ['/api/categorias', '/api/productos', '/api/modificadores'].includes(pathname);
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (requestUrl.pathname.startsWith(SHELL_PREFIX) || isCacheableApi(event.request)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        return cached ?? new Response('Sin conexión', { status: 503 });
      }
    })());
  }
});
