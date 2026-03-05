// ═══════════════════════════════════════════════════════════
// NEXOS v2.0 — APP.JS  (Parte 1/2)
// ═══════════════════════════════════════════════════════════

window.STATE = {
  user:            null,
  empresa:         null,
  perfil:          null,
  plano:           null,
  os:              [],
  movs:            [],
  produtos:        [],
  clientes:        [],
  notifs:          [],
  newItems:        [],
  newPhotos:       [],
  currentPay:      'dinheiro',
  activeFilter:    'todas',
  currentOsId:     null,
  currentCompId:   null,
  carneConfig:     { n: 3, dia: 10, entrada: 0 },
  sigDrawing:      false,
  slx: 0, sly:     0,
  charts:          {},
  theme:           'dark',
  _masterEmpresas: [],
};

// ── UI helpers ──
const UI = {
  show:   (id)      => document.getElementById(id)?.classList.remove('gone'),
  hide:   (id)      => document.getElementById(id)?.classList.add('gone'),
  val:    (id)      => document.getElementById(id)?.value ?? '',
  set:    (id, v)   => { const el = document.getElementById(id); if (el) el.textContent = v; },
  setVal: (id, v)   => { const el = document.getElementById(id); if (el) el.value = v; },
  setLoading: (msg) => { const el = document.getElementById('loading-text'); if (el) el.textContent = msg; },

  toast: (() => {
    let timer;
    return (msg, isErr = false, persist = false) => {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent    = msg;
      t.style.background = isErr ? 'var(--red)' : persist ? 'var(--orange)' : 'var(--green)';
      t.style.color    = isErr ? '#fff' : '#000';
      t.classList.add('show');
      clearTimeout(timer);
      if (!persist) timer = setTimeout(() => t.classList.remove('show'), 2800);
    };
  })(),

  closeModal: () => document.getElementById('mwrap')?.classList.remove('open'),

  openModal: (html) => {
    const b = document.getElementById('mbody');
    if (b) b.innerHTML = html;
    document.getElementById('mwrap')?.classList.add('open');
  },

  closeMenus: () => {
    document.getElementById('notifPanel')?.classList.remove('open');
    document.getElementById('userMenu')?.classList.remove('open');
  },
};
window.UI = UI;

// ── Formatters ──
const F = {
  money:    (n)   => (Math.round((n ?? 0) * 100) / 100).toFixed(2).replace('.', ','),
  date:     (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—',
  datetime: (iso) => iso ? new Date(iso).toLocaleString('pt-BR',     { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—',
  time:     (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR',  { hour:'2-digit', minute:'2-digit' }) : '—',
  today:    ()    => new Date().toISOString().slice(0, 10),
  isVencido:(d)   => d && new Date(d + 'T12:00:00') < new Date(),

  status: (s) => ({
    paga:'✅ Paga', aberta:'🔵 Em Aberto', em_andamento:'🔧 Em Andamento',
    pronta:'🟢 Pronta', fiado:'🟡 Fiado', cancelada:'❌ Cancelada',
  })[s] ?? s,

  pagamento: (p) => ({
    dinheiro:'💵 Dinheiro', pix:'📱 PIX', credito:'💳 Crédito',
    debito:'💳 Débito', fiado:'📝 Fiado', carne:'📜 Carnê', transferencia:'🏦 Transferência',
  })[p] ?? (p || '—'),

  statusColor: (s) => ({
    paga:'#00c864', aberta:'#ff6d00', em_andamento:'#ff6d00',
    pronta:'#00e5ff', fiado:'#ffd600', cancelada:'#b2102f',
  })[s] ?? '#3d8bff',

  statusStyle: (s) => ({
    paga:         'border-color:var(--green);color:var(--green);background:rgba(0,230,118,.1)',
    aberta:       'border-color:var(--orange);color:var(--orange);background:rgba(255,109,0,.1)',
    em_andamento: 'border-color:var(--orange);color:var(--orange);background:rgba(255,109,0,.1)',
    pronta:       'border-color:var(--cyan);color:var(--cyan);background:rgba(0,229,255,.1)',
    fiado:        'border-color:var(--yellow);color:var(--yellow);background:rgba(255,214,0,.1)',
    cancelada:    'border-color:var(--red);color:var(--red);background:rgba(255,23,68,.1)',
  })[s] ?? '',
};
window.F = F;

// ── Helpers ──
const safeJSON = (v, fb = []) => {
  if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return v;
  try { return JSON.parse(v || '[]'); } catch { return fb; }
};

async function genHash(s) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2,'0')).join('').slice(0,32).toUpperCase();
  } catch { return Date.now().toString(36).toUpperCase(); }
}

function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Persistência de página ──
function saveActivePage(i) { localStorage.setItem('nexos_page', i); }
function getActivePage()   { return parseInt(localStorage.getItem('nexos_page') || '0'); }

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const theme = localStorage.getItem('nexos_theme') || 'dark';
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    STATE.theme = 'light';
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = '☀️';
  }

  UI.setLoading('Verificando sessão...');
  const { data: { session } } = await API.auth.getSession();
  if (session) {
    UI.setLoading('Carregando dados...');
    await carregarUsuario(session.user);
  } else {
    Auth.showScreen();
  }

  API.auth.onChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      UI.show('loading-screen');
      UI.setLoading('Carregando...');
      await carregarUsuario(session.user);
    } else if (event === 'SIGNED_OUT') {
      Object.assign(STATE, { user: null, empresa: null, perfil: null });
      localStorage.removeItem('nexos_page');
      Auth.showScreen();
    }
  });

  initSig();
  initEventListeners();
});

// ═══════════════════════════════════════════════════════════
// CARREGAR USUÁRIO
// ═══════════════════════════════════════════════════════════
async function carregarUsuario(user) {
  STATE.user = user;
  UI.setLoading('Carregando perfil...');

  const { data: perfil } = await API.perfil.get(user.id);

  if (!perfil) {
    UI.hide('loading-screen');
    UI.hide('auth-screen');
    UI.show('onboarding');
    const obEmp = document.getElementById('obEmpresa');
    if (obEmp) obEmp.value = user.user_metadata?.empresa_nome || '';
    return;
  }

  STATE.perfil  = perfil;
  STATE.empresa = perfil.empresas;
  STATE.plano   = perfil.empresas?.planos;

  await API.perfil.updateAcesso(user.id);
  UI.setLoading('Sincronizando dados...');

  await Promise.all([loadOS(), loadMovs(), loadProdutos(), loadClientes(), loadNotifs()]);

  UI.hide('loading-screen');
  UI.hide('auth-screen');
  UI.hide('onboarding');
  initUI();
  initRealtime();
}

