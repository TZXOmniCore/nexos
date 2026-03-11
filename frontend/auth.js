/* ═══════════════════════════════════════════════
   NEXOS v3.0 — AUTH.JS
   ═══════════════════════════════════════════════ */

// Supabase init
const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';
window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const Auth = {
  showScreen() {
    document.getElementById('auth-screen').classList.remove('gone');
    document.getElementById('app').classList.add('gone');
    document.getElementById('bottom-nav').classList.add('gone');
    document.getElementById('fab-btn').classList.add('gone');
    document.getElementById('onboarding').classList.add('gone');
  },

  tab(t) {
    document.getElementById('auth-login').classList.toggle('gone', t !== 'login');
    document.getElementById('auth-register').classList.toggle('gone', t !== 'register');
    document.getElementById('auth-pin').classList.toggle('gone', t !== 'pin');
    ['tab-login','tab-reg','tab-pin'].forEach(id => document.getElementById(id).classList.remove('on'));
    document.getElementById('tab-' + (t === 'register' ? 'reg' : t === 'pin' ? 'pin' : 'login')).classList.add('on');
  },

  showErr(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
  },

  showOk(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
  },

  async login() {
    const email = document.getElementById('li-email').value.trim();
    const pass = document.getElementById('li-pass').value;
    if (!email || !pass) { Auth.showErr('auth-err-login', '⚠️ Preencha email e senha'); return; }
    document.querySelector('#auth-login .btn-auth-primary').textContent = '⏳ Entrando...';
    const { error } = await window.sb.auth.signInWithPassword({ email, password: pass });
    document.querySelector('#auth-login .btn-auth-primary').innerHTML = '<span>Entrar</span><span>→</span>';
    if (error) Auth.showErr('auth-err-login', '❌ ' + (error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message));
  },

  async register() {
    const name = document.getElementById('rg-name').value.trim();
    const email = document.getElementById('rg-email').value.trim();
    const pass = document.getElementById('rg-pass').value;
    if (!name || !email || !pass) { Auth.showErr('auth-err-reg', '⚠️ Preencha todos os campos'); return; }
    if (pass.length < 6) { Auth.showErr('auth-err-reg', '⚠️ Senha deve ter no mínimo 6 caracteres'); return; }
    document.querySelector('#auth-register .btn-auth-primary').textContent = '⏳ Criando conta...';
    const { error } = await window.sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    document.querySelector('#auth-register .btn-auth-primary').innerHTML = '<span>Criar conta</span><span>→</span>';
    if (error) Auth.showErr('auth-err-reg', '❌ ' + error.message);
    else Auth.showOk('auth-ok-login', '✅ Conta criada! Verifique seu email.');
  },

  async loginGoogle() {
    const { error } = await window.sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) Auth.showErr('auth-err-login', '❌ ' + error.message);
  },

  async pinLogin() {
    const codigo = document.getElementById('pin-empresa').value.trim();
    const pin = document.getElementById('pin-code').value.trim();
    if (!codigo || pin.length < 4) { Auth.showErr('auth-err-pin', '⚠️ Informe o código e o PIN'); return; }
    try {
      const { data: emp } = await window.sb.from('empresas')
        .select('id,nome').eq('codigo', codigo).single();
      if (!emp) { Auth.showErr('auth-err-pin', '❌ Empresa não encontrada'); return; }
      const { data: func } = await window.sb.from('funcionarios')
        .select('*').eq('empresa_id', emp.id).eq('pin_hash', btoa(pin)).eq('ativo', true).single();
      if (!func) { Auth.showErr('auth-err-pin', '❌ PIN incorreto ou funcionário inativo'); return; }
      // Login via PIN — usar conta da empresa
      UI.toast('✅ Bem-vindo, ' + func.nome + '!');
      // Modo funcionário (sem auth Supabase, sessão local)
      STATE.funcionario = func;
      // TODO: implementar modo funcionário completo
      Auth.showErr('auth-err-pin', '⚠️ Login por PIN em breve!');
    } catch(e) {
      Auth.showErr('auth-err-pin', '❌ Erro: ' + e.message);
    }
  },

  async forgot() {
    const email = document.getElementById('li-email').value.trim();
    if (!email) { Auth.showErr('auth-err-login', '⚠️ Informe o email primeiro'); return; }
    const { error } = await window.sb.auth.resetPasswordForEmail(email);
    if (error) Auth.showErr('auth-err-login', '❌ ' + error.message);
    else {
      document.getElementById('auth-ok-login').textContent = '✅ Email de redefinição enviado!';
      document.getElementById('auth-ok-login').classList.add('show');
    }
  },

  async logout() {
    if (!confirm('Sair do NexOS?')) return;
    await window.sb.auth.signOut();
    location.reload();
  },
};

// Google login button
document.getElementById('btn-google')?.addEventListener('click', Auth.loginGoogle);

// Enter key on login
document.getElementById('li-pass')?.addEventListener('keydown', e => { if(e.key==='Enter') Auth.login(); });
document.getElementById('rg-pass')?.addEventListener('keydown', e => { if(e.key==='Enter') Auth.register(); });
