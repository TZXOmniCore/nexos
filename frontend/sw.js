/* NexOS — Service Worker com auto-update
   Estratégia:
   - HTML / JS / CSS → network-first 
   - Imagens / fontes → cache-first 
   - Supabase / APIs  → nunca cachear
*/

const CACHE_VERSION = 'nexos-v5';
const CACHE_STATIC  = CACHE_VERSION + '-static';

const NETWORK_FIRST = ['.html', '.js', '.css', 'manifest.json'];
const NEVER_CACHE   = ['supabase.co', 'googleapis.com', '/api/'];

// ── Install: pré-cacheia apenas o essencial ─────────────────
self.addEventListener('install', e => {
  self.skipWaiting(); // ativa imediatamente, sem esperar tab fechar
  e.waitUntil(
    caches.open(CACHE_STATIC).then(c =>
      c.addAll([
        './index.html',
        './styles.css',
        './api.js',
        './auth.js',
        './app.js',
        './manifest.json',
      ]).catch(() => {})
    )
  );
});

// ── Activate: apaga caches antigos e toma controle ─────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: roteamento por estratégia ───────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // Nunca interceptar Supabase nem APIs externas
  if (NEVER_CACHE.some(p => url.includes(p))) return;

  const isNetworkFirst = NETWORK_FIRST.some(ext => url.includes(ext));

  if (isNetworkFirst) {
    e.respondWith(networkFirst(e.request));
  } else {
    e.respondWith(cacheFirst(e.request));
  }
});

// ── Network-first: tenta rede, salva no cache, usa cache se offline ─
async function networkFirst(req) {
  const cache = await caches.open(CACHE_STATIC);
  try {
    const res = await fetch(req, { cache: 'no-store' }); // força bypass do cache do browser
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ── Cache-first: entrega cache imediato, atualiza em segundo plano ─
async function cacheFirst(req) {
  const cache  = await caches.open(CACHE_STATIC);
  const cached = await cache.match(req);
  if (cached) {
    fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ── Mensagem do cliente: força update manual se necessário ──
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
