const CACHE_NAME = 'oncocare-v19';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './favicon.ico',
    './favicon.png',
    './favicon-48x48.png',
    './favicon-32x32.png',
    './favicon-16x16.png',
    './apple-touch-icon.png',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
          const cache = await caches.open(CACHE_NAME);
          await cache.addAll(APP_SHELL);
          await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames
                                  .filter((name) => name.startsWith('oncocare-') && name !== CACHE_NAME)
                                  .map((name) => caches.delete(name)));
          await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

                        event.respondWith((async () => {
                              try {
                                      const networkResponse = await fetch(new Request(request, { cache: 'no-store' }));
                                      if (networkResponse.ok && networkResponse.type === 'basic') {
                                                const cache = await caches.open(CACHE_NAME);
                                                await cache.put(request, networkResponse.clone());
                                      }
                                      return networkResponse;
                              } catch (error) {
                                      const cachedResponse = await caches.match(request);
                                      if (cachedResponse) return cachedResponse;
                                      throw error;
                              }
                        })());
});