// ═══════════════════════════════════════════════════════════
// INIT UI — restaura última página
// ═══════════════════════════════════════════════════════════
function initUI() {
  const { perfil: p, empresa: e, plano: pl } = STATE;
  UI.set('userName',    p.nome?.split(' ')[0] || '—');
  UI.set('userCargo',   p.cargo || '—');
  UI.set('headerStore', e?.nome || '');
  UI.set('umNome',      p.nome || '—');
  UI.set('umEmail',     p.email || '—');
  UI.set('configEmail', STATE.user?.email || '—');
  UI.set('configPlano', pl?.nome || 'Gratuito');
  UI.set('configVence', e?.plano_vence_em ? F.date(e.plano_vence_em) : '—');

  const av = document.getElementById('userAvatar');
  if (av) av.textContent = (p.nome || '?')[0].toUpperCase();

  const umPlano = document.getElementById('umPlano');
  if (umPlano) umPlano.innerHTML = `<span class="sbadge sb-paga">${pl?.nome || 'Gratuito'}</span>`;

  if (p.cargo === 'master') {
    const n8 = document.getElementById('n8');
    if (n8) n8.style.display = 'flex';
  }

  document.getElementById('dashSkeleton').style.display = 'none';
  document.getElementById('dashContent').style.display  = 'block';

  // ── Restaura última página ativa ──
  const lastPage = getActivePage();
  if (lastPage > 0) {
    goP(lastPage);
  } else {
    renderDashboard();
    initNovaOS();
    loadConfig();
    checkNotifs();
  }
}

// ═══════════════════════════════════════════════════════════
// DATA LOADERS
// ═══════════════════════════════════════════════════════════
async function loadOS()       { const { data } = await API.os.listar();       STATE.os       = data ?? []; }
async function loadMovs()     { const { data } = await API.caixa.listar();    STATE.movs     = data ?? []; }
async function loadProdutos() { const { data } = await API.produtos.listar(); STATE.produtos = data ?? []; }
async function loadClientes() { const { data } = await API.clientes.listar(); STATE.clientes = data ?? []; }
async function loadNotifs()   { const { data } = await API.notifs.listar();   STATE.notifs   = data ?? []; checkNotifs(); }

// ═══════════════════════════════════════════════════════════
// REALTIME
// ═══════════════════════════════════════════════════════════
function initRealtime() {
  if (!STATE.empresa?.id) return;
  API.realtime.iniciar(STATE.empresa.id, STATE.user.id, {
    onOS:    async () => { await loadOS();   renderOS(); renderDashboard(); },
    onCaixa: async () => { await loadMovs(); renderCaixa(); },
    onNotif: async () => { await loadNotifs(); },
  });
}

// ═══════════════════════════════════════════════════════════
// NAVEGAÇÃO — salva página no localStorage
// ═══════════════════════════════════════════════════════════
function goP(i) {
  saveActivePage(i);
  document.querySelectorAll('.page').forEach((p, j) => p.classList.toggle('on', i === j));
  document.querySelectorAll('.ni').forEach((n, j)   => n.classList.toggle('on', i === j));
  UI.closeMenus();
  const actions = {
    0: () => renderDashboard(),
    1: () => renderOS(),
    2: () => initNovaOS(),
    3: () => { UI.setVal('caixaDate', F.today()); renderCaixa(); iaFluxoCaixa(); },
    4: () => { renderEstoque(); iaSugerirEstoque(); },
    5: () => renderClientes(),
    6: () => { setMesAtual(); renderAnalytics(); },
    7: () => loadConfig(),
    8: () => renderMaster(),
  };
  actions[i]?.();
}
window.goP = goP;

// ═══════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════
let _obStep = 0;
function obNext(s) {
  if (s === 1 && !document.getElementById('obEmpresa')?.value.trim()) {
    UI.toast('⚠ Nome da empresa obrigatório', true); return;
  }
  _obStep = s;
  document.querySelectorAll('.onboard-step').forEach((el, i) => el.classList.toggle('on', i === s));
  document.querySelectorAll('.op-dot').forEach((el, i)        => el.classList.toggle('done', i <= s));
}

async function finishOnboard() {
  const { data: { user } } = await API.auth.getUser();
  if (!user) return;

  const { data: perfil } = await API.perfil.get(user.id);
  if (!perfil) {
    const nome    = user.user_metadata?.nome || 'Usuário';
    const empresa = document.getElementById('obEmpresa')?.value.trim() || 'Minha Empresa';
    await API.perfil.registrarEmpresa(empresa, nome, user.id);
  }

  if (perfil?.empresa_id) {
    await API.empresa.update({
      telefone:    document.getElementById('obTel')?.value    || '',
      cidade:      document.getElementById('obCidade')?.value || '',
      chave_pix:   document.getElementById('obPix')?.value    || '',
      termos_nota: document.getElementById('obTermos')?.value || '',
    });
  }

  UI.hide('onboarding');
  UI.show('loading-screen');
  UI.setLoading('Preparando seu sistema...');
  await carregarUsuario(user);
}
window.obNext        = obNext;
window.finishOnboard = finishOnboard;

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function calcScore(ent, sai) {
  let score = 100;
  if (ent < sai) score -= 30;
  else if (ent > 0 && sai / ent > 0.7) score -= 15;
  score -= Math.min(STATE.os.filter(o => o.status === 'fiado').length * 3, 20);
  score -= Math.min(STATE.produtos.filter(p => p.estoque_atual <= p.estoque_minimo).length * 2, 15);
  return Math.max(0, Math.min(100, score));
}

