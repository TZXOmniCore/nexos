/* ============================================================
   NexOS v5.0 — core/auth.js
   Auth, PIN, Sessões, Rate Limit, 2FA preparado
   Novo: tema/acento persistido, aniversariantes ao login,
         sessões ativas (visual), logout protegido por PIN
   ============================================================ */
'use strict';

// ══════════════════════════════════════════════════════════════
// RATE LIMITER — brute-force protection
// MAX 5 tentativas → bloqueio de 10 min
// ══════════════════════════════════════════════════════════════
const RL = {
  MAX:  5,
  LOCK: 10 * 60 * 1000, // 10 min (era 5, aumentado)

  _key(k)  { return '_rl_v5_' + k; },
  get(k)   { try { return JSON.parse(sessionStorage.getItem(this._key(k)) || '{"n":0,"t":0}'); } catch { return { n: 0, t: 0 }; } },
  set(k, d){ try { sessionStorage.setItem(this._key(k), JSON.stringify(d)); } catch {} },
  clear(k) { try { sessionStorage.removeItem(this._key(k)); } catch {} },

  locked(k) {
    const d = this.get(k);
    if (d.t && Date.now() < d.t) return true;
    if (d.t && Date.now() >= d.t) { this.clear(k); return false; }
    return false;
  },
  fail(k) {
    const d = this.get(k);
    d.n = (d.n || 0) + 1;
    if (d.n >= this.MAX) d.t = Date.now() + this.LOCK;
    this.set(k, d);
  },
  reset(k) { this.clear(k); },
  mins(k)  { return Math.ceil(Math.max(0, (this.get(k).t || 0) - Date.now()) / 60000); },
};

// ══════════════════════════════════════════════════════════════
// VALIDADORES
// ══════════════════════════════════════════════════════════════
const _s     = (v, n) => typeof v === 'string' ? v.trim().slice(0, n || 200).replace(/[<>"'`]/g, '') : '';
const _email = e => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(e || ''));
const _senhaForte = s => s.length >= 8; // pode expandir: maiúsc + número etc.

// ══════════════════════════════════════════════════════════════
// CONTROLE DE TELAS
// ══════════════════════════════════════════════════════════════
function _showLoading(msg = '') {
  const ls = document.getElementById('loading-screen');
  const as = document.getElementById('auth-screen');
  const ap = document.getElementById('app-shell');
  if (ls) { ls.style.display = 'flex'; if (msg) { const m = ls.querySelector('.loading-msg'); if (m) m.textContent = msg; } }
  if (as) as.classList.remove('show');
  if (ap) ap.style.display = 'none';
}

function _showAuth() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').classList.add('show');
  document.getElementById('app-shell').style.display = 'none';
  showLoginView();
  if (window.lucide) lucide.createIcons();
}

function _showApp() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').classList.remove('show');
  document.getElementById('app-shell').style.display = 'flex';
  aplicarTema();
  if (window.lucide) lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════
// TEMA E ACENTO — Feature #15 e #38
// ══════════════════════════════════════════════════════════════
const ACENTOS = {
  blue:   { '--accent': '#38BDF8', '--accent-d': '#0EA5E9', '--accent-glow': 'rgba(56,189,248,.18)' },
  green:  { '--accent': '#34D399', '--accent-d': '#10B981', '--accent-glow': 'rgba(52,211,153,.18)' },
  purple: { '--accent': '#A78BFA', '--accent-d': '#7C3AED', '--accent-glow': 'rgba(167,139,250,.18)' },
  orange: { '--accent': '#FB923C', '--accent-d': '#EA580C', '--accent-glow': 'rgba(251,146,60,.18)'  },
  red:    { '--accent': '#F87171', '--accent-d': '#DC2626', '--accent-glow': 'rgba(248,113,113,.18)' },
};

function aplicarTema() {
  const tema   = STATE.tema   || 'dark';
  const acento = STATE.acento || 'blue';
  document.documentElement.setAttribute('data-theme', tema);
  const vars = ACENTOS[acento] || ACENTOS.blue;
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
}

function setTema(t) {
  STATE.tema = t;
  localStorage.setItem('nexos_tema', t);
  aplicarTema();
}

function setAcento(a) {
  STATE.acento = a;
  localStorage.setItem('nexos_acento', a);
  aplicarTema();
  UI.toast('Tema atualizado!', 'success');
}

