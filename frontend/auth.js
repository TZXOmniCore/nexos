/* ============================================================
   NexOS v3.5 — auth.js
   SEGURANÇA: sessão persistente, rate limiting, sanitização,
   proteção brute-force, anti-enumeração, XSS prevention
   ============================================================ */

const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

// ── CLIENTE SUPABASE — SESSÃO PERSISTENTE ─────────────────
window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    storageKey:         'nexos_auth_v2',
    storage:            window.localStorage,
    detectSessionInUrl: true,
    flowType:           'pkce',
  }
});

// ── ESTADO GLOBAL ─────────────────────────────────────────
window.STATE = {
  user: null, empresa: null, perfil: null,
  funcionario: null, isMaster: false,
  permissions: {}, currency: 'BRL',
};

// ── RATE LIMITER (anti brute-force) ───────────────────────
const _RL = {
  maxAttempts: 5,
  lockMs: 5 * 60 * 1000,
  get(action) {
    try { return JSON.parse(localStorage.getItem('nexos_rl_' + action) || '{"count":0,"lockedUntil":0}'); }
    catch { return { count: 0, lockedUntil: 0 }; }
  },
  set(action, d) {
    try { localStorage.setItem('nexos_rl_' + action, JSON.stringify(d)); } catch {}
  },
  isLocked(action) {
    const d = this.get(action);
    if (d.lockedUntil && Date.now() < d.lockedUntil) return true;
    if (d.lockedUntil && Date.now() >= d.lockedUntil) this.reset(action);
    return false;
  },
  fail(action) {
    const d = this.get(action);
    d.count = (d.count || 0) + 1;
    if (d.count >= this.maxAttempts) d.lockedUntil = Date.now() + this.lockMs;
    this.set(action, d);
    return d.count;
  },
  reset(action) { localStorage.removeItem('nexos_rl_' + action); },
  remainingMs(action) { return Math.max(0, (this.get(action).lockedUntil || 0) - Date.now()); }
};

// ── SANITIZAÇÃO ───────────────────────────────────────────
function _sanitize(str, maxLen = 255) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[<>"'`]/g, '').replace(/javascript:/gi, '');
}
function _sanitizeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _isValidEmail(e) { return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e); }

// ── HELPERS DE TELA ───────────────────────────────────────
function _showLoading() {
  document.getElementById('loading-screen').style.display = 'flex';
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app-shell').style.display      = 'none';
  const ob = document.getElementById('onboarding-screen');
  if (ob) ob.style.display = 'none';
}
function _showAuth() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display    = 'flex';
  document.getElementById('app-shell').style.display      = 'none';
  const ob = document.getElementById('onboarding-screen');
  if (ob) ob.style.display = 'none';
  showLoginView();
  if (window.lucide) lucide.createIcons();
}
function _showOnboarding() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app-shell').style.display      = 'none';
  const ob = document.getElementById('onboarding-screen');
  if (ob) ob.style.display = 'block';
  if (window.lucide) lucide.createIcons();
}
function _showApp() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app-shell').style.display      = 'flex';
  const ob = document.getElementById('onboarding-screen');
  if (ob) ob.style.display = 'none';
  if (window.lucide) lucide.createIcons();
}