function renderDashboard() {
  const mes     = new Date().toISOString().slice(0, 7);
  const osMes   = STATE.os.filter(o  => o.criado_em?.startsWith(mes));
  const osP     = osMes.filter(o     => o.status === 'paga');
  const movsMes = STATE.movs.filter(m => m.data?.startsWith(mes));
  const ent     = movsMes.filter(m   => m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0);
  const sai     = movsMes.filter(m   => m.tipo === 'saida').reduce((a, m)   => a + +m.valor, 0);
  const fiados  = STATE.os.filter(o  => o.status === 'fiado').reduce((a, o)  => a + +o.total_final, 0);
  const ticket  = osP.length ? ent / osP.length : 0;
  const baixo   = STATE.produtos.filter(p => p.estoque_atual <= p.estoque_minimo);
  const score   = calcScore(ent, sai);
  const scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';

  const box = document.getElementById('dashContent');
  if (!box) return;

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:11px;font-family:var(--mono);color:var(--muted)">BOM DIA 👋</div>
        <div style="font-size:20px;font-weight:800">${STATE.perfil?.nome?.split(' ')[0] || 'Usuário'}</div>
      </div>
      <div style="text-align:center">
        <div class="score-ring">
          <svg viewBox="0 0 100 100" width="80" height="80">
            <circle class="bg" cx="50" cy="50" r="40"/>
            <circle class="val" cx="50" cy="50" r="40"
              style="stroke:${scoreColor};stroke-dashoffset:${251.2 - (251.2 * score / 100)}"/>
          </svg>
          <div class="score-num" style="color:${scoreColor}">${score}</div>
        </div>
        <div style="font-size:9px;font-family:var(--mono);color:var(--muted)">SAÚDE</div>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card kpi-g"><div class="kpi-ico">💰</div><div class="kpi-val">R$ ${F.money(ent)}</div><div class="kpi-lbl">Entradas mês</div></div>
      <div class="kpi-card kpi-b"><div class="kpi-ico">📋</div><div class="kpi-val">${osMes.length}</div><div class="kpi-lbl">OS este mês</div></div>
      <div class="kpi-card kpi-o"><div class="kpi-ico">🎫</div><div class="kpi-val">R$ ${F.money(ticket)}</div><div class="kpi-lbl">Ticket médio</div></div>
      <div class="kpi-card kpi-r"><div class="kpi-ico">📝</div><div class="kpi-val">R$ ${F.money(fiados)}</div><div class="kpi-lbl">Fiado total</div></div>
    </div>
    ${baixo.length ? `<div style="background:rgba(255,23,68,.08);border:1px solid rgba(255,23,68,.2);border-radius:12px;padding:13px;margin-bottom:14px;font-size:13px;color:var(--red);cursor:pointer" onclick="goP(4)">⚠️ <b>${baixo.length} produto(s)</b> com estoque baixo.</div>` : ''}
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Receita — últimos 7 dias</div></div>
      <div class="chart-wrap"><canvas id="chartDash"></canvas></div>
    </div>
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>OS Recentes</div></div>
      ${STATE.os.slice(0, 5).map(o => `
        <div class="mov-item" style="cursor:pointer" onclick="openOS('${o.id}')">
          <div><div class="mov-desc">${o.cliente_nome}</div><div class="mov-meta">#${o.numero_os} · ${F.date(o.criado_em)}</div></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="sbadge sb-${o.status}">${F.status(o.status)}</span>
            <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">R$ ${F.money(o.total_final)}</span>
          </div>
        </div>`).join('')}
      ${!STATE.os.length ? '<div class="empty"><span class="empty-ico">📋</span><h3>Nenhuma OS ainda</h3></div>' : ''}
    </div>
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Saldo do Mês</div></div>
      <div class="total-hl">
        <div><div class="th-label">ENTRADAS - SAÍDAS</div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--mono)">R$ ${F.money(ent)} - R$ ${F.money(sai)}</div></div>
        <div class="th-val" style="color:${ent - sai >= 0 ? 'var(--green)' : 'var(--red)'}">R$ ${F.money(ent - sai)}</div>
      </div>
    </div>`;

  setTimeout(() => {
    const days = [], vals = [];
    for (let i = 6; i >= 0; i--) {
      const d  = new Date(); d.setDate(d.getDate() - i);
      const dk = d.toISOString().slice(0, 10);
      days.push(d.toLocaleDateString('pt-BR', { weekday: 'short' }));
      vals.push(STATE.movs.filter(m => m.data === dk && m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0));
    }
    const ctx = document.getElementById('chartDash');
    if (!ctx) return;
    if (STATE.charts.dash) STATE.charts.dash.destroy();
    STATE.charts.dash = new Chart(ctx, {
      type: 'bar',
      data: { labels: days, datasets: [{ data: vals, backgroundColor: 'rgba(61,139,255,.5)', borderColor: 'var(--blue)', borderWidth: 2, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7a8db3', font: { size: 10 } } },
                  y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7a8db3', font: { size: 10 }, callback: v => 'R$' + F.money(v) } } } },
    });
  }, 100);
}

// ═══════════════════════════════════════════════════════════
// OS — LISTAGEM
// ═══════════════════════════════════════════════════════════
function setF(f, el) {
  STATE.activeFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  renderOS();
}

const _renderOSDebounced = debounce(renderOS, 300);

function renderOS() {
  const q    = (document.getElementById('searchOS')?.value || '').toLowerCase();
  let   list = STATE.os;
  if (STATE.activeFilter !== 'todas') list = list.filter(o => o.status === STATE.activeFilter);
  if (q) list = list.filter(o =>
    o.cliente_nome?.toLowerCase().includes(q) ||
    o.numero_os?.toLowerCase().includes(q) ||
    (o.descricao || '').toLowerCase().includes(q)
  );

  const box = document.getElementById('osList');
  if (!box) return;

  if (!list.length) {
    box.innerHTML = '<div class="empty"><span class="empty-ico">📋</span><h3>NENHUMA OS</h3><p>Toque em "Nova OS" para emitir</p></div>';
    return;
  }

  box.innerHTML = list.map(o => `
    <div class="os-item os-${o.status}" onclick="openOS('${o.id}')">
      <div class="osi-top">
        <span class="osi-num">#${o.numero_os}</span>
        <span class="sbadge sb-${o.status}">${F.status(o.status)}</span>
      </div>
      <div class="osi-name">${o.cliente_nome}</div>
      <div class="osi-desc">${o.descricao || o.tipo || '—'}</div>
      <div class="osi-meta">
        <span>📅 ${F.date(o.criado_em)}</span>
        <span class="pay-pill pp-${o.forma_pagamento || 'dinheiro'}">${F.pagamento(o.forma_pagamento)}</span>
        <span style="color:var(--green);font-family:var(--mono);font-size:12px;font-weight:700">R$ ${F.money(o.total_final)}</span>
        ${o.fotos?.length  ? `<span>📷${o.fotos.length}</span>` : ''}
        ${o.tem_carne      ? `<span style="color:var(--purple)">📜</span>` : ''}
        ${o.prioridade >= 2 ? `<span style="color:var(--red)">🔴 URGENTE</span>` : o.prioridade === 1 ? `<span style="color:var(--orange)">🟠 ALTA</span>` : ''}
      </div>
    </div>`).join('');
}
window.setF     = setF;
window.renderOS = renderOS;

// ═══════════════════════════════════════════════════════════
// OS — NOVA
// ═══════════════════════════════════════════════════════════
function initNovaOS() {
  STATE.newItems   = [];
  STATE.newPhotos  = [];
  STATE.currentPay = 'dinheiro';
  STATE.carneConfig = { n: 3, dia: 10, entrada: 0 };

  UI.setVal('nDate', new Date().toISOString().slice(0, 16));
  loadTermsPreview();
  renderItemsRows();
  renderPhotoGrid();

  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  ['nName','nPhone','nDoc','nDesc','nPaid','nTroco','nDesc2'].forEach(id => UI.setVal(id, ''));
  UI.setVal('nStatus', 'paga');

  document.getElementById('fiadoWarn').style.display = 'none';
  document.getElementById('carneWarn').style.display = 'none';
  document.getElementById('iaSugestaoCard').style.display = 'none';

  const chipDinheiro = document.querySelector('.pchip');
  if (chipDinheiro) chipDinheiro.classList.add('on-dinheiro');
}
window.initNovaOS = initNovaOS;

function setPay(p, el) {
  STATE.currentPay = p;
  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  el.classList.add('on-' + p);
  UI.setVal('nPay', p);
  document.getElementById('fiadoWarn').style.display = p === 'fiado' ? 'block' : 'none';
  document.getElementById('carneWarn').style.display = p === 'carne' ? 'block' : 'none';
  if (p === 'fiado') { UI.setVal('nStatus', 'fiado'); UI.setVal('nPaid', '0'); }
  if (p === 'carne') { UI.setVal('nStatus', 'aberta'); calcCarnePreview(); }
}
window.setPay = setPay;

function calcTroco() {
  const paid  = parseFloat(UI.val('nPaid'))  || 0;
  const desc  = parseFloat(UI.val('nDesc2')) || 0;
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0) - desc;
  UI.setVal('nTroco', paid - total > 0 ? (paid - total).toFixed(2) : '0.00');
}
window.calcTroco = calcTroco;

function addItem() {
  const desc  = document.getElementById('iDesc')?.value.trim();
  const qty   = parseFloat(document.getElementById('iQty')?.value)   || 1;
  const price = parseFloat(document.getElementById('iPrice')?.value) || 0;
  if (!desc) { UI.toast('⚠ Descreva o item', true); return; }
  STATE.newItems.push({ desc, qty, price });
  UI.setVal('iDesc', ''); UI.setVal('iQty', '1'); UI.setVal('iPrice', '');
  renderItemsRows();
  if (STATE.currentPay === 'carne') calcCarnePreview();
}
window.addItem = addItem;

function rmItem(i) {
  STATE.newItems.splice(i, 1);
  renderItemsRows();
  if (STATE.currentPay === 'carne') calcCarnePreview();
}
window.rmItem = rmItem;

function renderItemsRows() {
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0);
  const box   = document.getElementById('itemsRows');
  if (!box) return;
  box.innerHTML = STATE.newItems.length
    ? STATE.newItems.map((it, i) => `
        <div class="it-row">
          <span class="it-name">${it.desc}</span>
          <span class="it-qty">x${it.qty}</span>
          <span class="it-price">R$ ${F.money(it.qty * it.price)}</span>
          <button class="it-del" onclick="rmItem(${i})">✕</button>
        </div>`).join('')
    : '<div style="font-size:12px;color:var(--muted2);padding:8px 4px;font-family:var(--mono)">Nenhum item adicionado</div>';
  const el = document.getElementById('itemsTotal');
  if (el) el.textContent = 'R$ ' + F.money(total);
  calcTroco();
}

function addFromStock() {
  const prods = STATE.produtos.filter(p => p.estoque_atual > 0);
  if (!prods.length) { UI.toast('⚠ Nenhum produto em estoque', true); return; }
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">📦 Selecionar do Estoque</h3>
    ${prods.map(p => `
      <div class="os-item" onclick="addStockItem('${p.id}');UI.closeModal()">
        <div style="display:flex;justify-content:space-between">
          <div><div class="osi-name">${p.nome}</div><div class="osi-desc">${p.categoria || ''}</div></div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--green)">R$ ${F.money(p.preco_venda)}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">${p.estoque_atual} em estoque</div>
          </div>
        </div>
      </div>`).join('')}`);
}
window.addFromStock = addFromStock;

