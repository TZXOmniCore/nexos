// ── NexOS v3.0 Service Worker ──────────────────────────────
// CACHE DESATIVADO — serve sempre da rede para garantir atualizações
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  // Apaga TODOS os caches antigos (nexos-v1, nexos-v2, etc.)
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Sempre busca da rede — sem cache
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