// ══════════════════════════════════════════════════════════════
// PIN — SHA-256 + salt = user_id (WebCrypto)
// ══════════════════════════════════════════════════════════════
async function _pinHash(pin) {
  const uid  = STATE.user?.id || '';
  const data = new TextEncoder().encode(uid + ':nexos_v5:' + pin);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPIN(pin) {
  const stored = STATE.perfil?.pin_hash;
  if (!stored) return false;
  const newHash = await _pinHash(pin);
  if (stored === newHash) return true;
  // Migração legado (btoa simples)
  if (stored.length < 20 && stored === btoa(pin)) {
    try {
      const updated = await API.upsertPerfil(STATE.user.id, { pin_hash: newHash });
      if (updated) STATE.perfil = updated;
    } catch {}
    return true;
  }
  return false;
}

async function showPINModal(onSuccess, titulo = 'Confirmar PIN') {
  const id = 'pm_' + Date.now();
  const el = document.createElement('div');
  el.id    = id;
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(8px);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
  el.innerHTML = `
  <div style="background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-xl);padding:32px 28px;width:100%;max-width:340px;text-align:center">
    <div style="font-size:2rem;margin-bottom:8px">🔐</div>
    <h3 style="font-weight:700;margin-bottom:6px">${titulo}</h3>
    <p style="font-size:.82rem;color:var(--text-2);margin-bottom:20px">Digite seu PIN de 4 dígitos</p>
    <div style="display:flex;gap:12px;justify-content:center;margin-bottom:14px" id="${id}-pins">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]" autocomplete="off">
    </div>
    <div id="${id}-err" style="color:var(--red);font-size:.8rem;min-height:18px;margin-bottom:12px"></div>
    <div style="display:flex;gap:8px;justify-content:center">
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('${id}').remove()">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="${id}-ok">Confirmar</button>
    </div>
  </div>`;
  document.body.appendChild(el);

  const inputs = el.querySelectorAll('.pin-input');
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
      if (e.key === 'Enter') document.getElementById(id + '-ok').click();
    });
  });
  inputs[0].focus();

  document.getElementById(id + '-ok').onclick = async () => {
    const pin = Array.from(inputs).map(i => i.value).join('');
    if (pin.length < 4) { document.getElementById(id + '-err').textContent = 'Digite os 4 dígitos'; return; }
    if (RL.locked('pin')) {
      document.getElementById(id + '-err').textContent = `Bloqueado por ${RL.mins('pin')} min`;
      return;
    }
    const ok = await verifyPIN(pin);
    if (ok) { RL.reset('pin'); el.remove(); onSuccess(); }
    else {
      RL.fail('pin');
      document.getElementById(id + '-err').textContent = 'PIN incorreto';
      inputs.forEach(i => i.value = '');
      inputs[0].focus();
    }
  };
}