function addStockItem(id) {
  const p = STATE.produtos.find(x => x.id === id);
  if (!p) return;
  STATE.newItems.push({ desc: p.nome, qty: 1, price: p.preco_venda, prodId: id, custo: p.preco_custo });
  renderItemsRows();
  if (STATE.currentPay === 'carne') calcCarnePreview();
}
window.addStockItem = addStockItem;

function calcCarnePreview() {
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0);
  const n     = parseInt(document.getElementById('carneN')?.value)   || 3;
  const dia   = parseInt(document.getElementById('carneDia')?.value) || 10;
  const ent   = parseFloat(document.getElementById('carneEnt')?.value) || 0;
  const parc  = (total - ent) / n;
  const prev  = document.getElementById('carnePreview');
  if (!prev) return;
  const hoje  = new Date();
  let html    = ent > 0 ? `Entrada: <b>R$ ${F.money(ent)}</b><br>` : '';
  for (let i = 1; i <= Math.min(n, 5); i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, dia);
    html += `Parc ${i}/${n}: <b>R$ ${F.money(parc)}</b> — ${d.toLocaleDateString('pt-BR')}<br>`;
  }
  if (n > 5) html += `...+${n - 5} parcelas`;
  prev.innerHTML = html;
  STATE.carneConfig = { n, dia, entrada: ent };
}
window.calcCarnePreview = calcCarnePreview;

function handlePhotos(e) {
  Array.from(e.target.files).forEach(f => {
    if (f.size > 500_000) { UI.toast('⚠ Foto máx 500KB', true); return; }
    const r = new FileReader();
    r.onload = ev => { STATE.newPhotos.push(ev.target.result); renderPhotoGrid(); };
    r.readAsDataURL(f);
  });
  e.target.value = '';
}
window.handlePhotos = handlePhotos;

function rmPhoto(i) { STATE.newPhotos.splice(i, 1); renderPhotoGrid(); }
window.rmPhoto = rmPhoto;

function renderPhotoGrid() {
  const g = document.getElementById('photoGrid');
  if (!g) return;
  g.innerHTML = STATE.newPhotos.map((f, i) => `
    <div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--b1)">
      <img src="${f}" style="width:100%;height:100%;object-fit:cover">
      <button onclick="rmPhoto(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer">✕</button>
    </div>`).join('');
}
// ═══════════════════════════════════════════════════════════
// NEXOS v2.0 — APP.JS  (Parte 1/2)
// ═══════════════════════════════════════════════════════════

