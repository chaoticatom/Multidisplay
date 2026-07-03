// Self-destructing SW — clears all caches, unregisters itself, reloads clients.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', async () => {
  await self.clients.claim();
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'SW_DESTROYED' }));
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