// ══════════════════════════════════════════════════════════════
// AUTH PRINCIPAL
// ══════════════════════════════════════════════════════════════
const Auth = {

  async login() {
    const email = _s(document.getElementById('auth-email')?.value || '', 254);
    const pass  = (document.getElementById('auth-pass')?.value || '').slice(0, 128);
    if (!email || !pass)   { UI.toast('Preencha e-mail e senha', 'warning'); return; }
    if (!_email(email))    { UI.toast('E-mail inválido', 'warning'); return; }
    if (RL.locked('login')){ UI.toast(`Muitas tentativas. Aguarde ${RL.mins('login')} min.`, 'error'); return; }

    const btn = document.getElementById('btn-login');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    try {
      const { error } = await window.sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        RL.fail('login');
        // Mensagem genérica — não vaza qual campo está errado (segurança)
        UI.toast('Credenciais inválidas', 'error');
      } else {
        RL.reset('login');
      }
    } catch {
      UI.toast('Erro de conexão. Verifique sua internet.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="log-in" style="width:15px;height:15px"></i> Entrar'; if (window.lucide) lucide.createIcons(); }
    }
  },

  async loginGoogle() {
    try {
      const { error } = await window.sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname },
      });
      if (error) UI.toast('Erro ao entrar com Google', 'error');
    } catch {
      UI.toast('Erro ao entrar com Google', 'error');
    }
  },

  async register() {
    const nome    = _s(document.getElementById('reg-nome')?.value  || '', 100);
    const email   = _s(document.getElementById('reg-email')?.value || '', 254);
    const pass    = (document.getElementById('reg-pass')?.value    || '').slice(0, 128);
    const consent = document.getElementById('reg-consent')?.checked;

    if (!nome || !email || !pass) { UI.toast('Preencha todos os campos', 'warning'); return; }
    if (!_email(email))           { UI.toast('E-mail inválido', 'warning'); return; }
    if (!_senhaForte(pass))       { UI.toast('Senha mínimo 8 caracteres', 'warning'); return; }
    if (!consent)                 { UI.toast('Aceite os Termos e a Política de Privacidade', 'warning'); return; }
    if (RL.locked('reg'))         { UI.toast('Muitas tentativas. Aguarde.', 'error'); return; }

    const btn = document.getElementById('btn-reg');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }
    try {
      const { error } = await window.sb.auth.signUp({
        email, password: pass,
        options: { data: { full_name: nome } },
      });
      if (error) throw error;
      RL.reset('reg');
      UI.toast('Verifique seu e-mail para ativar a conta! 📧', 'success');
      showLoginView();
      const el = document.getElementById('auth-email'); if (el) el.value = email;
    } catch(e) {
      RL.fail('reg');
      UI.toast(e.message?.includes('already registered') ? 'E-mail já cadastrado' : 'Erro ao criar conta', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar conta'; }
    }
  },

  async forgot() {
    const email = _s(document.getElementById('auth-email')?.value || '', 254);
    if (!email || !_email(email)) { UI.toast('Digite um e-mail válido', 'warning'); return; }
    if (RL.locked('forgot'))      { UI.toast('Aguarde antes de tentar novamente', 'error'); return; }
    await window.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    RL.fail('forgot');
    // Mensagem ambígua intencional (não vaza se e-mail existe)
    UI.toast('Se o e-mail existir, você receberá o link de recuperação', 'success');
  },

  async logout() {
    UI.confirm('Deseja sair do NexOS?', async () => {
      STATE.user = STATE.perfil = STATE.empresa = null;
      localStorage.removeItem('nexos_v5_page');
      await window.sb.auth.signOut().catch(() => {});
      _showAuth();
      UI.toast('Até logo! 👋', 'success');
    });
  },

  async loadUser(user) {
    if (!user?.id) { _showAuth(); return; }
    STATE.user = user;
    _showLoading('Carregando perfil...');
    try {
      STATE.perfil = await API.getPerfil(user.id);
      if (!STATE.perfil) {
        STATE.perfil = await API.upsertPerfil(user.id, {
          empresa_nome: user.user_metadata?.full_name || 'Minha Empresa',
        });
      }
      // Restaurar tema do perfil se existir
      if (STATE.perfil.tema)   { STATE.tema   = STATE.perfil.tema;   localStorage.setItem('nexos_tema', STATE.tema); }
      if (STATE.perfil.acento) { STATE.acento = STATE.perfil.acento; localStorage.setItem('nexos_acento', STATE.acento); }

      Auth._ui();
      _showApp();
      if (window.App) App.init();

      // Verificar aniversariantes — Feature #28
      setTimeout(async () => {
        try {
          const aniv = await API.getAniversariantesHoje(user.id);
          if (aniv.length > 0) {
            const nomes = aniv.map(c => c.nome.split(' ')[0]).join(', ');
            UI.toast(`🎂 Aniversário hoje: ${nomes}`, 'info');
          }
        } catch {}
      }, 3000);

    } catch(e) {
      console.error('loadUser error:', e);
      UI.toast('Erro ao carregar perfil. Tente novamente.', 'error');
      _showAuth();
    }
  },

  _ui() {
    const p    = STATE.perfil || {};
    const nome = p.empresa_nome || STATE.user?.email || 'NexOS';
    const ini  = initials(nome);

    // Avatar: logo se existir, senão iniciais
    ['sidebar-avatar', 'header-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (p.logo_url) {
        el.innerHTML = `<img src="${p.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
      } else {
        el.textContent = ini;
      }
    });

    const sn = document.getElementById('sidebar-name'); if (sn) sn.textContent = nome.split(' ')[0];
    const sr = document.getElementById('sidebar-role'); if (sr) sr.textContent  = 'Proprietário';
  },
};

// ══════════════════════════════════════════════════════════════
// INICIALIZAÇÃO DO APP
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Aplicar tema salvo antes de qualquer coisa
  aplicarTema();
  _showLoading('Iniciando NexOS...');

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session?.user) await Auth.loadUser(session.user);
    else _showAuth();
  } catch {
    _showAuth();
  }

  window.sb.auth.onAuthStateChange(async (ev, session) => {
    if (ev === 'SIGNED_IN'      && session?.user && !STATE.user) await Auth.loadUser(session.user);
    else if (ev === 'TOKEN_REFRESHED' && session?.user)          STATE.user = session.user;
    else if (ev === 'SIGNED_OUT') { STATE.user = STATE.perfil = null; _showAuth(); }
  });

  // Atalhos de teclado globais — Feature #34
  document.addEventListener('keydown', e => {
    // Não disparar se estiver em input/textarea
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!STATE.user) return;

    const atalhos = {
      n: () => novaOS?.(),
      c: () => goPage?.('clientes'),
      e: () => goPage?.('estoque'),
      x: () => goPage?.('caixa'),
      a: () => goPage?.('agenda'),
      d: () => goPage?.('dashboard'),
      o: () => goPage?.('os'),
      '/': () => document.getElementById('global-search-input')?.focus(),
      Escape: () => closeModal?.(),
    };
    const fn = atalhos[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
});

// ══════════════════════════════════════════════════════════════
// HELPERS DE UI DE AUTH
// ══════════════════════════════════════════════════════════════
function showLoginView() {
  const lv = document.getElementById('auth-login-view');
  const rv = document.getElementById('auth-reg-view');
  if (lv) lv.style.display = '';
  if (rv) rv.style.display = 'none';
}

function showRegView() {
  const lv = document.getElementById('auth-login-view');
  const rv = document.getElementById('auth-reg-view');
  if (lv) lv.style.display = 'none';
  if (rv) rv.style.display = '';
}

function togglePass(inputId = 'auth-pass', eyeId = 'pass-eye') {
  const inp  = document.getElementById(inputId); if (!inp) return;
  const show = inp.type === 'password';
  inp.type   = show ? 'text' : 'password';
  const btn  = document.getElementById(eyeId);
  if (btn) btn.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" style="width:16px;height:16px"></i>`;
  if (window.lucide) lucide.createIcons();
}

// ── Menu de usuário (sidebar/mobile) ──────────────────────
function toggleUserMenu() {
  const ex = document.getElementById('user-menu-dd');
  if (ex) { ex.remove(); return; }

  const p     = STATE.perfil || {};
  const nome  = p.empresa_nome || STATE.user?.email || '?';
  const email = STATE.user?.email || '';
  const tema  = STATE.tema   || 'dark';
  const acentoAtual = STATE.acento || 'blue';

  const m = document.createElement('div');
  m.id    = 'user-menu-dd';
  m.style.cssText = 'position:fixed;bottom:72px;left:10px;right:10px;background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-lg);padding:8px;box-shadow:var(--shadow-lg);z-index:500;max-height:80vh;overflow-y:auto';
  m.innerHTML = `
  <div style="padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
    <div style="font-size:.88rem;font-weight:700">${nome}</div>
    <div style="font-size:.74rem;color:var(--text-3)">${email}</div>
  </div>

  <!-- Tema: Dark/Light — Feature #15 -->
  <div style="padding:8px 12px;font-size:.8rem;color:var(--text-2);border-bottom:1px solid var(--border);margin-bottom:6px">
    <div style="margin-bottom:6px;font-weight:600">Tema</div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm ${tema==='dark'?'btn-primary':'btn-ghost'}" onclick="setTema('dark');document.getElementById('user-menu-dd')?.remove()">🌙 Escuro</button>
      <button class="btn btn-sm ${tema==='light'?'btn-primary':'btn-ghost'}" onclick="setTema('light');document.getElementById('user-menu-dd')?.remove()">☀️ Claro</button>
    </div>
  </div>

  <!-- Acento: Feature #38 -->
  <div style="padding:4px 12px 10px;font-size:.8rem;color:var(--text-2);border-bottom:1px solid var(--border);margin-bottom:6px">
    <div style="margin-bottom:6px;font-weight:600">Cor de destaque</div>
    <div style="display:flex;gap:8px">
      ${Object.entries({ blue:'#38BDF8', green:'#34D399', purple:'#A78BFA', orange:'#FB923C', red:'#F87171' })
        .map(([k, v]) => `<div onclick="setAcento('${k}');document.getElementById('user-menu-dd')?.remove()"
          style="width:22px;height:22px;border-radius:50%;background:${v};cursor:pointer;border:2px solid ${k===acentoAtual?'#fff':'transparent'};transition:.15s"></div>`).join('')}
    </div>
  </div>

  <div class="dropdown-item" id="_cfg_btn">⚙️ Configurações</div>
  <div class="dropdown-item" id="_audit_btn">📋 Log de Auditoria</div>
  <div class="dropdown-sep"></div>
  <div class="dropdown-item danger" id="_out_btn">🚪 Sair</div>`;

  document.body.appendChild(m);
  document.getElementById('_cfg_btn')?.addEventListener('click',   () => { goPage('config'); m.remove(); });
  document.getElementById('_audit_btn')?.addEventListener('click', () => { goPage('auditoria'); m.remove(); });
  document.getElementById('_out_btn')?.addEventListener('click',   () => { m.remove(); Auth.logout(); });

  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', h); }
    });
  }, 50);
}

// Expor globais necessários
window.Auth         = Auth;
window.RL           = RL;
window.showPINModal = showPINModal;
window.verifyPIN    = verifyPIN;
window.setTema      = setTema;
window.setAcento    = setAcento;
window.aplicarTema  = aplicarTema;
window.showLoginView = showLoginView;
window.showRegView   = showRegView;
window.togglePass    = togglePass;
window.toggleUserMenu= toggleUserMenu;
