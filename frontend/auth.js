/* ============================================================
   NexOS v3.5— auth.js
   Estrutura real do banco: usuarios(id, empresa_id, user_id,
   nome, email, cargo, nivel, ativo), empresas(id, nome, ...)
   ============================================================ */

const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nexos_session' }
});

// Estado global
window.STATE = {
  user:        null,
  empresa:     null,
  perfil:      null,
  funcionario: null,
  isMaster:    false,
  permissions: {},
  currency:    'BRL',
};

// ── HELPERS DE TELA ────────────────────────────────────────
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

// ── AUTH OBJECT ────────────────────────────────────────────
const Auth = {

  showAuthScreen()  { _showAuth(); },
  showApp()         { _showApp(); },
  showOnboarding()  { _showOnboarding(); },

  // ── LOGIN EMAIL/SENHA ───────────────────────────────────
  async login() {
    const email = document.getElementById('auth-email')?.value?.trim();
    const pass  = document.getElementById('auth-pass')?.value;
    if (!email || !pass) { UI.toast('Preencha e-mail e senha', 'warning'); return; }
    const btn = document.querySelector('#auth-login-view .btn-primary');
    if (btn) btn.disabled = true;
    try {
      const { error } = await window.sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        UI.toast(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos' : error.message, 'error');
      }
    } catch(e) {
      UI.toast('Erro de conexão', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ── GOOGLE OAUTH ────────────────────────────────────────
  async loginGoogle() {
    try {
      const { error } = await window.sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
      });
      if (error) UI.toast(error.message, 'error');
    } catch(e) {
      UI.toast('Erro ao iniciar login com Google', 'error');
    }
  },

  // ── CADASTRO ────────────────────────────────────────────
  async register() {
    const name  = document.getElementById('reg-name')?.value?.trim();
    const email = document.getElementById('reg-email')?.value?.trim();
    const pass  = document.getElementById('reg-pass')?.value;
    if (!name || !email || !pass) { UI.toast('Preencha todos os campos', 'warning'); return; }
    if (pass.length < 6) { UI.toast('Senha deve ter mínimo 6 caracteres', 'warning'); return; }
    const btn = document.querySelector('#auth-register-view .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
    try {
      const { error } = await window.sb.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name } }
      });
      if (error) {
        UI.toast(error.message.includes('already registered') ? 'E-mail já cadastrado' : error.message, 'error');
      } else {
        UI.toast('Conta criada! Verifique seu e-mail.', 'success');
        showLoginView();
        const emailEl = document.getElementById('auth-email');
        if (emailEl) emailEl.value = email;
      }
    } catch(e) {
      UI.toast('Erro ao criar conta', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar conta'; }
    }
  },

  // ── ESQUECI SENHA ───────────────────────────────────────
  async forgotPassword(email) {
    if (!email) { UI.toast('Digite seu e-mail primeiro', 'warning'); return; }
    const { error } = await window.sb.auth.resetPasswordForEmail(email);
    if (error) UI.toast(error.message, 'error');
    else UI.toast('E-mail de redefinição enviado!', 'success');
  },

  // ── LOGOUT ──────────────────────────────────────────────
  async logout() {
    if (!confirm('Deseja sair do NexOS?')) return;
    STATE.user = STATE.empresa = STATE.perfil = STATE.funcionario = null;
    STATE.isMaster = false; STATE.permissions = {};
    localStorage.removeItem('nexos_page');
    await window.sb.auth.signOut();
    _showAuth();
    UI.toast('Até logo! 👋', 'info');
  },

  // ── CARREGA USUÁRIO APÓS LOGIN ──────────────────────────
  async loadUser(supabaseUser) {
    STATE.user = supabaseUser;
    try {
      // Busca perfil — usuarios tem user_id (adicionado pela migration)
      const { data: perfil, error } = await window.sb
        .from('usuarios')
        .select('*, empresas(*)')
        .eq('user_id', supabaseUser.id)
        .maybeSingle();

      if (error) throw error;

      if (!perfil) {
        // Sem perfil — novo usuário, vai pro onboarding
        const onboardingDone = localStorage.getItem('nexos_onboarding_done');
        if (onboardingDone) {
          await Auth._createEmpresaFromOnboarding(supabaseUser);
        } else {
          _showOnboarding();
        }
        return;
      }

      STATE.perfil  = perfil;
      STATE.empresa = perfil.empresas;
      STATE.isMaster = perfil.nivel === 'master' || perfil.cargo === 'master';

      const prefs = JSON.parse(localStorage.getItem('nexos_prefs') || '{}');
      if (prefs.currency) STATE.currency = prefs.currency;
      if (prefs.lang && window.I18N) I18N.set(prefs.lang);
      if (window.SEGMENTS) SEGMENTS._current = null;
      if (prefs.segment && window.SEGMENTS) SEGMENTS.set(prefs.segment);

      // Aplica segmento salvo na empresa (tem prioridade)
      if (STATE.empresa?.segmento && window.SEGMENTS) { SEGMENTS._current = null; SEGMENTS.set(STATE.empresa.segmento); }

      Auth._updateUI();
      _showApp();
      if (window.App) App.init();

    } catch(e) {
      console.error('Erro ao carregar usuário:', e);
      UI.toast('Erro ao carregar perfil: ' + e.message, 'error');
      _showAuth();
    }
  },

  // ── CRIA EMPRESA APÓS ONBOARDING ────────────────────────
  async _createEmpresaFromOnboarding(supabaseUser) {
    const prefs = JSON.parse(localStorage.getItem('nexos_prefs') || '{}');
    try {
      const { data: empresa, error: empErr } = await window.sb
        .from('empresas')
        .insert({
          nome:     prefs.company  || supabaseUser.user_metadata?.full_name || 'Minha Empresa',
          telefone: prefs.phone    || '',
          cnpj:     prefs.cnpj     || '',
          pix:      prefs.pix      || '',
          segmento: prefs.segment  || 'tech',
          moeda:    prefs.currency || 'BRL',
          idioma:   prefs.lang     || 'pt',
          plano:    'basico',
          ativo:    true,
          codigo:   Math.random().toString(36).slice(2,8).toUpperCase(),
        })
        .select().single();

      if (empErr) throw empErr;

      const { data: perfil, error: perErr } = await window.sb
        .from('usuarios')
        .insert({
          user_id:    supabaseUser.id,
          empresa_id: empresa.id,
          nome:       supabaseUser.user_metadata?.full_name || supabaseUser.email,
          email:      supabaseUser.email,
          nivel:      'dono',
          cargo:      'dono',
          ativo:      true,
        })
        .select('*, empresas(*)')
        .single();

      if (perErr) throw perErr;

      STATE.perfil  = perfil;
      STATE.empresa = empresa;
      STATE.currency = prefs.currency || 'BRL';
      if (prefs.lang    && window.I18N)      I18N.set(prefs.lang);
      if (prefs.segment && window.SEGMENTS)  SEGMENTS.set(prefs.segment);

      localStorage.removeItem('nexos_onboarding_done');
      Auth._updateUI();
      _showApp();
      if (window.App) App.init();
      UI.toast('Bem-vindo ao NexOS! 🎉', 'success');

    } catch(e) {
      console.error('Erro ao criar empresa:', e);
      UI.toast('Erro ao configurar empresa: ' + e.message, 'error');
      _showOnboarding();
    }
  },

  // ── ATUALIZA UI ─────────────────────────────────────────
  _updateUI() {
    const nome  = STATE.perfil?.nome || STATE.user?.user_metadata?.full_name || STATE.user?.email || '?';
    const nivel = STATE.isMaster ? 'Master Admin' :
                  STATE.perfil?.nivel === 'dono' ? 'Proprietário' :
                  STATE.perfil?.nivel === 'gerente' ? 'Gerente' : 'Técnico';
    const initials = nome.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();

    const els = {
      'sidebar-avatar': e => e.textContent = initials,
      'sidebar-name':   e => e.textContent = nome.split(' ')[0],
      'sidebar-role':   e => e.textContent = nivel,
      'header-avatar':  e => e.textContent = initials,
    };
    Object.entries(els).forEach(([id, fn]) => { const el = document.getElementById(id); if(el) fn(el); });

    const navMaster = document.getElementById('nav-master');
    if (navMaster) navMaster.style.display = STATE.isMaster ? 'flex' : 'none';
  },

  // ── PERMISSÕES ──────────────────────────────────────────
  can(permission) {
    if (STATE.isMaster || STATE.perfil?.nivel === 'dono') return true;
    if (STATE.perfil?.nivel === 'gerente') return !['edit_settings','manage_employees'].includes(permission);
    if (STATE.funcionario) return !!STATE.permissions[permission];
    return false;
  },
};

