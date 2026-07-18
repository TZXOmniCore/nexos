/* ============================================================
   NexOS v5.1 — sw.js
   Service Worker
   - HTML / JS / CSS  → network-first (sempre atualizado)
   - Imagens / fontes → cache-first (rápido offline)
   - Supabase / APIs  → nunca cachear
   - Push de OS vencida (#9)
   - Auto-update sem precisar fechar aba
   ============================================================ */

const CACHE_VER    = 'nexos-v5.1';
const CACHE_STATIC = CACHE_VER + '-static';
const CACHE_FONT   = CACHE_VER + '-fonts';

// Arquivos que precisam estar offline
const PRECACHE = [
  './index.html',
  './styles.css',
  './api.js',
  './auth.js',
  './app.js',
  './manifest.json',
  './NexOS.png',
];

// Estratégia por tipo
const NETWORK_FIRST_EXT = ['.html', '.js', '.css'];
const CACHE_FIRST_EXT   = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'];

// ══ INSTALL — pré-cacheia essenciais ════════════════════════
self.addEventListener('install', e => {
  self.skipWaiting(); // ativa sem esperar fechar aba
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(PRECACHE).catch(() => {}))
  );
});

// ══ ACTIVATE — limpa caches antigos e assume controle ═══════
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_FONT)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

const NEVER_CACHE_HOSTS = ['supabase.co', 'googleapis.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const FONT_HOSTS        = ['fonts.gstatic.com', 'fonts.googleapis.com'];

// Confere o host de verdade (via URL parseada), não uma substring solta —
// evita bypass tipo "https://evil.com/?x=supabase.co" ou "supabase.co.evil.com"
// sendo tratados como se fossem o host confiável (CodeQL: incomplete URL substring sanitization)
function _hostMatches(hostname, list) {
  return list.some(h => hostname === h || hostname.endsWith('.' + h));
}

// ══ FETCH — roteamento por estratégia ═══════════════════════
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  let u;
  try { u = new URL(e.request.url); } catch { return; }

  // Segurança: apenas http/https
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;

  // Nunca interceptar Supabase, CDNs externos ou chamadas de API
  if (_hostMatches(u.hostname, NEVER_CACHE_HOSTS) || u.pathname.includes('/api/')) return;

  const ext = u.pathname.slice(u.pathname.lastIndexOf('.'));
  const isCacheFirst   = CACHE_FIRST_EXT.includes(ext);
  const isNetworkFirst = NETWORK_FIRST_EXT.some(e2 => u.pathname.endsWith(e2)) || u.pathname.endsWith('manifest.json');
  const isFontReq      = _hostMatches(u.hostname, FONT_HOSTS);

  if (isFontReq) {
    e.respondWith(cacheFirstWithFallback(e.request, CACHE_FONT));
  } else if (isCacheFirst) {
    e.respondWith(cacheFirstWithFallback(e.request, CACHE_STATIC));
  } else if (isNetworkFirst) {
    e.respondWith(networkFirst(e.request));
  } else {
    e.respondWith(networkFirst(e.request));
  }
});

// ── Network-first: tenta rede → cache → offline ─────────────
async function networkFirst(req) {
  const cache = await caches.open(CACHE_STATIC);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) {
      // Só cacheia responses do mesmo origin ou arquivos estáticos
      const resClone = res.clone();
      cache.put(req, resClone).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback para index.html em erros de navegação
    if (req.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'Sem conexão com a internet' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Cache-first: entrega cache → atualiza em background ─────
async function cacheFirstWithFallback(req, cacheName = CACHE_STATIC) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    // Atualiza em background (stale-while-revalidate)
    fetch(req)
      .then(res => { if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return new Response('Recurso indisponível offline', { status: 503 });
  }
}

// ══ MENSAGENS DO CLIENTE ════════════════════════════════════
self.addEventListener('message', e => {
  // Força update quando nova versão disponível
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Feature #9 — Push de OS vencidas: cliente solicita verificação
  if (e.data?.type === 'CHECK_OS_VENCIDAS') {
    const { osVencidas, empresa } = e.data;
    if (!osVencidas || !osVencidas.length) return;

    // Só notifica se usuário não está com o app aberto
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const appAberto = clients.some(c => c.visibilityState === 'visible');
      if (!appAberto && 'Notification' in self && Notification.permission === 'granted') {
        self.registration.showNotification('NexOS — OS em Fiado', {
          body: `${osVencidas.length} OS em fiado aguardando pagamento.\nToque para abrir o app.`,
          icon: './NexOS.png',
          badge: './NexOS.png',
          tag: 'nexos-fiado',
          requireInteraction: false,
          data: { url: './index.html', page: 'os' },
          actions: [
            { action: 'abrir', title: '📋 Ver OS' },
            { action: 'ignorar', title: 'Ignorar' },
          ],
        });
      }
    });
  }

  // Push de agenda do dia
  if (e.data?.type === 'PUSH_AGENDA') {
    const { eventos, empresa } = e.data;
    if (!eventos || !eventos.length) return;
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const appAberto = clients.some(c => c.visibilityState === 'visible');
      if (!appAberto && Notification.permission === 'granted') {
        const lista = eventos.slice(0, 3).map(ev =>
          `• ${ev.titulo}${ev.hora ? ' às ' + ev.hora : ''}`
        ).join('\n');
        self.registration.showNotification(`NexOS — Agenda de ${empresa || 'Hoje'}`, {
          body: lista,
          icon: './NexOS.png',
          badge: './NexOS.png',
          tag: 'nexos-agenda',
          data: { url: './index.html', page: 'agenda' },
        });
      }
    });
  }

  // Push de parcelas vencidas
  if (e.data?.type === 'PUSH_PARCELAS') {
    const { count } = e.data;
    if (!count) return;
    if (Notification.permission === 'granted') {
      self.registration.showNotification('NexOS — Parcelas Vencidas', {
        body: `${count} parcela(s) vencida(s) aguardando pagamento.`,
        icon: './NexOS.png',
        badge: './NexOS.png',
        tag: 'nexos-parcelas',
        data: { url: './index.html', page: 'carnes' },
      });
    }
  }
});

// ══ CLIQUE NA NOTIFICAÇÃO ═══════════════════════════════════
self.addEventListener('notificationclick', e => {
  e.notification.close();

  const data    = e.notification.data || {};
  const action  = e.action;
  const pageUrl = data.url || './index.html';

  if (action === 'ignorar') return;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Se o app já está aberto, foca e navega
      const existing = clients.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
      if (existing) {
        existing.focus();
        if (data.page) {
          existing.postMessage({ type: 'NAVIGATE', page: data.page });
        }
        return;
      }
      // Senão, abre nova aba
      if (self.clients.openWindow) {
        return self.clients.openWindow(pageUrl);
      }
    })
  );
});

// ══ PUSH EXTERNO (servidor) — preparado para V6 ═════════════
self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const payload = e.data.json();
    e.waitUntil(
      self.registration.showNotification(payload.title || 'NexOS', {
        body:  payload.body  || '',
        icon:  payload.icon  || './NexOS.png',
        badge: payload.badge || './NexOS.png',
        tag:   payload.tag   || 'nexos-push',
        data:  payload.data  || {},
      })
    );
  } catch {
    // Payload não é JSON — ignora
  }
});

// ══ SYNC EM BACKGROUND (preparado para V6) ══════════════════
self.addEventListener('sync', e => {
  if (e.tag === 'nexos-sync-os') {
    // Placeholder para sincronização offline → online na V6
    e.waitUntil(Promise.resolve());
  }
});
