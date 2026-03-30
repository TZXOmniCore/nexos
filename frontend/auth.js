/* NexOS v3.5 — auth.js | Segurança corporativa */
'use strict';

const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'nexos_auth_v2',
    storage: window.localStorage,
    detectSessionInUrl: true,
    flowType: 'pkce',
  }
});

window.STATE = {
  user: null, empresa: null, perfil: null,
  funcionario: null, isMaster: false,
  permissions: {}, currency: 'BRL',
};

const RL = {
  MAX: 5, LOCK_MS: 5 * 60 * 1000,
  get(k) { try { return JSON.parse(localStorage.getItem('_rl_' + k) || '{"n":0,"t":0}'); } catch { return {n:0,t:0}; } },
  set(k,d) { try { localStorage.setItem('_rl_' + k, JSON.stringify(d)); } catch {} },
  locked(k) {
    const d = this.get(k);
    if (d.t && Date.now() < d.t) return true;
    if (d.t && Date.now() >= d.t) { localStorage.removeItem('_rl_' + k); return false; }
    return false;
  },
  fail(k) { const d=this.get(k); d.n=(d.n||0)+1; if(d.n>=this.MAX) d.t=Date.now()+this.LOCK_MS; this.set(k,d); },
  reset(k) { localStorage.removeItem('_rl_' + k); },
  mins(k) { return Math.ceil(Math.max(0,(this.get(k).t||0)-Date.now())/60000); },
};