// ── AUTH OBJECT ───────────────────────────────────────────
const Auth = {
  showAuthScreen() { _showAuth(); },
  showApp()        { _showApp(); },
  showOnboarding() { _showOnboarding(); },

  async login() {
    const email = _sanitize(document.getElementById('auth-email')?.value || '', 254);
    const pass  = (document.getElementById('auth-pass')?.value || '').slice(0, 128);
    if (!email || !pass)       { UI.toast('Preencha e-mail e senha', 'warning'); return; }
    if (!_isValidEmail(email)) { UI.toast('E-mail inválido', 'warning'); return; }
    if (_RL.isLocked('login')) {
      const m = Math.ceil(_RL.remainingMs('login') / 60000);
      UI.toast('Muitas tentativas. Aguarde ' + m + ' min.', 'error'); return;
    }
    const btn = document.querySelector('#auth-login-view .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    try {
      const { error } = await window.sb.auth.signInWithPassword({ email, password: pass });
      if (error) { _RL.fail('login'); UI.toast('Credenciais inválidas', 'error'); }
      else _RL.reset('login');
    } catch { UI.toast('Erro de conexão. Tente novamente.', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; } }
  },

  async loginGoogle() {
    try {
      const { error } = await window.sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) UI.toast('Erro ao iniciar login com Google', 'error');
    } catch { UI.toast('Erro ao iniciar login com Google', 'error'); }
  },

  async register() {
    const name  = _sanitize(document.getElementById('reg-name')?.value  || '', 100);
    const email = _sanitize(document.getElementById('reg-email')?.value || '', 254);
    const pass  = (document.getElementById('reg-pass')?.value || '').slice(0, 128);
    if (!name || !email || !pass) { UI.toast('Preencha todos os campos', 'warning'); return; }
    if (!_isValidEmail(email))    { UI.toast('E-mail inválido', 'warning'); return; }
    if (pass.length < 8)          { UI.toast('Senha deve ter mínimo 8 caracteres', 'warning'); return; }
    if (_RL.isLocked('register')) { UI.toast('Muitas tentativas. Aguarde.', 'error'); return; }
    const btn = document.querySelector('#auth-register-view .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
    try {
      await window.sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
      _RL.reset('register');
      // Resposta genérica — não revela se e-mail já existe (anti-enumeration)
      UI.toast('Se o e-mail for válido, você receberá um link de ativação.', 'success');
      showLoginView();
      const emailEl = document.getElementById('auth-email');
      if (emailEl) emailEl.value = email;
    } catch { _RL.fail('register'); UI.toast('Erro ao criar conta. Tente novamente.', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Criar conta'; } }
  },

  async forgotPassword(emailRaw) {
    const email = _sanitize(emailRaw || document.getElementById('auth-email')?.value || '', 254);
    if (!email || !_isValidEmail(email)) { UI.toast('Digite um e-mail válido', 'warning'); return; }
    if (_RL.isLocked('forgot')) { UI.toast('Muitas tentativas. Aguarde.', 'error'); return; }
    await window.sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    _RL.fail('forgot');
    // Resposta genérica (não revela se e-mail existe)
    UI.toast('Se o e-mail estiver cadastrado, você receberá um link.', 'info');
  },

  async logout() {
    if (!confirm('Deseja sair do NexOS?')) return;
    try {
      STATE.user = STATE.empresa = STATE.perfil = STATE.funcionario = null;
      STATE.isMaster = false; STATE.permissions = {};
      localStorage.removeItem('nexos_page');
      await window.sb.auth.signOut();
    } catch { STATE.user = null; }
    finally { _showAuth(); UI.toast('Até logo! 👋', 'info'); }
  },

  async loadUser(supabaseUser) {
    if (!supabaseUser?.id) { _showAuth(); return; }
    STATE.user = supabaseUser;
    try {
      const { data: perfil, error } = await window.sb
        .from('usuarios').select('*, empresas(*)').eq('user_id', supabaseUser.id).maybeSingle();
      if (error) throw error;
      if (!perfil) {
        const done = localStorage.getItem('nexos_onboarding_done');
        if (done) await Auth._createEmpresaFromOnboarding(supabaseUser);
        else _showOnboarding();
        return;
      }
      STATE.perfil  = perfil;
      STATE.empresa = perfil.empresas;
      STATE.isMaster = perfil.nivel === 'master' || perfil.cargo === 'master';
      const prefs = (() => { try { return JSON.parse(localStorage.getItem('nexos_prefs') || '{}'); } catch { return {}; } })();
      if (prefs.currency) STATE.currency = prefs.currency;
      if (prefs.lang && window.I18N) I18N.set(prefs.lang);
      if (window.SEGMENTS) SEGMENTS._current = null;
      if (prefs.segment && window.SEGMENTS) SEGMENTS.set(prefs.segment);
      if (STATE.empresa?.segmento && window.SEGMENTS) { SEGMENTS._current = null; SEGMENTS.set(STATE.empresa.segmento); }
      Auth._updateUI();
      _showApp();
      if (window.App) App.init();
    } catch(e) {
      console.error('Erro ao carregar usuário:', e);
      UI.toast('Erro ao carregar perfil. Tente novamente.', 'error');
      _showAuth();
    }
  },

  async _createEmpresaFromOnboarding(supabaseUser) {
    const prefs = (() => { try { return JSON.parse(localStorage.getItem('nexos_prefs') || '{}'); } catch { return {}; } })();
    const segOk = ['tech','retail','beauty','garage'].includes(prefs.segment);
    const curOk = ['BRL','USD','EUR','GBP','ARS','CLP','COP','MXN'].includes(prefs.currency);
    const langOk= ['pt','en','es'].includes(prefs.lang);
    try {
      const { data: empresa, error: empErr } = await window.sb.from('empresas').insert({
        nome:     _sanitize(prefs.company || supabaseUser.user_metadata?.full_name || 'Minha Empresa', 100),
        telefone: _sanitize(prefs.phone || '', 20),
        cnpj:     _sanitize(prefs.cnpj  || '', 20),
        pix:      _sanitize(prefs.pix   || '', 100),
        segmento: segOk  ? prefs.segment  : 'tech',
        moeda:    curOk  ? prefs.currency : 'BRL',
        idioma:   langOk ? prefs.lang     : 'pt',
        plano: 'basico', ativo: true,
        codigo: Math.random().toString(36).slice(2,8).toUpperCase(),
      }).select().single();
      if (empErr) throw empErr;
      const { data: perfil, error: perErr } = await window.sb.from('usuarios').insert({
        user_id: supabaseUser.id, empresa_id: empresa.id,
        nome:  _sanitize(supabaseUser.user_metadata?.full_name || supabaseUser.email, 100),
        email: supabaseUser.email, nivel: 'dono', cargo: 'dono', ativo: true,
      }).select('*, empresas(*)').single();
      if (perErr) throw perErr;
      STATE.perfil = perfil; STATE.empresa = empresa;
      STATE.currency = curOk ? prefs.currency : 'BRL';
      if (prefs.lang    && window.I18N)     I18N.set(prefs.lang);
      if (prefs.segment && window.SEGMENTS) SEGMENTS.set(prefs.segment);
      localStorage.removeItem('nexos_onboarding_done');
      Auth._updateUI(); _showApp();
      if (window.App) App.init();
      UI.toast('Bem-vindo ao NexOS! 🎉', 'success');
    } catch(e) {
      console.error('Erro ao criar empresa:', e);
      UI.toast('Erro ao configurar empresa. Tente novamente.', 'error');
      _showOnboarding();
    }
  },

  _updateUI() {
    const nome  = STATE.perfil?.nome || STATE.user?.user_metadata?.full_name || STATE.user?.email || '?';
    const nivel = STATE.isMaster ? 'Master Admin' :
                  STATE.perfil?.nivel === 'dono' ? 'Proprietário' :
                  STATE.perfil?.nivel === 'gerente' ? 'Gerente' : 'Técnico';
    const ini = nome.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
    const els = {
      'sidebar-avatar': e => e.textContent = ini,
      'sidebar-name':   e => e.textContent = nome.split(' ')[0],
      'sidebar-role':   e => e.textContent = nivel,
      'header-avatar':  e => e.textContent = ini,
    };
    Object.entries(els).forEach(([id, fn]) => { const el = document.getElementById(id); if (el) fn(el); });
    const navMaster = document.getElementById('nav-master');
    if (navMaster) navMaster.style.display = STATE.isMaster ? 'flex' : 'none';
  },

  can(permission) {
    if (STATE.isMaster || STATE.perfil?.nivel === 'dono') return true;
    if (STATE.perfil?.nivel === 'gerente') return !['edit_settings','manage_employees'].includes(permission);
    if (STATE.funcionario) return !!STATE.permissions[permission];
    return false;
  },
};

// ── BOOT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  _showLoading();
  if (window.I18N) I18N.init();
  if (window.SEGMENTS) {
    SEGMENTS._current = null;
    const savedSeg = localStorage.getItem('nexos_segment');
    if (savedSeg && SEGMENTS.configs[savedSeg]) SEGMENTS.set(savedSeg);
  }
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session?.user) await Auth.loadUser(session.user);
    else _showAuth();
  } catch { _showAuth(); }

  window.sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !STATE.user) {
      await Auth.loadUser(session.user);
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      STATE.user = session.user;
    } else if (event === 'SIGNED_OUT') {
      STATE.user = STATE.empresa = STATE.perfil = STATE.funcionario = null;
      _showAuth();
    }
  });
  if (window.lucide) lucide.createIcons();
});