window.STATE = {
  user:            null,
  empresa:         null,
  perfil:          null,
  plano:           null,
  os:              [],
  movs:            [],
  produtos:        [],
  clientes:        [],
  notifs:          [],
  newItems:        [],
  newPhotos:       [],
  currentPay:      'dinheiro',
  activeFilter:    'todas',
  currentOsId:     null,
  currentCompId:   null,
  carneConfig:     { n: 3, dia: 10, entrada: 0 },
  sigDrawing:      false,
  slx: 0, sly:     0,
  charts:          {},
  theme:           'dark',
  _masterEmpresas: [],
};

// ── UI helpers ──
const UI = {
  show:   (id)      => document.getElementById(id)?.classList.remove('gone'),
  hide:   (id)      => document.getElementById(id)?.classList.add('gone'),
  val:    (id)      => document.getElementById(id)?.value ?? '',
  set:    (id, v)   => { const el = document.getElementById(id); if (el) el.textContent = v; },
  setVal: (id, v)   => { const el = document.getElementById(id); if (el) el.value = v; },
  setLoading: (msg) => { const el = document.getElementById('loading-text'); if (el) el.textContent = msg; },

  toast: (() => {
    let timer;
    return (msg, isErr = false, persist = false) => {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent    = msg;
      t.style.background = isErr ? 'var(--red)' : persist ? 'var(--orange)' : 'var(--green)';
      t.style.color    = isErr ? '#fff' : '#000';
      t.classList.add('show');
      clearTimeout(timer);
      if (!persist) timer = setTimeout(() => t.classList.remove('show'), 2800);
    };
  })(),

  closeModal: () => document.getElementById('mwrap')?.classList.remove('open'),

  openModal: (html) => {
    const b = document.getElementById('mbody');
    if (b) b.innerHTML = html;
    document.getElementById('mwrap')?.classList.add('open');
  },

  closeMenus: () => {
    document.getElementById('notifPanel')?.classList.remove('open');
    document.getElementById('userMenu')?.classList.remove('open');
  },
};
window.UI = UI;

// ── Formatters ──
const F = {
  money:    (n)   => (Math.round((n ?? 0) * 100) / 100).toFixed(2).replace('.', ','),
  date:     (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—',
  datetime: (iso) => iso ? new Date(iso).toLocaleString('pt-BR',     { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—',
  time:     (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR',  { hour:'2-digit', minute:'2-digit' }) : '—',
  today:    ()    => new Date().toISOString().slice(0, 10),
  isVencido:(d)   => d && new Date(d + 'T12:00:00') < new Date(),

  status: (s) => ({
    paga:'✅ Paga', aberta:'🔵 Em Aberto', em_andamento:'🔧 Em Andamento',
    pronta:'🟢 Pronta', fiado:'🟡 Fiado', cancelada:'❌ Cancelada',
  })[s] ?? s,

  pagamento: (p) => ({
    dinheiro:'💵 Dinheiro', pix:'📱 PIX', credito:'💳 Crédito',
    debito:'💳 Débito', fiado:'📝 Fiado', carne:'📜 Carnê', transferencia:'🏦 Transferência',
  })[p] ?? (p || '—'),

  statusColor: (s) => ({
    paga:'#00c864', aberta:'#ff6d00', em_andamento:'#ff6d00',
    pronta:'#00e5ff', fiado:'#ffd600', cancelada:'#b2102f',
  })[s] ?? '#3d8bff',

  statusStyle: (s) => ({
    paga:         'border-color:var(--green);color:var(--green);background:rgba(0,230,118,.1)',
    aberta:       'border-color:var(--orange);color:var(--orange);background:rgba(255,109,0,.1)',
    em_andamento: 'border-color:var(--orange);color:var(--orange);background:rgba(255,109,0,.1)',
    pronta:       'border-color:var(--cyan);color:var(--cyan);background:rgba(0,229,255,.1)',
    fiado:        'border-color:var(--yellow);color:var(--yellow);background:rgba(255,214,0,.1)',
    cancelada:    'border-color:var(--red);color:var(--red);background:rgba(255,23,68,.1)',
  })[s] ?? '',
};
window.F = F;

// ── Helpers ──
const safeJSON = (v, fb = []) => {
  if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return v;
  try { return JSON.parse(v || '[]'); } catch { return fb; }
};

async function genHash(s) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2,'0')).join('').slice(0,32).toUpperCase();
  } catch { return Date.now().toString(36).toUpperCase(); }
}

function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Persistência de página ──
function saveActivePage(i) { localStorage.setItem('nexos_page', i); }
function getActivePage()   { return parseInt(localStorage.getItem('nexos_page') || '0'); }

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const theme = localStorage.getItem('nexos_theme') || 'dark';
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    STATE.theme = 'light';
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = '☀️';
  }

  UI.setLoading('Verificando sessão...');
  const { data: { session } } = await API.auth.getSession();
  if (session) {
    UI.setLoading('Carregando dados...');
    await carregarUsuario(session.user);
  } else {
    Auth.showScreen();
  }

  API.auth.onChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      UI.show('loading-screen');
      UI.setLoading('Carregando...');
      await carregarUsuario(session.user);
    } else if (event === 'SIGNED_OUT') {
      Object.assign(STATE, { user: null, empresa: null, perfil: null });
      localStorage.removeItem('nexos_page');
      Auth.showScreen();
    }
  });

  initSig();
  initEventListeners();
});

// ═══════════════════════════════════════════════════════════
// CARREGAR USUÁRIO
// ═══════════════════════════════════════════════════════════
async function carregarUsuario(user) {
  STATE.user = user;
  UI.setLoading('Carregando perfil...');

  const { data: perfil } = await API.perfil.get(user.id);

  if (!perfil) {
    UI.hide('loading-screen');
    UI.hide('auth-screen');
    UI.show('onboarding');
    const obEmp = document.getElementById('obEmpresa');
    if (obEmp) obEmp.value = user.user_metadata?.empresa_nome || '';
    return;
  }

  STATE.perfil  = perfil;
  STATE.empresa = perfil.empresas;
  STATE.plano   = perfil.empresas?.planos;

  await API.perfil.updateAcesso(user.id);
  UI.setLoading('Sincronizando dados...');

  await Promise.all([loadOS(), loadMovs(), loadProdutos(), loadClientes(), loadNotifs()]);

  UI.hide('loading-screen');
  UI.hide('auth-screen');
  UI.hide('onboarding');
  initUI();
  initRealtime();
}

