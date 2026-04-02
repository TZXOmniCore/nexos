/* ============================================================
   NexOS v4.0 — auth.js | Login v3.5 + PIN seguro
   ============================================================ */
'use strict';

// ── Rate Limiter ───────────────────────────────────────────
const RL = {
  MAX:5, LOCK:5*60*1000,
  get(k)  { try{return JSON.parse(localStorage.getItem('_rl_'+k)||'{"n":0,"t":0}');}catch{return{n:0,t:0};} },
  set(k,d){ try{localStorage.setItem('_rl_'+k,JSON.stringify(d));}catch{} },
  locked(k){ const d=this.get(k); if(d.t&&Date.now()<d.t)return true; if(d.t&&Date.now()>=d.t){localStorage.removeItem('_rl_'+k);return false;} return false; },
  fail(k) { const d=this.get(k); d.n=(d.n||0)+1; if(d.n>=this.MAX)d.t=Date.now()+this.LOCK; this.set(k,d); },
  reset(k){ localStorage.removeItem('_rl_'+k); },
  mins(k) { return Math.ceil(Math.max(0,(this.get(k).t||0)-Date.now())/60000); },
};

function _s(v,n) { return typeof v==='string'?v.trim().slice(0,n||200).replace(/[<>"'`]/g,''):''; }
function _email(e) { return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(e||'')); }

// ── Telas ──────────────────────────────────────────────────
function _showLoading() {
  document.getElementById('loading-screen').style.display='flex';
  document.getElementById('auth-screen').classList.remove('show');
  document.getElementById('app-shell').style.display='none';
}
function _showAuth() {
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('auth-screen').classList.add('show');
  document.getElementById('app-shell').style.display='none';
  showLoginView();
  if(window.lucide) lucide.createIcons();
}
function _showApp() {
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('auth-screen').classList.remove('show');
  document.getElementById('app-shell').style.display='flex';
  if(window.lucide) lucide.createIcons();
}

// ── Auth ───────────────────────────────────────────────────
const Auth = {
  async login() {
    const email = _s(document.getElementById('auth-email')?.value||'',254);
    const pass  = (document.getElementById('auth-pass')?.value||'').slice(0,128);
    if(!email||!pass){UI.toast('Preencha e-mail e senha','warning');return;}
    if(!_email(email)){UI.toast('E-mail inválido','warning');return;}
    if(RL.locked('login')){UI.toast('Muitas tentativas. Aguarde '+RL.mins('login')+' min.','error');return;}
    const btn = document.getElementById('btn-login');
    if(btn){btn.disabled=true;btn.textContent='Entrando...';}
    try {
      const {error} = await window.sb.auth.signInWithPassword({email,password:pass});
      if(error){RL.fail('login');UI.toast('Credenciais inválidas','error');}
      else RL.reset('login');
    } catch{UI.toast('Erro de conexão','error');}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="log-in" style="width:15px;height:15px"></i> Entrar';if(window.lucide)lucide.createIcons();}}
  },

  async register() {
    const nome  = _s(document.getElementById('reg-nome')?.value||'',100);
    const email = _s(document.getElementById('reg-email')?.value||'',254);
    const pass  = (document.getElementById('reg-pass')?.value||'').slice(0,128);
    if(!nome||!email||!pass){UI.toast('Preencha todos os campos','warning');return;}
    if(!_email(email)){UI.toast('E-mail inválido','warning');return;}
    if(pass.length<8){UI.toast('Senha mínimo 8 caracteres','warning');return;}
    if(RL.locked('reg')){UI.toast('Muitas tentativas. Aguarde.','error');return;}
    const btn = document.getElementById('btn-reg');
    if(btn){btn.disabled=true;btn.textContent='Criando...';}
    try {
      const {error} = await window.sb.auth.signUp({email,password:pass,options:{data:{full_name:nome}}});
      if(error)throw error;
      RL.reset('reg');
      UI.toast('Verifique seu e-mail para ativar a conta!','success');
      showLoginView();
      const el=document.getElementById('auth-email');if(el)el.value=email;
    } catch(e){RL.fail('reg');UI.toast(e.message.includes('already registered')?'E-mail já cadastrado':'Erro ao criar conta','error');}
    finally{if(btn){btn.disabled=false;btn.textContent='Criar conta';}}
  },

  async forgot() {
    const email = _s(document.getElementById('auth-email')?.value||'',254);
    if(!email||!_email(email)){UI.toast('Digite um e-mail válido','warning');return;}
    if(RL.locked('forgot')){UI.toast('Aguarde antes de tentar novamente','error');return;}
    await window.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    RL.fail('forgot');
    UI.toast('Se o e-mail existir, você receberá o link de recuperação','success');
  },

  async logout() {
    if(!confirm('Deseja sair do NexOS?'))return;
    STATE.user=STATE.perfil=STATE.empresa=null;
    localStorage.removeItem('nexos_v4_page');
    await window.sb.auth.signOut().catch(()=>{});
    _showAuth();
    UI.toast('Até logo! 👋','success');
  },

  async loadUser(user) {
    if(!user?.id){_showAuth();return;}
    STATE.user=user;
    try {
      STATE.perfil = await API.getPerfil(user.id);
      if(!STATE.perfil) {
        STATE.perfil = await API.upsertPerfil(user.id,{
          empresa_nome: user.user_metadata?.full_name||'Minha Empresa',
        });
      }
      Auth._ui();
      _showApp();
      if(window.App) App.init();
    } catch(e) {
      console.error('loadUser error:',e);
      UI.toast('Erro ao carregar perfil. Tente novamente.','error');
      _showAuth();
    }
  },

  _ui() {
    const p = STATE.perfil||{};
    const nome = p.empresa_nome||STATE.user?.email||'NexOS';
    const ini  = initials(nome);
    ['sidebar-avatar','header-avatar'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=ini;});
    const sn=document.getElementById('sidebar-name');if(sn)sn.textContent=nome.split(' ')[0];
    const sr=document.getElementById('sidebar-role');if(sr)sr.textContent='Proprietário';
  },
};

// ── PIN: verificar PIN de 4 dígitos ───────────────────────
async function verifyPIN(pin) {
  // PIN é guardado no perfil como hash base64 simples
  const hash = btoa(pin);
  return STATE.perfil?.pin_hash === hash;
}

async function showPINModal(onSuccess) {
  const id = 'pin_modal_'+Date.now();
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);backdrop-filter:blur(6px);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px';
  el.innerHTML=`
  <div style="background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-xl);padding:32px 28px;width:100%;max-width:340px;text-align:center">
    <div style="font-size:2rem;margin-bottom:8px">🔐</div>
    <h3 style="font-weight:700;margin-bottom:6px">Confirmar PIN</h3>
    <p style="font-size:.82rem;color:var(--text-2);margin-bottom:20px">Digite seu PIN de 4 dígitos</p>
    <div class="pin-inputs" id="${id}-pins">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]">
      <input class="pin-input" maxlength="1" type="password" inputmode="numeric" pattern="[0-9]">
    </div>
    <div id="${id}-err" style="color:var(--red);font-size:.8rem;min-height:20px;margin-bottom:10px"></div>
    <div style="display:flex;gap:8px;justify-content:center">
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('${id}').remove()">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="${id}-ok">Confirmar</button>
    </div>
  </div>`;
  document.body.appendChild(el);

  // Auto-avançar entre inputs
  const inputs = el.querySelectorAll('.pin-input');
  inputs.forEach((inp,i) => {
    inp.addEventListener('input',()=>{if(inp.value&&i<inputs.length-1)inputs[i+1].focus();});
    inp.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!inp.value&&i>0)inputs[i-1].focus();});
  });
  inputs[0].focus();

  document.getElementById(id+'-ok').onclick = async () => {
    const pin = Array.from(inputs).map(i=>i.value).join('');
    if(pin.length<4){document.getElementById(id+'-err').textContent='Digite 4 dígitos';return;}
    const ok = await verifyPIN(pin);
    if(ok){el.remove();onSuccess();}
    else{document.getElementById(id+'-err').textContent='PIN incorreto';inputs.forEach(i=>i.value='');inputs[0].focus();}
  };
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  _showLoading();
  try {
    const {data:{session}} = await window.sb.auth.getSession();
    if(session?.user) await Auth.loadUser(session.user);
    else _showAuth();
  } catch{_showAuth();}

  window.sb.auth.onAuthStateChange(async(ev,session)=>{
    if(ev==='SIGNED_IN'&&session?.user&&!STATE.user) await Auth.loadUser(session.user);
    else if(ev==='TOKEN_REFRESHED'&&session?.user) STATE.user=session.user;
    else if(ev==='SIGNED_OUT'){STATE.user=STATE.perfil=null;_showAuth();}
  });
});

