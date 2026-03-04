// ═══════════════════════════════════════════════════════════
// NEXOS v2.0 — AUTH.JS
// ═══════════════════════════════════════════════════════════

const Auth = (() => {

  // ── UI helpers internos ──
  const $       = (id)       => document.getElementById(id);
  const show    = (id)       => $( id)?.classList.remove('gone');
  const hide    = (id)       => $(id)?.classList.add('gone');
  const val     = (id)       => $(id)?.value?.trim() ?? '';
  const setBtn  = (id, txt, disabled) => { const b = $(id); if (b) { b.textContent = txt; b.disabled = disabled; } };

  function showErr(msg) {
    const el = $('authErr');
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }
  function showOk(msg) {
    const el = $('authOk');
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }
  function clearMsg() {
    $('authErr')?.classList.remove('show');
    $('authOk')?.classList.remove('show');
  }

  // ── Alternar abas Login / Cadastro ──
  function switchTab(tab) {
    const isLogin = tab === 'login';
    document.querySelectorAll('.auth-tab').forEach((el, i) =>
      el.classList.toggle('on', isLogin ? i === 0 : i === 1)
    );
    $('loginForm').style.display    = isLogin ? 'block' : 'none';
    $('registerForm').style.display = isLogin ? 'none'  : 'block';
    $('forgotForm').style.display   = 'none';
    clearMsg();
  }

  // ── Mostrar tela de recuperação ──
  function showForgot() {
    $('loginForm').style.display  = 'none';
    $('forgotForm').style.display = 'block';
    clearMsg();
  }

  // ── Mostrar / esconder senha ──
  function togglePass(inputId, btn) {
    const el = $(inputId);
    if (!el) return;
    el.type     = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? '👁' : '🙈';
  }

  // ── Login ──
  async function login() {
    clearMsg();
    const email = val('loginEmail');
    const pw    = val('loginPass');
    if (!email || !pw) { showErr('Preencha email e senha'); return; }

    setBtn('btnLogin', '⏳ Entrando...', true);

    const { error } = await API.auth.signIn(email, pw);

    if (error) {
      showErr(
        error.message === 'Invalid login credentials'
          ? 'Email ou senha incorretos'
          : 'Erro ao entrar. Tente novamente.'
      );
      setBtn('btnLogin', '🔐 Entrar no sistema', false);
    }
    // sucesso → onAuthStateChange cuida do resto
  }

  // ── Cadastro ──
  async function register() {
    clearMsg();
    const nome    = val('regNome');
    const empresa = val('regEmpresa');
    const email   = val('regEmail');
    const pw      = val('regPass');

    if (!nome || !empresa || !email || !pw) {
      showErr('Preencha todos os campos'); return;
    }
    if (pw.length < 6) {
      showErr('Senha deve ter no mínimo 6 caracteres'); return;
    }

    setBtn('btnRegister', '⏳ Criando conta...', true);

    const { data, error } = await API.auth.signUp(email, pw, { nome, empresa_nome: empresa });

    if (error) {
      showErr(error.message);
      setBtn('btnRegister', '🚀 Criar minha conta grátis', false);
      return;
    }

    if (data?.user) {
      await API.perfil.registrarEmpresa(empresa, nome, data.user.id);
      showOk('✅ Conta criada! Verifique seu email para confirmar.');
    }

    setBtn('btnRegister', '🚀 Criar minha conta grátis', false);
  }

  // ── Google OAuth ──
  async function google() {
    await API.auth.google(window.location.href);
  }

  // ── Recuperar senha ──
  async function forgot() {
    clearMsg();
    const email = val('forgotEmail');
    if (!email) { showErr('Digite seu email'); return; }

    const { error } = await API.auth.resetPw(email, window.location.href);
    if (error) showErr(error.message);
    else showOk('✅ Link enviado! Verifique sua caixa de entrada.');
  }

  // ── Logout ──
  async function logout() {
    await API.auth.signOut();
    UI.toast('👋 Até logo!');
  }

  // ── Exibir tela de auth ──
  function showScreen() {
    hide('loading-screen');
    hide('onboarding');
    show('auth-screen');
  }

  // ── API pública do módulo ──
  return { switchTab, showForgot, togglePass, login, register, google, forgot, logout, showScreen };

})();

window.Auth = Auth;

// ── Atalhos globais chamados via onclick no HTML ──
window.authTab       = (t)       => Auth.switchTab(t);
window.showForgot    = ()        => Auth.showForgot();
window.togglePass    = (id, btn) => Auth.togglePass(id, btn);
window.doLogin       = ()        => Auth.login();
window.doRegister    = ()        => Auth.register();
window.doGoogleLogin = ()        => Auth.google();
window.doForgot      = ()        => Auth.forgot();
window.doLogout      = ()        => Auth.logout();