// ═══════════════════════════════════════════════════════════
// INIT UI — restaura última página
// ═══════════════════════════════════════════════════════════
function initUI() {
  const { perfil: p, empresa: e, plano: pl } = STATE;
  UI.set('userName',    p.nome?.split(' ')[0] || '—');
  UI.set('userCargo',   p.cargo || '—');
  UI.set('headerStore', e?.nome || '');
  UI.set('umNome',      p.nome || '—');
  UI.set('umEmail',     p.email || '—');
  UI.set('configEmail', STATE.user?.email || '—');
  UI.set('configPlano', pl?.nome || 'Gratuito');
  UI.set('configVence', e?.plano_vence_em ? F.date(e.plano_vence_em) : '—');

  const av = document.getElementById('userAvatar');
  if (av) av.textContent = (p.nome || '?')[0].toUpperCase();

  const umPlano = document.getElementById('umPlano');
  if (umPlano) umPlano.innerHTML = `<span class="sbadge sb-paga">${pl?.nome || 'Gratuito'}</span>`;

  if (p.cargo === 'master') {
    const n8 = document.getElementById('n8');
    if (n8) n8.style.display = 'flex';
  }

  document.getElementById('dashSkeleton').style.display = 'none';
  document.getElementById('dashContent').style.display  = 'block';

  // ── Restaura última página ativa ──
  const lastPage = getActivePage();
  if (lastPage > 0) {
    goP(lastPage);
  } else {
    renderDashboard();
    initNovaOS();
    loadConfig();
    checkNotifs();
  }
}

// ═══════════════════════════════════════════════════════════
// DATA LOADERS
// ═══════════════════════════════════════════════════════════
async function loadOS()       { const { data } = await API.os.listar();       STATE.os       = data ?? []; }
async function loadMovs()     { const { data } = await API.caixa.listar();    STATE.movs     = data ?? []; }
async function loadProdutos() { const { data } = await API.produtos.listar(); STATE.produtos = data ?? []; }
async function loadClientes() { const { data } = await API.clientes.listar(); STATE.clientes = data ?? []; }
async function loadNotifs()   { const { data } = await API.notifs.listar();   STATE.notifs   = data ?? []; checkNotifs(); }

// ═══════════════════════════════════════════════════════════
// REALTIME
// ═══════════════════════════════════════════════════════════
function initRealtime() {
  if (!STATE.empresa?.id) return;
  API.realtime.iniciar(STATE.empresa.id, STATE.user.id, {
    onOS:    async () => { await loadOS();   renderOS(); renderDashboard(); },
    onCaixa: async () => { await loadMovs(); renderCaixa(); },
    onNotif: async () => { await loadNotifs(); },
  });
}

// ═══════════════════════════════════════════════════════════
// NAVEGAÇÃO — salva página no localStorage
// ═══════════════════════════════════════════════════════════
function goP(i) {
  saveActivePage(i);
  document.querySelectorAll('.page').forEach((p, j) => p.classList.toggle('on', i === j));
  document.querySelectorAll('.ni').forEach((n, j)   => n.classList.toggle('on', i === j));
  UI.closeMenus();
  const actions = {
    0: () => renderDashboard(),
    1: () => renderOS(),
    2: () => initNovaOS(),
    3: () => { UI.setVal('caixaDate', F.today()); renderCaixa(); iaFluxoCaixa(); },
    4: () => { renderEstoque(); iaSugerirEstoque(); },
    5: () => renderClientes(),
    6: () => { setMesAtual(); renderAnalytics(); },
    7: () => loadConfig(),
    8: () => renderMaster(),
  };
  actions[i]?.();
}
window.goP = goP;

// ═══════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════
let _obStep = 0;
function obNext(s) {
  if (s === 1 && !document.getElementById('obEmpresa')?.value.trim()) {
    UI.toast('⚠ Nome da empresa obrigatório', true); return;
  }
  _obStep = s;
  document.querySelectorAll('.onboard-step').forEach((el, i) => el.classList.toggle('on', i === s));
  document.querySelectorAll('.op-dot').forEach((el, i)        => el.classList.toggle('done', i <= s));
}

async function finishOnboard() {
  const { data: { user } } = await API.auth.getUser();
  if (!user) return;

  const { data: perfil } = await API.perfil.get(user.id);
  if (!perfil) {
    const nome    = user.user_metadata?.nome || 'Usuário';
    const empresa = document.getElementById('obEmpresa')?.value.trim() || 'Minha Empresa';
    await API.perfil.registrarEmpresa(empresa, nome, user.id);
  }

  if (perfil?.empresa_id) {
    await API.empresa.update({
      telefone:    document.getElementById('obTel')?.value    || '',
      cidade:      document.getElementById('obCidade')?.value || '',
      chave_pix:   document.getElementById('obPix')?.value    || '',
      termos_nota: document.getElementById('obTermos')?.value || '',
    });
  }

  UI.hide('onboarding');
  UI.show('loading-screen');
  UI.setLoading('Preparando seu sistema...');
  await carregarUsuario(user);
}
window.obNext        = obNext;
window.finishOnboard = finishOnboard;

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function calcScore(ent, sai) {
  let score = 100;
  if (ent < sai) score -= 30;
  else if (ent > 0 && sai / ent > 0.7) score -= 15;
  score -= Math.min(STATE.os.filter(o => o.status === 'fiado').length * 3, 20);
  score -= Math.min(STATE.produtos.filter(p => p.estoque_atual <= p.estoque_minimo).length * 2, 15);
  return Math.max(0, Math.min(100, score));
}

