// Minimal SW: no caching, just ensures update detection works reliably.
// Network-only so every fetch goes straight to GitHub Pages.
const VERSION = 'v728';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', event => {
  // Pass everything straight through — no caching at all
  event.respondWith(fetch(event.request));
});
