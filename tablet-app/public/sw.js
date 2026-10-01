const CACHE_NAME = 'pos-tablet-shell-v1';
const SHELL_PREFIX = '/tablet/';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isCacheableApi(request) {
  return request.method === 'GET'
    && new URL(request.url).pathname.startsWith('/api/')
    && ['GET'].includes(request.method);
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