function renderDashboard() {
  const mes     = new Date().toISOString().slice(0, 7);
  const osMes   = STATE.os.filter(o  => o.criado_em?.startsWith(mes));
  const osP     = osMes.filter(o     => o.status === 'paga');
  const movsMes = STATE.movs.filter(m => m.data?.startsWith(mes));
  const ent     = movsMes.filter(m   => m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0);
  const sai     = movsMes.filter(m   => m.tipo === 'saida').reduce((a, m)   => a + +m.valor, 0);
  const fiados  = STATE.os.filter(o  => o.status === 'fiado').reduce((a, o)  => a + +o.total_final, 0);
  const ticket  = osP.length ? ent / osP.length : 0;
  const baixo   = STATE.produtos.filter(p => p.estoque_atual <= p.estoque_minimo);
  const score   = calcScore(ent, sai);
  const scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';

  const box = document.getElementById('dashContent');
  if (!box) return;

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:11px;font-family:var(--mono);color:var(--muted)">BOM DIA 👋</div>
        <div style="font-size:20px;font-weight:800">${STATE.perfil?.nome?.split(' ')[0] || 'Usuário'}</div>
      </div>
      <div style="text-align:center">
        <div class="score-ring">
          <svg viewBox="0 0 100 100" width="80" height="80">
            <circle class="bg" cx="50" cy="50" r="40"/>
            <circle class="val" cx="50" cy="50" r="40"
              style="stroke:${scoreColor};stroke-dashoffset:${251.2 - (251.2 * score / 100)}"/>
          </svg>
          <div class="score-num" style="color:${scoreColor}">${score}</div>
        </div>
        <div style="font-size:9px;font-family:var(--mono);color:var(--muted)">SAÚDE</div>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card kpi-g"><div class="kpi-ico">💰</div><div class="kpi-val">R$ ${F.money(ent)}</div><div class="kpi-lbl">Entradas mês</div></div>
      <div class="kpi-card kpi-b"><div class="kpi-ico">📋</div><div class="kpi-val">${osMes.length}</div><div class="kpi-lbl">OS este mês</div></div>
      <div class="kpi-card kpi-o"><div class="kpi-ico">🎫</div><div class="kpi-val">R$ ${F.money(ticket)}</div><div class="kpi-lbl">Ticket médio</div></div>
      <div class="kpi-card kpi-r"><div class="kpi-ico">📝</div><div class="kpi-val">R$ ${F.money(fiados)}</div><div class="kpi-lbl">Fiado total</div></div>
    </div>
    ${baixo.length ? `<div style="background:rgba(255,23,68,.08);border:1px solid rgba(255,23,68,.2);border-radius:12px;padding:13px;margin-bottom:14px;font-size:13px;color:var(--red);cursor:pointer" onclick="goP(4)">⚠️ <b>${baixo.length} produto(s)</b> com estoque baixo.</div>` : ''}
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Receita — últimos 7 dias</div></div>
      <div class="chart-wrap"><canvas id="chartDash"></canvas></div>
    </div>
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>OS Recentes</div></div>
      ${STATE.os.slice(0, 5).map(o => `
        <div class="mov-item" style="cursor:pointer" onclick="openOS('${o.id}')">
          <div><div class="mov-desc">${o.cliente_nome}</div><div class="mov-meta">#${o.numero_os} · ${F.date(o.criado_em)}</div></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="sbadge sb-${o.status}">${F.status(o.status)}</span>
            <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">R$ ${F.money(o.total_final)}</span>
          </div>
        </div>`).join('')}
      ${!STATE.os.length ? '<div class="empty"><span class="empty-ico">📋</span><h3>Nenhuma OS ainda</h3></div>' : ''}
    </div>
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Saldo do Mês</div></div>
      <div class="total-hl">
        <div><div class="th-label">ENTRADAS - SAÍDAS</div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--mono)">R$ ${F.money(ent)} - R$ ${F.money(sai)}</div></div>
        <div class="th-val" style="color:${ent - sai >= 0 ? 'var(--green)' : 'var(--red)'}">R$ ${F.money(ent - sai)}</div>
      </div>
    </div>`;

  setTimeout(() => {
    const days = [], vals = [];
    for (let i = 6; i >= 0; i--) {
      const d  = new Date(); d.setDate(d.getDate() - i);
      const dk = d.toISOString().slice(0, 10);
      days.push(d.toLocaleDateString('pt-BR', { weekday: 'short' }));
      vals.push(STATE.movs.filter(m => m.data === dk && m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0));
    }
    const ctx = document.getElementById('chartDash');
    if (!ctx) return;
    if (STATE.charts.dash) STATE.charts.dash.destroy();
    STATE.charts.dash = new Chart(ctx, {
      type: 'bar',
      data: { labels: days, datasets: [{ data: vals, backgroundColor: 'rgba(61,139,255,.5)', borderColor: 'var(--blue)', borderWidth: 2, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7a8db3', font: { size: 10 } } },
                  y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7a8db3', font: { size: 10 }, callback: v => 'R$' + F.money(v) } } } },
    });
  }, 100);
}

// ═══════════════════════════════════════════════════════════
// OS — LISTAGEM
// ═══════════════════════════════════════════════════════════
function setF(f, el) {
  STATE.activeFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  renderOS();
}

const _renderOSDebounced = debounce(renderOS, 300);

function renderOS() {
  const q    = (document.getElementById('searchOS')?.value || '').toLowerCase();
  let   list = STATE.os;
  if (STATE.activeFilter !== 'todas') list = list.filter(o => o.status === STATE.activeFilter);
  if (q) list = list.filter(o =>
    o.cliente_nome?.toLowerCase().includes(q) ||
    o.numero_os?.toLowerCase().includes(q) ||
    (o.descricao || '').toLowerCase().includes(q)
  );

  const box = document.getElementById('osList');
  if (!box) return;

  if (!list.length) {
    box.innerHTML = '<div class="empty"><span class="empty-ico">📋</span><h3>NENHUMA OS</h3><p>Toque em "Nova OS" para emitir</p></div>';
    return;
  }

  box.innerHTML = list.map(o => `
    <div class="os-item os-${o.status}" onclick="openOS('${o.id}')">
      <div class="osi-top">
        <span class="osi-num">#${o.numero_os}</span>
        <span class="sbadge sb-${o.status}">${F.status(o.status)}</span>
      </div>
      <div class="osi-name">${o.cliente_nome}</div>
      <div class="osi-desc">${o.descricao || o.tipo || '—'}</div>
      <div class="osi-meta">
        <span>📅 ${F.date(o.criado_em)}</span>
        <span class="pay-pill pp-${o.forma_pagamento || 'dinheiro'}">${F.pagamento(o.forma_pagamento)}</span>
        <span style="color:var(--green);font-family:var(--mono);font-size:12px;font-weight:700">R$ ${F.money(o.total_final)}</span>
        ${o.fotos?.length  ? `<span>📷${o.fotos.length}</span>` : ''}
        ${o.tem_carne      ? `<span style="color:var(--purple)">📜</span>` : ''}
        ${o.prioridade >= 2 ? `<span style="color:var(--red)">🔴 URGENTE</span>` : o.prioridade === 1 ? `<span style="color:var(--orange)">🟠 ALTA</span>` : ''}
      </div>
    </div>`).join('');
}
window.setF     = setF;
window.renderOS = renderOS;

// ═══════════════════════════════════════════════════════════
// OS — NOVA
// ═══════════════════════════════════════════════════════════
function initNovaOS() {
  STATE.newItems   = [];
  STATE.newPhotos  = [];
  STATE.currentPay = 'dinheiro';
  STATE.carneConfig = { n: 3, dia: 10, entrada: 0 };

  UI.setVal('nDate', new Date().toISOString().slice(0, 16));
  loadTermsPreview();
  renderItemsRows();
  renderPhotoGrid();

  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  ['nName','nPhone','nDoc','nDesc','nPaid','nTroco','nDesc2'].forEach(id => UI.setVal(id, ''));
  UI.setVal('nStatus', 'paga');

  document.getElementById('fiadoWarn').style.display = 'none';
  document.getElementById('carneWarn').style.display = 'none';
  document.getElementById('iaSugestaoCard').style.display = 'none';

  const chipDinheiro = document.querySelector('.pchip');
  if (chipDinheiro) chipDinheiro.classList.add('on-dinheiro');
}
window.initNovaOS = initNovaOS;

function setPay(p, el) {
  STATE.currentPay = p;
  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  el.classList.add('on-' + p);
  UI.setVal('nPay', p);
  document.getElementById('fiadoWarn').style.display = p === 'fiado' ? 'block' : 'none';
  document.getElementById('carneWarn').style.display = p === 'carne' ? 'block' : 'none';
  if (p === 'fiado') { UI.setVal('nStatus', 'fiado'); UI.setVal('nPaid', '0'); }
  if (p === 'carne') { UI.setVal('nStatus', 'aberta'); calcCarnePreview(); }
}
window.setPay = setPay;

function calcTroco() {
  const paid  = parseFloat(UI.val('nPaid'))  || 0;
  const desc  = parseFloat(UI.val('nDesc2')) || 0;
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0) - desc;
  UI.setVal('nTroco', paid - total > 0 ? (paid - total).toFixed(2) : '0.00');
}
window.calcTroco = calcTroco;

function addItem() {
  const desc  = document.getElementById('iDesc')?.value.trim();
  const qty   = parseFloat(document.getElementById('iQty')?.value)   || 1;
  const price = parseFloat(document.getElementById('iPrice')?.value) || 0;
  if (!desc) { UI.toast('⚠ Descreva o item', true); return; }
  STATE.newItems.push({ desc, qty, price });
  UI.setVal('iDesc', ''); UI.setVal('iQty', '1'); UI.setVal('iPrice', '');
  renderItemsRows();
  if (STATE.currentPay === 'carne') calcCarnePreview();
}
window.addItem = addItem;

function rmItem(i) {
  STATE.newItems.splice(i, 1);
  renderItemsRows();
  if (STATE.currentPay === 'carne') calcCarnePreview();
}
window.rmItem = rmItem;

function renderItemsRows() {
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0);
  const box   = document.getElementById('itemsRows');
  if (!box) return;
  box.innerHTML = STATE.newItems.length
    ? STATE.newItems.map((it, i) => `
        <div class="it-row">
          <span class="it-name">${it.desc}</span>
          <span class="it-qty">x${it.qty}</span>
          <span class="it-price">R$ ${F.money(it.qty * it.price)}</span>
          <button class="it-del" onclick="rmItem(${i})">✕</button>
        </div>`).join('')
    : '<div style="font-size:12px;color:var(--muted2);padding:8px 4px;font-family:var(--mono)">Nenhum item adicionado</div>';
  const el = document.getElementById('itemsTotal');
  if (el) el.textContent = 'R$ ' + F.money(total);
  calcTroco();
}

function addFromStock() {
  const prods = STATE.produtos.filter(p => p.estoque_atual > 0);
  if (!prods.length) { UI.toast('⚠ Nenhum produto em estoque', true); return; }
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">📦 Selecionar do Estoque</h3>
    ${prods.map(p => `
      <div class="os-item" onclick="addStockItem('${p.id}');UI.closeModal()">
        <div style="display:flex;justify-content:space-between">
          <div><div class="osi-name">${p.nome}</div><div class="osi-desc">${p.categoria || ''}</div></div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--green)">R$ ${F.money(p.preco_venda)}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">${p.estoque_atual} em estoque</div>
          </div>
        </div>
      </div>`).join('')}`);
}
window.addFromStock = addFromStock;