// ── BOOT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  _showLoading();
  if (window.I18N) I18N.init();
  // Reseta _current para garantir que pega o objeto completo do configs
  if (window.SEGMENTS) {
    SEGMENTS._current = null;
    const savedSeg = localStorage.getItem('nexos_segment');
    if (savedSeg && SEGMENTS.configs[savedSeg]) SEGMENTS.set(savedSeg);
  }

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session?.user) {
      await Auth.loadUser(session.user);
    } else {
      _showAuth();
    }
  } catch(e) {
    console.error('Boot error:', e);
    _showAuth();
  }

  window.sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !STATE.user) {
      await Auth.loadUser(session.user);
    } else if (event === 'SIGNED_OUT') {
      STATE.user = STATE.empresa = STATE.perfil = STATE.funcionario = null;
      _showAuth();
    }
  });

  if (window.lucide) lucide.createIcons();
});

// ── MENU DO USUÁRIO ────────────────────────────────────────
function toggleUserMenu() {
  const existing = document.getElementById('user-menu-dropdown');
  if (existing) { existing.remove(); return; }

  const nome    = STATE.perfil?.nome || STATE.user?.email || '?';
  const email   = STATE.user?.email || '';
  const nivel   = STATE.isMaster ? 'Master Admin' : STATE.perfil?.nivel === 'dono' ? 'Proprietário' : 'Gerente';
  const empresa = STATE.empresa?.nome || '';
  const codigo  = STATE.empresa?.codigo || '';

  const menu = document.createElement('div');
  menu.id = 'user-menu-dropdown';
  menu.style.cssText = `position:fixed;bottom:72px;left:10px;right:10px;background:var(--bg-2);border:1px solid var(--border-md);border-radius:var(--radius-lg);padding:8px;box-shadow:var(--shadow-lg);z-index:500;animation:fadeSlide .15s var(--ease)`;
  menu.innerHTML = `
    <div style="padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
      <div style="font-size:.88rem;font-weight:700">${nome}</div>
      <div style="font-size:.74rem;color:var(--text-3)">${email}</div>
      <div style="font-size:.74rem;color:var(--text-3);margin-top:2px">${nivel}${empresa?' · '+empresa:''}</div>
      ${codigo ? `<div style="font-size:.72rem;color:var(--blue);margin-top:4px;cursor:pointer" onclick="copyEmpresaCode()">Código: ${codigo} 📋</div>` : ''}
    </div>
    <div class="dropdown-item" onclick="goPage('settings');document.getElementById('user-menu-dropdown')?.remove()">
      <i data-lucide="settings" style="width:14px;height:14px"></i> Configurações
    </div>
    <div class="dropdown-sep"></div>
    <div class="dropdown-item danger" onclick="Auth.logout();document.getElementById('user-menu-dropdown')?.remove()">
      <i data-lucide="log-out" style="width:14px;height:14px"></i> Sair
    </div>`;
  document.body.appendChild(menu);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); }
    });
  }, 50);
}

