// Retired — service workers caused more stuck-version problems than they
// solved. This file now only exists to self-destruct any lingering
// registration from earlier versions of the app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  await self.clients.claim();
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.registration.unregister();
});
self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));