function addStockItem(id) {
  const p = STATE.produtos.find(x => x.id === id);
  if (!p) return;
  STATE.newItems.push({ desc: p.nome, qty: 1, price: p.preco_venda, prodId: id, custo: p.preco_custo });
  renderItemsRows();
  if (STATE.currentPay === 'carne') calcCarnePreview();
}
window.addStockItem = addStockItem;

function calcCarnePreview() {
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0);
  const n     = parseInt(document.getElementById('carneN')?.value)   || 3;
  const dia   = parseInt(document.getElementById('carneDia')?.value) || 10;
  const ent   = parseFloat(document.getElementById('carneEnt')?.value) || 0;
  const parc  = (total - ent) / n;
  const prev  = document.getElementById('carnePreview');
  if (!prev) return;
  const hoje  = new Date();
  let html    = ent > 0 ? `Entrada: <b>R$ ${F.money(ent)}</b><br>` : '';
  for (let i = 1; i <= Math.min(n, 5); i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, dia);
    html += `Parc ${i}/${n}: <b>R$ ${F.money(parc)}</b> — ${d.toLocaleDateString('pt-BR')}<br>`;
  }
  if (n > 5) html += `...+${n - 5} parcelas`;
  prev.innerHTML = html;
  STATE.carneConfig = { n, dia, entrada: ent };
}
window.calcCarnePreview = calcCarnePreview;

function handlePhotos(e) {
  Array.from(e.target.files).forEach(f => {
    if (f.size > 500_000) { UI.toast('⚠ Foto máx 500KB', true); return; }
    const r = new FileReader();
    r.onload = ev => { STATE.newPhotos.push(ev.target.result); renderPhotoGrid(); };
    r.readAsDataURL(f);
  });
  e.target.value = '';
}
window.handlePhotos = handlePhotos;

function rmPhoto(i) { STATE.newPhotos.splice(i, 1); renderPhotoGrid(); }
window.rmPhoto = rmPhoto;

function renderPhotoGrid() {
  const g = document.getElementById('photoGrid');
  if (!g) return;
  g.innerHTML = STATE.newPhotos.map((f, i) => `
    <div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--b1)">
      <img src="${f}" style="width:100%;height:100%;object-fit:cover">
      <button onclick="rmPhoto(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer">✕</button>
    </div>`).join('');
}
