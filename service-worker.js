const CACHE_NAME = 'multidisplay-v6';
const PRECACHE_URLS = [
  './',
  'index.html',
  'style.css',
  'cube.js',
  'effects.js',
  'f1.js',
  'ui.js',
  'three.min.js',
  'version.js',
  'manifest.json'
];

// Install: pre-cache all static assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for /api/* routes
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept cross-origin requests (CDN scripts like Three.js)
  if (url.origin !== self.location.origin) return;

  // Network-first for API routes (live data must be fresh)
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for all other static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
