/* ============================================================
   NexOS v3.0 — auth.js
   Autenticação: email/senha, Google OAuth, PIN de funcionário
   Onboarding, gestão de sessão e controle de acesso
   ============================================================ */

// ── SUPABASE INIT ──────────────────────────────────────────
const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nexos_session' }
});

// ── ESTADO GLOBAL ──────────────────────────────────────────
window.STATE = {
  user:        null,   // usuário Supabase
  empresa:     null,   // empresa ativa
  perfil:      null,   // perfil do usuário na empresa
  funcionario: null,   // funcionário logado por PIN
  isMaster:    false,  // é master admin?
  permissions: {},     // permissões do usuário atual
  currency:    'BRL',  // moeda configurada
};

// ── AUTH OBJECT ────────────────────────────────────────────
const Auth = {

  // ── TELAS ────────────────────────────────────────────────
  showAuthScreen() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').classList.add('show');
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('onboarding-screen').style.display = 'none';
    showLoginView();
    if (window.lucide) lucide.createIcons();
  },

  showApp() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').classList.remove('show');
    document.getElementById('onboarding-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  },

  showOnboarding() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').classList.remove('show');
    document.getElementById('onboarding-screen').style.display = 'block';
    document.getElementById('app-shell').style.display = 'none';
    if (window.lucide) lucide.createIcons();
  },

  // ── LOGIN EMAIL/SENHA ─────────────────────────────────────
  async login() {
    const email = document.getElementById('auth-email')?.value?.trim();
    const pass  = document.getElementById('auth-pass')?.value;

    if (!email || !pass) {
      UI.toast('⚠ Preencha e-mail e senha', 'warning');
      return;
    }

    const btn = document.querySelector('#auth-login-view .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;animation:spin 1s linear infinite"></i> Entrando...'; }

    try {
      const { error } = await window.sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        const msg = error.message.includes('Invalid login credentials')
          ? 'E-mail ou senha incorretos'
          : error.message.includes('Email not confirmed')
          ? 'Confirme seu e-mail antes de entrar'
          : error.message;
        UI.toast('❌ ' + msg, 'error');
      }
    } catch(e) {
      UI.toast('❌ Erro de conexão', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="log-in" style="width:15px;height:15px"></i><span>Entrar</span>'; if (window.lucide) lucide.createIcons(); }
    }
  },

  // ── GOOGLE OAUTH ──────────────────────────────────────────
  async loginGoogle() {
    try {
      const { error } = await window.sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
      });
      if (error) UI.toast('❌ ' + error.message, 'error');
    } catch(e) {
      UI.toast('❌ Erro ao iniciar login com Google', 'error');
    }
  },

  // ── CADASTRO ──────────────────────────────────────────────
  async register() {
    const name  = document.getElementById('reg-name')?.value?.trim();
    const email = document.getElementById('reg-email')?.value?.trim();
    const pass  = document.getElementById('reg-pass')?.value;

    if (!name || !email || !pass) { UI.toast('⚠ Preencha todos os campos', 'warning'); return; }
    if (pass.length < 6)          { UI.toast('⚠ Senha deve ter mínimo 6 caracteres', 'warning'); return; }

    const btn = document.querySelector('#auth-register-view .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }

    try {
      const { error } = await window.sb.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name } }
      });
      if (error) {
        const msg = error.message.includes('already registered')
          ? 'Este e-mail já está cadastrado'
          : error.message;
        UI.toast('❌ ' + msg, 'error');
      } else {
        UI.toast('✅ Conta criada! Verifique seu e-mail para confirmar.', 'success');
        showLoginView();
        const emailEl = document.getElementById('auth-email');
        if (emailEl) emailEl.value = email;
      }
    } catch(e) {
      UI.toast('❌ Erro ao criar conta', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar conta'; }
    }
  },

  // ── ESQUECI SENHA ─────────────────────────────────────────
  async forgotPassword(email) {
    if (!email) { UI.toast('⚠ Digite seu e-mail primeiro', 'warning'); return; }
    try {
      const { error } = await window.sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href + '?reset=1'
      });
      if (error) UI.toast('❌ ' + error.message, 'error');
      else UI.toast('✅ E-mail de redefinição enviado!', 'success');
    } catch(e) {
      UI.toast('❌ Erro ao enviar e-mail', 'error');
    }
  },

  // ── PIN LOGIN ─────────────────────────────────────────────
  async loadPinProfiles() {
    const empresa = STATE.empresa;
    if (!empresa) return;

    const { data: funcs } = await window.sb
      .from('funcionarios')
      .select('id, nome, funcao')
      .eq('empresa_id', empresa.id)
      .eq('ativo', true);

    const wrap = document.getElementById('pin-profiles');
    const inputWrap = document.getElementById('pin-inputs-wrap');
    if (!wrap) return;

    if (!funcs || funcs.length === 0) {
      wrap.innerHTML = '<p style="color:var(--text-2);font-size:.84rem;text-align:center;padding:16px 0">Nenhum funcionário cadastrado ainda.</p>';
      return;
    }

    wrap.innerHTML = funcs.map(f => `
      <div class="pin-profile-item" onclick="Auth.selectPinProfile('${f.id}', '${f.nome}', this)">
        <div class="pin-profile-avatar">${f.nome.slice(0,2).toUpperCase()}</div>
        <div>
          <div style="font-size:.88rem;font-weight:600">${f.nome}</div>
          <div style="font-size:.74rem;color:var(--text-3)">${f.funcao || 'Funcionário'}</div>
        </div>
        <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-3);margin-left:auto"></i>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  _selectedPinId: null,

  selectPinProfile(id, nome, el) {
    this._selectedPinId = id;
    document.querySelectorAll('.pin-profile-item').forEach(i => i.style.borderColor = 'var(--border)');
    el.style.borderColor = 'var(--blue)';

    const wrap = document.getElementById('pin-inputs-wrap');
    if (wrap) {
      wrap.style.display = 'block';
      const inputs = wrap.querySelectorAll('.pin-input');
      inputs.forEach((inp, i) => {
        inp.value = '';
        inp.oninput = (e) => {
          e.target.value = e.target.value.replace(/\D/g, '');
          if (e.target.value && inputs[i+1]) inputs[i+1].focus();
          if (i === 3) this._submitPin(nome);
        };
        inp.onkeydown = (e) => {
          if (e.key === 'Backspace' && !e.target.value && inputs[i-1]) inputs[i-1].focus();
        };
      });
      inputs[0].focus();
    }
  },

  async _submitPin(nome) {
    const inputs = document.querySelectorAll('#pin-inputs-wrap .pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    if (pin.length < 4) return;

    try {
      const pinHash = btoa(pin); // Base64 simples — em produção usar bcrypt no edge function
      const { data: func, error } = await window.sb
        .from('funcionarios')
        .select('*')
        .eq('id', this._selectedPinId)
        .eq('pin_hash', pinHash)
        .eq('ativo', true)
        .single();

      if (error || !func) {
        UI.toast('❌ PIN incorreto', 'error');
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
        return;
      }

      // Login por PIN bem-sucedido
      STATE.funcionario = func;
      STATE.permissions = func.permissoes || {};
      UI.toast(`👋 Bem-vindo, ${func.nome}!`, 'success');
      Auth.showApp();
      if (window.App) App.bootAsFuncionario(func);

    } catch(e) {
      UI.toast('❌ Erro ao verificar PIN', 'error');
    }
  },

  // ── LOGOUT ────────────────────────────────────────────────
  async logout() {
    if (!confirm('Deseja sair do NexOS?')) return;
    STATE.user = null;
    STATE.empresa = null;
    STATE.perfil = null;
    STATE.funcionario = null;
    STATE.isMaster = false;
    STATE.permissions = {};
    localStorage.removeItem('nexos_page');
    await window.sb.auth.signOut();
    Auth.showAuthScreen();
    UI.toast('Até logo! 👋', 'info');
  },

  // ── CARREGA USUÁRIO APÓS LOGIN ────────────────────────────
  async loadUser(supabaseUser) {
    STATE.user = supabaseUser;

    try {
      // 1. Busca o perfil do usuário
      let { data: perfil } = await window.sb
        .from('usuarios')
        .select('*, empresas(*)')
        .eq('user_id', supabaseUser.id)
        .maybeSingle();

      // 2. Se não tem perfil, pode ser master ou novo usuário
      if (!perfil) {
        const isMaster = supabaseUser.email?.endsWith('@nexos.app') ||
                         supabaseUser.user_metadata?.is_master;
        if (isMaster) {
          STATE.isMaster = true;
          STATE.perfil = { nivel: 'master', nome: supabaseUser.user_metadata?.full_name || supabaseUser.email };
          Auth._updateUI();
          Auth.showApp();
          if (window.App) App.init();
          return;
        }

        // Novo usuário — verificar se fez onboarding
        const onboardingDone = localStorage.getItem('nexos_onboarding_done');
        if (!onboardingDone) {
          Auth.showOnboarding();
          return;
        }

        // Onboarding feito mas sem empresa no banco — criar empresa
        await Auth._createEmpresaFromOnboarding(supabaseUser);
        return;
      }

      // 3. Usuário com perfil existente
      STATE.perfil   = perfil;
      STATE.empresa  = perfil.empresas;
      STATE.isMaster = perfil.nivel === 'master';

      // Carrega preferências salvas
      const prefs = JSON.parse(localStorage.getItem('nexos_prefs') || '{}');
      if (prefs.currency) STATE.currency = prefs.currency;
      if (prefs.lang) I18N.set(prefs.lang);
      if (prefs.segment) SEGMENTS.set(prefs.segment);

      Auth._updateUI();
      Auth.showApp();
      if (window.App) App.init();

    } catch(e) {
      console.error('Erro ao carregar usuário:', e);
      UI.toast('⚠ Erro ao carregar perfil', 'error');
      Auth.showAuthScreen();
    }
  },

  // ── CRIA EMPRESA APÓS ONBOARDING ──────────────────────────
  async _createEmpresaFromOnboarding(supabaseUser) {
    const prefs = JSON.parse(localStorage.getItem('nexos_prefs') || '{}');

    try {
      // Criar empresa
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
        })
        .select()
        .single();

      if (empErr) throw empErr;

      // Criar perfil do dono
const { data: perfil, error: perErr } = await window.sb
  .from('usuarios')
  .insert({
    id: supabaseUser.id,
    empresa_id: empresa.id,
    nome: supabaseUser.user_metadata?.full_name || supabaseUser.email,
    email: supabaseUser.email,
    cargo: 'dono'
  })
  .select('*, empresas(*)')
  .single();

if (perErr) throw perErr;

      // Registrar config de assinatura
      if (prefs.signature !== undefined) {
        await window.sb.from('empresas').update({
          config: { assinatura_ativada: prefs.signature }
        }).eq('id', empresa.id);
      }

      STATE.perfil  = perfil;
      STATE.empresa = empresa;
      STATE.currency = prefs.currency || 'BRL';

      if (prefs.lang)    I18N.set(prefs.lang);
      if (prefs.segment) SEGMENTS.set(prefs.segment);

      localStorage.removeItem('nexos_onboarding_done');
      Auth._updateUI();
      Auth.showApp();
      if (window.App) App.init();
      UI.toast(`🎉 Bem-vindo ao NexOS, ${perfil.nome?.split(' ')[0]}!`, 'success');

    } catch(e) {
      console.error('Erro ao criar empresa:', e);
      UI.toast('❌ Erro ao configurar empresa. Tente novamente.', 'error');
      Auth.showOnboarding();
    }
  },

  // ── ATUALIZA UI COM DADOS DO USUÁRIO ─────────────────────
  _updateUI() {
    const nome  = STATE.funcionario?.nome || STATE.perfil?.nome || STATE.user?.user_metadata?.full_name || STATE.user?.email || '?';
    const nivel = STATE.isMaster ? 'Master Admin' :
                  STATE.funcionario ? (STATE.funcionario.funcao || 'Funcionário') :
                  STATE.perfil?.nivel === 'dono' ? 'Proprietário' :
                  STATE.perfil?.nivel === 'gerente' ? 'Gerente' : 'Técnico';

    const initials = nome.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();

    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarName   = document.getElementById('sidebar-name');
    const sidebarRole   = document.getElementById('sidebar-role');
    const headerAvatar  = document.getElementById('header-avatar');

    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (sidebarName)   sidebarName.textContent   = nome.split(' ')[0];
    if (sidebarRole)   sidebarRole.textContent   = nivel;
    if (headerAvatar)  headerAvatar.textContent  = initials;

    // Mostra/oculta Master Admin no nav
    const navMaster = document.getElementById('nav-master');
    if (navMaster) navMaster.style.display = STATE.isMaster ? 'flex' : 'none';

    // Atualiza rótulo do módulo OS conforme segmento
    Auth._updateSegmentLabels();
  },

  _updateSegmentLabels() {
    const seg = window.SEGMENTS?.current;
    if (!seg) return;
    const label = seg.labels?.[I18N.lang]?.os_module || seg.labels?.pt?.os_module || 'OS';
    const short  = label.split(' ')[0];

    const navOs        = document.getElementById('nav-os-label');
    const mobileNavOs  = document.getElementById('mobile-nav-os-label');
    const osPageTitle  = document.getElementById('os-page-title');
    const btnNewOs     = document.getElementById('btn-new-os-label');
    const osEmptyTitle = document.getElementById('os-empty-title');
    const recentTitle  = document.getElementById('recent-os-title');

    if (navOs)        navOs.textContent       = label;
    if (mobileNavOs)  mobileNavOs.textContent = short;
    if (osPageTitle)  osPageTitle.textContent = label;
    if (btnNewOs)     btnNewOs.textContent    = seg.labels?.[I18N.lang]?.os_new || 'Nova OS';
    if (osEmptyTitle) osEmptyTitle.textContent = `Nenhum${label.includes('Venda')?'a':''} ${label.split(' ')[0].toLowerCase()} ainda`;
    if (recentTitle)  recentTitle.textContent = label + ' Recentes';
  },

  // ── CONTROLE DE PERMISSÕES ────────────────────────────────
  can(permission) {
    // Dono e master podem tudo
    if (STATE.isMaster || STATE.perfil?.nivel === 'dono') return true;
    // Gerente tem acesso amplo exceto configurações
    if (STATE.perfil?.nivel === 'gerente') {
      const bloqueado = ['edit_settings', 'manage_employees'];
      return !bloqueado.includes(permission);
    }
    // Funcionário por PIN — verifica permissões individuais
    if (STATE.funcionario) {
      return !!STATE.permissions[permission];
    }
    return false;
  },

  // Bloqueia UI de itens sem permissão
  enforcePermissions() {
    // Oculta itens de nav sem permissão
    const restrictions = {
      'cash':      'view_cash',
      'analytics': 'view_analytics',
      'settings':  'edit_settings',
    };
    Object.entries(restrictions).forEach(([page, perm]) => {
      const navItem = document.querySelector(`[data-nav="${page}"]`);
      if (navItem && !Auth.can(perm)) {
        navItem.style.opacity = '.4';
        navItem.style.pointerEvents = 'none';
        navItem.title = 'Sem permissão';
      }
    });
  },
};

// ── BOOT ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Garante loading visível
  const loadingEl = document.getElementById('loading-screen');
  if (loadingEl) loadingEl.style.display = 'flex';

  // Init i18n e segmentos salvos
  if (window.I18N) I18N.init();
  const savedSeg = localStorage.getItem('nexos_segment');
  if (savedSeg && window.SEGMENTS) SEGMENTS.set(savedSeg);

  // Verifica sessão existente
  try {
    const { data: { session } } = await window.sb.auth.getSession();

    if (session?.user) {
      await Auth.loadUser(session.user);
    } else {
      // Sem sessão — verifica se tem onboarding pendente (vinda do Google OAuth)
      Auth.showAuthScreen();
    }
  } catch(e) {
    console.error('Erro no boot:', e);
    Auth.showAuthScreen();
  }

  // Listener de mudanças de auth (OAuth redirect, logout, etc)
  window.sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !STATE.user) {
      await Auth.loadUser(session.user);
    } else if (event === 'SIGNED_OUT') {
      STATE.user      = null;
      STATE.empresa   = null;
      STATE.perfil    = null;
      STATE.funcionario = null;
      Auth.showAuthScreen();
    } else if (event === 'PASSWORD_RECOVERY') {
      UI.toast('ℹ Digite sua nova senha para continuar.', 'info');
    }
  });

  // Inicializa Lucide icons
  if (window.lucide) lucide.createIcons();
});

// ── USER MENU (dropdown do usuário) ───────────────────────
function toggleUserMenu() {
  const existing = document.getElementById('user-menu-dropdown');
  if (existing) { existing.remove(); return; }

  const nome   = STATE.funcionario?.nome || STATE.perfil?.nome || STATE.user?.email || '?';
  const email  = STATE.user?.email || '';
  const nivel  = STATE.isMaster ? 'Master Admin' :
                 STATE.funcionario ? (STATE.funcionario.funcao || 'Funcionário') :
                 STATE.perfil?.nivel === 'dono' ? 'Proprietário' : 'Usuário';
  const empresa = STATE.empresa?.nome || '';

  const menu = document.createElement('div');
  menu.id = 'user-menu-dropdown';
  menu.style.cssText = `
    position:fixed; bottom:72px; left:10px; right:10px;
    background:var(--bg-2); border:1px solid var(--border-md);
    border-radius:var(--radius-lg); padding:8px;
    box-shadow:var(--shadow-lg); z-index:500;
    animation:fadeSlide .15s var(--ease);
  `;

  menu.innerHTML = `
    <div style="padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
      <div style="font-size:.88rem;font-weight:700">${nome}</div>
      <div style="font-size:.74rem;color:var(--text-3)">${email}</div>
      <div style="font-size:.74rem;color:var(--text-3);margin-top:2px">${nivel}${empresa?' · '+empresa:''}</div>
    </div>
    <div class="dropdown-item" onclick="goPage('settings');document.getElementById('user-menu-dropdown')?.remove()">
      <i data-lucide="settings" style="width:14px;height:14px"></i> Configurações
    </div>
    ${STATE.empresa ? `
    <div class="dropdown-item" onclick="copyEmpresaCode()">
      <i data-lucide="hash" style="width:14px;height:14px"></i> Código da empresa
    </div>` : ''}
    <div class="dropdown-sep"></div>
    <div class="dropdown-item danger" onclick="Auth.logout();document.getElementById('user-menu-dropdown')?.remove()">
      <i data-lucide="log-out" style="width:14px;height:14px"></i> Sair
    </div>
  `;

  document.body.appendChild(menu);
  if (window.lucide) lucide.createIcons();

  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}

// Copia código da empresa para PIN login
async function copyEmpresaCode() {
  const codigo = STATE.empresa?.codigo || STATE.empresa?.id?.slice(0,8);
  if (!codigo) return;
  try {
    await navigator.clipboard.writeText(codigo);
    UI.toast('📋 Código copiado: ' + codigo, 'success');
  } catch {
    UI.toast('Código: ' + codigo, 'info');
  }
  document.getElementById('user-menu-dropdown')?.remove();
}

// ── GLOBAL SEARCH ──────────────────────────────────────────
function globalSearch(query) {
  if (!query || query.length < 2) return;
  // Passa para App.js processar
  if (window.App?.globalSearch) App.globalSearch(query);
}

// ── CSS SPIN ANIMATION ─────────────────────────────────────
const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }';
document.head.appendChild(spinStyle);