// ── Auth UI helpers ────────────────────────────────────────
function showLoginView() {
  document.getElementById('auth-login-view').style.display='';
  document.getElementById('auth-reg-view').style.display='none';
}
function showRegView() {
  document.getElementById('auth-login-view').style.display='none';
  document.getElementById('auth-reg-view').style.display='';
}
function togglePass() {
  const i=document.getElementById('auth-pass');if(!i)return;
  const show=i.type==='password';i.type=show?'text':'password';
  const b=document.getElementById('pass-eye');
  if(b) b.innerHTML=`<i data-lucide="${show?'eye-off':'eye'}" style="width:16px;height:16px"></i>`;
  if(window.lucide) lucide.createIcons();
}

function toggleUserMenu() {
  const ex=document.getElementById('user-menu-dd');if(ex){ex.remove();return;}
  const p=STATE.perfil||{};
  const nome=p.empresa_nome||STATE.user?.email||'?';
  const email=STATE.user?.email||'';
  const m=document.createElement('div');m.id='user-menu-dd';
  m.style.cssText='position:fixed;bottom:72px;left:10px;right:10px;background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-lg);padding:8px;box-shadow:var(--shadow-lg);z-index:500';
  m.innerHTML=`
  <div style="padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px">
    <div style="font-size:.88rem;font-weight:700">${nome}</div>
    <div style="font-size:.74rem;color:var(--text-3)">${email}</div>
    <div style="font-size:.74rem;color:var(--text-3)">Proprietário</div>
  </div>
  <div class="dropdown-item" id="_cfg_btn">⚙️ Configurações</div>
  <div class="dropdown-sep"></div>
  <div class="dropdown-item danger" id="_out_btn">🚪 Sair</div>`;
  document.body.appendChild(m);
  document.getElementById('_cfg_btn')?.addEventListener('click',()=>{goPage('config');m.remove();});
  document.getElementById('_out_btn')?.addEventListener('click',()=>{m.remove();Auth.logout();});
  setTimeout(()=>{document.addEventListener('click',function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h);}});},50);
}
