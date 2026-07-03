// One-shot SW: clears all caches and unregisters itself silently.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  await self.clients.claim();
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.registration.unregister();
});
self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));