function _s(v,n) { return typeof v==='string'?v.trim().slice(0,n||255).replace(/[<>"'`]/g,''):''; }
function _sh(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _email(e) { return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e); }

function _showLoading() {
  document.getElementById('loading-screen').style.display='flex';
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-shell').style.display='none';
  const ob=document.getElementById('onboarding-screen'); if(ob) ob.style.display='none';
}
function _showAuth() {
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app-shell').style.display='none';
  const ob=document.getElementById('onboarding-screen'); if(ob) ob.style.display='none';
  showLoginView(); if(window.lucide) lucide.createIcons();
}
function _showOnboarding() {
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-shell').style.display='none';
  const ob=document.getElementById('onboarding-screen'); if(ob) ob.style.display='block';
  if(window.lucide) lucide.createIcons();
}
function _showApp() {
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-shell').style.display='flex';
  const ob=document.getElementById('onboarding-screen'); if(ob) ob.style.display='none';
  if(window.lucide) lucide.createIcons();
}

const Auth = {
  showAuthScreen() { _showAuth(); },
  showApp() { _showApp(); },
  showOnboarding() { _showOnboarding(); },

  async login() {
    const email=_s(document.getElementById('auth-email')?.value,254);
    const pass=(document.getElementById('auth-pass')?.value||'').slice(0,128);
    if(!email||!pass){UI.toast('Preencha e-mail e senha','warning');return;}
    if(!_email(email)){UI.toast('E-mail inválido','warning');return;}
    if(RL.locked('login')){UI.toast('Muitas tentativas. Aguarde '+RL.mins('login')+' min.','error');return;}
    const btn=document.querySelector('#auth-login-view .btn-primary');
    if(btn){btn.disabled=true;btn.textContent='Entrando...';}
    try {
      const {error}=await window.sb.auth.signInWithPassword({email,password:pass});
      if(error){RL.fail('login');UI.toast('Credenciais inválidas','error');}
      else RL.reset('login');
    } catch{UI.toast('Erro de conexão','error');}
    finally{if(btn){btn.disabled=false;btn.textContent='Entrar';}}
  },

  async loginGoogle() {
    try {
      const {error}=await window.sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
      if(error) UI.toast('Erro ao entrar com Google','error');
    } catch{UI.toast('Erro ao entrar com Google','error');}
  },

  async register() {
    const name=_s(document.getElementById('reg-name')?.value,100);
    const email=_s(document.getElementById('reg-email')?.value,254);
    const pass=(document.getElementById('reg-pass')?.value||'').slice(0,128);
    if(!name||!email||!pass){UI.toast('Preencha todos os campos','warning');return;}
    if(!_email(email)){UI.toast('E-mail inválido','warning');return;}
    if(pass.length<8){UI.toast('Senha mínimo 8 caracteres','warning');return;}
    if(RL.locked('reg')){UI.toast('Muitas tentativas. Aguarde.','error');return;}
    const btn=document.querySelector('#auth-register-view .btn-primary');
    if(btn){btn.disabled=true;btn.textContent='Criando...';}
    try {
      await window.sb.auth.signUp({email,password:pass,options:{data:{full_name:name}}});
      RL.reset('reg');
      UI.toast('Verifique seu e-mail para ativar a conta.','success');
      showLoginView();
      const el=document.getElementById('auth-email'); if(el) el.value=email;
    } catch{RL.fail('reg');UI.toast('Erro ao criar conta','error');}
    finally{if(btn){btn.disabled=false;btn.textContent='Criar conta';}}
  },

  async forgotPassword(raw) {
    const email=_s(raw||document.getElementById('auth-email')?.value,254);
    if(!email||!_email(email)){UI.toast('Digite um e-mail válido','warning');return;}
    if(RL.locked('forgot')){UI.toast('Aguarde antes de tentar novamente.','error');return;}
    await window.sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
    RL.fail('forgot');
    UI.toast('Se o e-mail existir, você receberá o link.','info');
  },

  async logout() {
    if(!confirm('Deseja sair do NexOS?')) return;
    try {
      STATE.user=STATE.empresa=STATE.perfil=STATE.funcionario=null;
      STATE.isMaster=false; STATE.permissions={};
      localStorage.removeItem('nexos_page');
      await window.sb.auth.signOut();
    } catch{STATE.user=null;}
    _showAuth(); UI.toast('Até logo! 👋','info');
  },

  async loadUser(supabaseUser) {
    if(!supabaseUser?.id){_showAuth();return;}
    STATE.user=supabaseUser;
    try {
      const {data:perfil,error}=await window.sb.from('usuarios').select('*, empresas(*)').eq('user_id',supabaseUser.id).maybeSingle();
      if(error) throw error;
      if(!perfil) {
        if(localStorage.getItem('nexos_onboarding_done')) await Auth._createEmpresa(supabaseUser);
        else _showOnboarding();
        return;
      }
      STATE.perfil=perfil; STATE.empresa=perfil.empresas;
      STATE.isMaster=perfil.nivel==='master'||perfil.cargo==='master';
      const prefs=(() => {try{return JSON.parse(localStorage.getItem('nexos_prefs')||'{}');}catch{return{};}})();
      if(prefs.currency) STATE.currency=prefs.currency;
      if(prefs.lang&&window.I18N) I18N.set(prefs.lang);
      if(window.SEGMENTS){SEGMENTS._current=null;if(STATE.empresa?.segmento) SEGMENTS.set(STATE.empresa.segmento);}
      Auth._ui(); _showApp();
      if(window.App) App.init();
    } catch(e) {
      console.error('loadUser:',e);
      UI.toast('Erro ao carregar perfil. Tente novamente.','error');
      _showAuth();
    }
  },

  async _createEmpresa(u) {
    const prefs=(() => {try{return JSON.parse(localStorage.getItem('nexos_prefs')||'{}');}catch{return{};}})();
    const SEGS=['tech','retail','beauty','garage'];
    const CURS=['BRL','USD','EUR','GBP','ARS'];
    const LANGS=['pt','en','es'];
    try {
      const {data:emp,error:e1}=await window.sb.from('empresas').insert({
        nome:_s(prefs.company||u.user_metadata?.full_name||'Minha Empresa',100),
        telefone:_s(prefs.phone||'',20), cnpj:_s(prefs.cnpj||'',20), pix:_s(prefs.pix||'',100),
        segmento:SEGS.includes(prefs.segment)?prefs.segment:'tech',
        moeda:CURS.includes(prefs.currency)?prefs.currency:'BRL',
        idioma:LANGS.includes(prefs.lang)?prefs.lang:'pt',
        plano:'basico',ativo:true,codigo:Math.random().toString(36).slice(2,8).toUpperCase(),
      }).select().single();
      if(e1) throw e1;
      const {data:perfil,error:e2}=await window.sb.from('usuarios').insert({
        user_id:u.id,empresa_id:emp.id,
        nome:_s(u.user_metadata?.full_name||u.email,100),
        email:u.email,nivel:'dono',cargo:'dono',ativo:true,
      }).select('*, empresas(*)').single();
      if(e2) throw e2;
      STATE.perfil=perfil; STATE.empresa=emp;
      STATE.currency=CURS.includes(prefs.currency)?prefs.currency:'BRL';
      if(prefs.lang&&window.I18N) I18N.set(prefs.lang);
      if(prefs.segment&&window.SEGMENTS) SEGMENTS.set(prefs.segment);
      localStorage.removeItem('nexos_onboarding_done');
      Auth._ui(); _showApp();
      if(window.App) App.init();
      UI.toast('Bem-vindo ao NexOS! 🎉','success');
    } catch(e) {
      console.error('_createEmpresa:',e);
      UI.toast('Erro ao configurar empresa','error');
      _showOnboarding();
    }
  },

  _ui() {
    const nome=STATE.perfil?.nome||STATE.user?.user_metadata?.full_name||STATE.user?.email||'?';
    const nivel=STATE.isMaster?'Master Admin':STATE.perfil?.nivel==='dono'?'Proprietário':STATE.perfil?.nivel==='gerente'?'Gerente':'Técnico';
    const ini=nome.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    [['sidebar-avatar',ini],['sidebar-name',nome.split(' ')[0]],['sidebar-role',nivel],['header-avatar',ini]]
      .forEach(([id,v])=>{const el=document.getElementById(id);if(el) el.textContent=v;});
    const nm=document.getElementById('nav-master'); if(nm) nm.style.display=STATE.isMaster?'flex':'none';
  },

  can(p) {
    if(STATE.isMaster||STATE.perfil?.nivel==='dono') return true;
    if(STATE.perfil?.nivel==='gerente') return !['edit_settings','manage_employees'].includes(p);
    if(STATE.funcionario) return !!STATE.permissions[p];
    return false;
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  _showLoading();
  if(window.I18N) I18N.init();
  if(window.SEGMENTS){
    SEGMENTS._current=null;
    const seg=localStorage.getItem('nexos_segment');
    if(seg&&SEGMENTS.configs[seg]) SEGMENTS.set(seg);
  }
  try {
    const {data:{session}}=await window.sb.auth.getSession();
    if(session?.user) await Auth.loadUser(session.user);
    else _showAuth();
  } catch{_showAuth();}

  window.sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_IN'&&session?.user&&!STATE.user) await Auth.loadUser(session.user);
    else if(event==='TOKEN_REFRESHED'&&session?.user) STATE.user=session.user;
    else if(event==='SIGNED_OUT'){STATE.user=STATE.empresa=STATE.perfil=null;_showAuth();}
  });

  if(window.lucide) lucide.createIcons();
});

function toggleUserMenu() {
  const ex=document.getElementById('user-menu-dd'); if(ex){ex.remove();return;}
  const nome=_sh(STATE.perfil?.nome||STATE.user?.email||'?');
  const email=_sh(STATE.user?.email||'');
  const nivel=_sh(STATE.isMaster?'Master Admin':STATE.perfil?.nivel==='dono'?'Proprietário':'Gerente');
  const emp=_sh(STATE.empresa?.nome||'');
  const cod=_sh(STATE.empresa?.codigo||'');
  const m=document.createElement('div'); m.id='user-menu-dd';
  m.style.cssText='position:fixed;bottom:72px;left:10px;right:10px;background:var(--bg-2);border:1px solid var(--border-md);border-radius:var(--radius-lg);padding:8px;box-shadow:var(--shadow-lg);z-index:500';
  m.innerHTML=`<div style="padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
    <div style="font-size:.88rem;font-weight:700">${nome}</div>
    <div style="font-size:.74rem;color:var(--text-3)">${email}</div>
    <div style="font-size:.74rem;color:var(--text-3)">${nivel}${emp?' · '+emp:''}</div>
    ${cod?`<div id="_cod_btn" style="font-size:.72rem;color:var(--blue);cursor:pointer">Código: ${cod} 📋</div>`:''}
  </div>
  <div class="dropdown-item" id="_cfg_btn"><i data-lucide="settings" style="width:14px;height:14px"></i> Configurações</div>
  <div class="dropdown-sep"></div>
  <div class="dropdown-item danger" id="_out_btn"><i data-lucide="log-out" style="width:14px;height:14px"></i> Sair</div>`;
  document.body.appendChild(m);
  document.getElementById('_cod_btn')?.addEventListener('click',async()=>{
    const c=STATE.empresa?.codigo||'';if(!c)return;
    try{await navigator.clipboard.writeText(c);}catch{}
    UI.toast('Código copiado: '+c,'success');m.remove();
  });
  document.getElementById('_cfg_btn')?.addEventListener('click',()=>{goPage('settings');m.remove();});
  document.getElementById('_out_btn')?.addEventListener('click',()=>{m.remove();Auth.logout();});
  if(window.lucide) lucide.createIcons();
  setTimeout(()=>{
    document.addEventListener('click',function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h);}});
  },50);
}