// ── MENU DO USUÁRIO ───────────────────────────────────────
function toggleUserMenu() {
  const existing = document.getElementById('user-menu-dropdown');
  if (existing) { existing.remove(); return; }
  const nome    = _sanitizeHTML(STATE.perfil?.nome || STATE.user?.email || '?');
  const email   = _sanitizeHTML(STATE.user?.email  || '');
  const nivel   = _sanitizeHTML(STATE.isMaster ? 'Master Admin' : STATE.perfil?.nivel === 'dono' ? 'Proprietário' : 'Gerente');
  const empresa = _sanitizeHTML(STATE.empresa?.nome || '');
  const codigo  = _sanitizeHTML(STATE.empresa?.codigo || '');
  const menu = document.createElement('div');
  menu.id = 'user-menu-dropdown';
  menu.style.cssText = 'position:fixed;bottom:72px;left:10px;right:10px;background:var(--bg-2);border:1px solid var(--border-md);border-radius:var(--radius-lg);padding:8px;box-shadow:var(--shadow-lg);z-index:500;animation:fadeSlide .15s var(--ease)';
  menu.innerHTML = `
    <div style="padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
      <div style="font-size:.88rem;font-weight:700">${nome}</div>
      <div style="font-size:.74rem;color:var(--text-3)">${email}</div>
      <div style="font-size:.74rem;color:var(--text-3);margin-top:2px">${nivel}${empresa ? ' · ' + empresa : ''}</div>
      ${codigo ? `<div id="copy-code-btn" style="font-size:.72rem;color:var(--blue);margin-top:4px;cursor:pointer">Código: ${codigo} 📋</div>` : ''}
    </div>
    <div class="dropdown-item" id="menu-settings-btn"><i data-lucide="settings" style="width:14px;height:14px"></i> Configurações</div>
    <div class="dropdown-sep"></div>
    <div class="dropdown-item danger" id="menu-logout-btn"><i data-lucide="log-out" style="width:14px;height:14px"></i> Sair</div>`;
  document.body.appendChild(menu);
  document.getElementById('copy-code-btn')?.addEventListener('click', copyEmpresaCode);
  document.getElementById('menu-settings-btn')?.addEventListener('click', () => { goPage('settings'); menu.remove(); });
  document.getElementById('menu-logout-btn')?.addEventListener('click', () => { menu.remove(); Auth.logout(); });
  if (window.lucide) lucide.createIcons();
  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); }
    });
  }, 50);
}

async function copyEmpresaCode() {
  const c = STATE.empresa?.codigo || '';
  if (!c) return;
  try { await navigator.clipboard.writeText(c); } catch {}
  UI.toast('Código copiado: ' + c, 'success');
  document.getElementById('user-menu-dropdown')?.remove();
}

function globalSearch(q) {
  if (!q || q.length < 2 || q.length > 100) return;
  if (window.App?.globalSearch) App.globalSearch(_sanitize(q, 100));
}

function showLoginView() {
  const lv = document.getElementById('auth-login-view');
  const rv = document.getElementById('auth-register-view');
  const pv = document.getElementById('auth-pin-view');
  if (lv) lv.style.display = '';
  if (rv) rv.style.display = 'none';
  if (pv) pv.style.display = 'none';
}
function showRegisterView() {
  const lv = document.getElementById('auth-login-view');
  const rv = document.getElementById('auth-register-view');
  if (lv) lv.style.display = 'none';
  if (rv) rv.style.display = '';
}
function showForgotView() {
  const fv = document.getElementById('auth-forgot-view');
  if (fv) fv.style.display = '';
}

const _spinStyle = document.createElement('style');
_spinStyle.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
document.head.appendChild(_spinStyle);