async function copyEmpresaCode() {
  const codigo = STATE.empresa?.codigo || '';
  if (!codigo) return;
  try { await navigator.clipboard.writeText(codigo); } catch {}
  UI.toast('Código copiado: ' + codigo, 'success');
  document.getElementById('user-menu-dropdown')?.remove();
}

function globalSearch(query) {
  if (!query || query.length < 2) return;
  if (window.App?.globalSearch) App.globalSearch(query);
}

// Helper para navegação de auth views
function showLoginView() {
  document.getElementById('auth-login-view')?.classList.remove('hidden');
  document.getElementById('auth-register-view')?.classList.add('hidden');
  document.getElementById('auth-forgot-view')?.classList.add('hidden');
}
function showRegisterView() {
  document.getElementById('auth-login-view')?.classList.add('hidden');
  document.getElementById('auth-register-view')?.classList.remove('hidden');
  document.getElementById('auth-forgot-view')?.classList.add('hidden');
}
function showForgotView() {
  document.getElementById('auth-login-view')?.classList.add('hidden');
  document.getElementById('auth-register-view')?.classList.add('hidden');
  document.getElementById('auth-forgot-view')?.classList.remove('hidden');
}

// Spin animation para botões de loading
const _spinStyle = document.createElement('style');
_spinStyle.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
document.head.appendChild(_spinStyle);
