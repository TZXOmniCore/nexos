const CACHE = 'nexos-v2';
const FILES = [
  '/nexos/frontend/index.html',
  '/nexos/frontend/styles.css',
  '/nexos/frontend/api.js',
  '/nexos/frontend/auth.js',
  '/nexos/frontend/app.js',
  '/nexos/frontend/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