function showLoginView() {
  const lv=document.getElementById('auth-login-view');
  const rv=document.getElementById('auth-register-view');
  const pv=document.getElementById('auth-pin-view');
  if(lv) lv.style.display=''; if(rv) rv.style.display='none'; if(pv) pv.style.display='none';
}
function showRegisterView() {
  const lv=document.getElementById('auth-login-view');
  const rv=document.getElementById('auth-register-view');
  if(lv) lv.style.display='none'; if(rv) rv.style.display='';
}
function showRegister() { showRegisterView(); }
function showPinLogin() {
  const lv=document.getElementById('auth-login-view');
  const pv=document.getElementById('auth-pin-view');
  if(lv) lv.style.display='none'; if(pv) pv.style.display='';
}
function showForgotPass() { Auth.forgotPassword(document.getElementById('auth-email')?.value||''); }
function togglePass() {
  const i=document.getElementById('auth-pass');
  const b=document.getElementById('pass-eye');
  if(!i) return;
  const show=i.type==='password'; i.type=show?'text':'password';
  if(b) b.innerHTML=`<i data-lucide="${show?'eye-off':'eye'}" style="width:16px;height:16px"></i>`;
  if(window.lucide) lucide.createIcons();
}
function globalSearch(q) {
  if(!q||q.length<2) return;
  if(window.App?.globalSearch) App.globalSearch(q.trim().slice(0,100));
}

document.head.appendChild(Object.assign(document.createElement('style'),{
  textContent:'@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'
}));
