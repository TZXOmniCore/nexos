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
  await new Promise(r => setTimeout(r, 1700));
const { data: { session } } = await API.auth.getSession();
if (session?.user) {
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
    3: () => { UI.setVal('caixaDate', F.today()); renderCaixa(); },
  4: () => renderEstoque(),
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
// OS — SALVAR
// ═══════════════════════════════════════════════════════════
async function saveOS() {
  const name = document.getElementById('nName')?.value.trim();
  if (!name)                  { UI.toast('⚠ Nome do cliente obrigatório', true); return; }
  if (!STATE.newItems.length) { UI.toast('⚠ Adicione ao menos um item', true);   return; }
  if (!STATE.currentPay)      { UI.toast('⚠ Selecione a forma de pagamento', true); return; }
  if (!STATE.empresa?.id)     { UI.toast('⚠ Empresa não carregada', true);        return; }

  const desc2      = parseFloat(UI.val('nDesc2')) || 0;
  const total      = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0);
  const totalFinal = total - desc2;
  const numOS      = 'OS' + Date.now().toString().slice(-7);
  const hash       = await genHash(numOS + name + totalFinal);
  const sigData    = isEmptySig(document.getElementById('sigC')) ? null : document.getElementById('sigC').toDataURL('image/png');

  let carneData = null;
  if (STATE.currentPay === 'carne') {
    const { n, dia, entrada } = STATE.carneConfig;
    const parc  = (totalFinal - entrada) / n;
    const hoje  = new Date();
    const itens = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, dia);
      itens.push({ num: i, valor: parc, venc: d.toISOString().slice(0, 10), pago: false });
    }
    carneData = { parcelas: n, vencDia: dia, entrada, valorParc: parc, itens };
  }

  const os = {
    empresa_id:         STATE.empresa.id,
    numero_os:          numOS,
    cliente_nome:       name,
    cliente_telefone:   UI.val('nPhone'),
    cliente_doc:        UI.val('nDoc'),
    tecnico_id:         STATE.user.id,
    status:             UI.val('nStatus') || 'paga',
    tipo:               UI.val('nType')   || 'servico',
    descricao:          UI.val('nDesc'),
    itens:              JSON.stringify(STATE.newItems),
    fotos:              JSON.stringify(STATE.newPhotos),
    assinatura_url:     sigData,
    total,
    desconto:           desc2,
    total_final:        totalFinal,
    forma_pagamento:    STATE.currentPay,
    valor_pago:         parseFloat(UI.val('nPaid')) || 0,
    data_entrada:       UI.val('nDate')     ? new Date(UI.val('nDate')).toISOString()     : new Date().toISOString(),
    data_previsao:      UI.val('nPrevisao') ? new Date(UI.val('nPrevisao')).toISOString() : null,
    hash,
    tem_carne:          !!carneData,
    garantia_dias:      parseInt(UI.val('nGarantia')) || 0,
    prioridade:         parseInt(UI.val('nPrio'))     || 0,
  };

  const { data: savedOS, error } = await API.os.inserir(os);
  if (error) { UI.toast('⚠ Erro: ' + error.message, true); return; }

  if (carneData && savedOS) {
    const rows = carneData.itens.map(p => ({
      empresa_id:       STATE.empresa.id,
      ordem_id:         savedOS.id,
      cliente_nome:     name,
      cliente_telefone: UI.val('nPhone'),
      numero:           p.num,
      total_parcelas:   carneData.parcelas,
      valor:            p.valor,
      vencimento:       p.venc,
    }));
    await API.parcelas.inserir(rows);
  }

  const day    = F.today();
  const status = os.status;

  if (status === 'paga') {
    await API.caixa.inserir({ tipo: 'entrada', descricao: `OS #${numOS} — ${name}`, valor: totalFinal, forma_pagamento: STATE.currentPay, ordem_id: savedOS?.id, data: day });
  } else if (status === 'fiado') {
    await API.caixa.inserir({ tipo: 'fiado', descricao: `Fiado — OS #${numOS} — ${name}`, valor: totalFinal, forma_pagamento: 'fiado', ordem_id: savedOS?.id, data: day });
  }

  if (STATE.currentPay === 'carne' && carneData?.entrada > 0) {
    await API.caixa.inserir({ tipo: 'entrada', descricao: `Entrada carnê — OS #${numOS}`, valor: carneData.entrada, forma_pagamento: 'carne', ordem_id: savedOS?.id, data: day });
  }

  await API.os.historico.inserir(savedOS?.id, 'EMITIDA', `OS emitida — ${F.status(status)}`);
  await Promise.all([loadOS(), loadMovs()]);

  initNovaOS(); clearSig();
  goP(1); renderOS();
  UI.toast('✅ OS #' + numOS + ' emitida!');
  setTimeout(() => openComp(savedOS.id), 700);
}
window.saveOS = saveOS;

// ═══════════════════════════════════════════════════════════
// OS — DETALHES
// ═══════════════════════════════════════════════════════════
async function openOS(id) {
  STATE.currentOsId = id;
  const o = STATE.os.find(x => x.id === id);
  if (!o) return;

  const itens = safeJSON(o.itens);
  const fotos = safeJSON(o.fotos);
  const [{ data: hist }, { data: parcs }] = await Promise.all([
    API.os.historico.listar(id),
    API.parcelas.listar(id),
  ]);

  const fotosH = fotos.length ? `
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Fotos (${fotos.length})</div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      ${fotos.map((f, i) => `<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--b1);cursor:pointer" onclick="viewPhoto('${id}',${i})"><img src="${f}" style="width:100%;height:100%;object-fit:cover"></div>`).join('')}
    </div></div>` : '';

  const carneH = parcs?.length ? `
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>📜 Carnê (${parcs.length}x)</div></div>
    ${parcs.map(p => `
      <div class="ir">
        <span class="irl">${p.numero}/${p.total_parcelas} — ${F.date(p.vencimento + 'T12:00:00')}</span>
        <span class="irv" style="display:flex;align-items:center;gap:7px">
          <span style="color:${p.pago ? 'var(--green)' : F.isVencido(p.vencimento) ? 'var(--red)' : 'var(--yellow)'}">R$ ${F.money(p.valor)}</span>
          <span class="sbadge">${p.pago ? '✓ Pago' : F.isVencido(p.vencimento) ? 'Vencido' : 'Pendente'}</span>
          ${!p.pago ? `<button class="btn btn-green btn-sm" style="padding:4px 9px;font-size:10px" onclick="pagarParc('${p.id}','${id}')">Pagar</button>` : ''}
        </span>
      </div>`).join('')}
    </div>` : '';

  const histH = hist?.length ? `
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Histórico</div></div>
    ${hist.map(h => `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">
        <div style="width:7px;height:7px;border-radius:50%;background:var(--blue);margin-top:5px;flex-shrink:0"></div>
        <div><div style="font-family:var(--mono);font-size:10px;color:var(--muted)">${F.datetime(h.criado_em)} · ${h.usuario_nome || 'Sistema'}</div>
        <div style="font-size:13px">${h.descricao || h.acao}</div></div>
      </div>`).join('')}
    <div style="margin-top:10px">
      <input type="text" id="notaInput" placeholder="Adicionar nota..." class="finput" style="margin-bottom:6px">
      <button class="btn btn-ghost btn-sm" onclick="addNota()">📝 Registrar nota</button>
    </div></div>` : '';

  UI.openModal(`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <div><div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:2px">NOTA / OS</div>
      <div style="font-family:var(--mono);font-size:36px;font-weight:700;color:var(--blue);line-height:1">#${o.numero_os}</div></div>
      <span class="sbadge sb-${o.status}" style="margin-top:8px">${F.status(o.status)}</span>
    </div>
    <div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-bottom:14px">${F.datetime(o.criado_em)} · <span class="pay-pill pp-${o.forma_pagamento || 'dinheiro'}">${F.pagamento(o.forma_pagamento)}</span></div>
    <div class="total-hl">
      <div><div class="th-label">TOTAL FINAL</div>${o.desconto > 0 ? `<div style="font-family:var(--mono);font-size:11px;color:var(--muted)">Desc: R$ ${F.money(o.desconto)}</div>` : ''}</div>
      <div class="th-val">R$ ${F.money(o.total_final)}</div>
    </div>
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Cliente</div></div>
      <div class="ir"><span class="irl">Nome</span><span class="irv">${o.cliente_nome}</span></div>
      ${o.cliente_telefone ? `<div class="ir"><span class="irl">Telefone</span><span class="irv">${o.cliente_telefone}</span></div>` : ''}
      ${o.cliente_doc      ? `<div class="ir"><span class="irl">CPF/Doc</span><span class="irv">${o.cliente_doc}</span></div>`      : ''}
    </div>
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Itens (${itens.length})</div></div>
      ${itens.map(it => `<div class="it-row"><span class="it-name">${it.desc}</span><span class="it-qty">x${it.qty}</span><span class="it-price">R$ ${F.money(it.qty * it.price)}</span><span></span></div>`).join('')}
      <div class="it-total-row"><span class="it-total-label">TOTAL</span><span class="it-total-val">R$ ${F.money(o.total_final)}</span></div>
    </div>
    ${o.descricao ? `<div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Descrição</div></div><p style="font-size:14px;line-height:1.7">${o.descricao}</p></div>` : ''}
    ${fotosH}${carneH}
    ${o.assinatura_url ? `<div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Assinatura</div></div><div style="background:var(--bg);border:1px solid var(--b1);border-radius:8px;padding:10px;text-align:center"><img src="${o.assinatura_url}" style="max-width:100%;max-height:80px;object-fit:contain"></div></div>` : ''}
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Alterar Status</div></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px">
        ${['paga','aberta','em_andamento','pronta','fiado','cancelada'].map(s => `<div onclick="setStatus('${s}')" style="padding:8px 12px;border-radius:8px;font-size:11px;font-family:var(--mono);cursor:pointer;border:1.5px solid var(--b2);color:var(--muted);transition:.2s;${o.status === s ? F.statusStyle(s) : ''}">${F.status(s)}</div>`).join('')}
      </div>
      ${o.status === 'fiado' ? `<button class="btn btn-green btn-sm" onclick="marcarPago()">✅ Marcar como PAGO</button>` : ''}
    </div>
    ${histH}
    <div class="brow">
      <button class="btn btn-blue"  onclick="openComp('${o.id}');UI.closeModal()">🧾 Comprovante</button>
      <button class="btn btn-green" onclick="sendWA('${o.id}')">💬 WhatsApp</button>
    </div>
    <div class="brow">
      <button class="btn btn-ghost" onclick="genPDF('${o.id}')">📄 PDF</button>
      <button class="btn btn-red btn-sm" style="flex:.4" onclick="delOS('${o.id}')">🗑️</button>
    </div>`);
}
window.openOS = openOS;

async function pagarParc(parcId, osId) {
  await API.parcelas.pagar(parcId);
  const o    = STATE.os.find(x => x.id === osId);
  const { data: parcs } = await API.parcelas.listar(osId);
  const parc = parcs?.find(p => p.id === parcId);
  await API.caixa.inserir({ tipo: 'entrada', descricao: `Carnê #${o?.numero_os} — Parc ${parc?.numero}/${parc?.total_parcelas} — ${o?.cliente_nome}`, valor: parc?.valor, forma_pagamento: 'carne', ordem_id: osId, data: F.today() });
  const todasPagas = parcs?.every(p => p.id === parcId ? true : p.pago);
  if (todasPagas) await API.os.atualizar(osId, { status: 'paga' });
  await API.os.historico.inserir(osId, 'PARCELA_PAGA', `Parcela ${parc?.numero}/${parc?.total_parcelas} paga — R$ ${F.money(parc?.valor)}`);
  await Promise.all([loadOS(), loadMovs()]);
  openOS(osId);
  UI.toast(`✅ Parcela ${parc?.numero} paga!`);
}
window.pagarParc = pagarParc;

async function setStatus(s) {
  const { error } = await API.os.atualizar(STATE.currentOsId, { status: s });
  if (error) { UI.toast('⚠ Erro ao alterar status', true); return; }
  await API.os.historico.inserir(STATE.currentOsId, 'STATUS', 'Status → ' + F.status(s));
  await loadOS();
  openOS(STATE.currentOsId);
  renderOS();
  UI.toast('✅ Status: ' + F.status(s));
}
window.setStatus = setStatus;

async function marcarPago() {
  const o = STATE.os.find(x => x.id === STATE.currentOsId);
  if (!o) return;
  await API.os.atualizar(STATE.currentOsId, { status: 'paga' });
  await API.caixa.inserir({ tipo: 'entrada', descricao: `Fiado quitado — OS #${o.numero_os} — ${o.cliente_nome}`, valor: o.total_final, forma_pagamento: 'dinheiro', ordem_id: o.id, data: F.today() });
  await API.os.historico.inserir(o.id, 'FIADO_QUITADO', 'Fiado quitado — pago em dinheiro');
  await Promise.all([loadOS(), loadMovs()]);
  openOS(STATE.currentOsId);
  renderOS();
  UI.toast('✅ Fiado quitado!');
}
window.marcarPago = marcarPago;

async function addNota() {
  const txt = document.getElementById('notaInput')?.value.trim();
  if (!txt) { UI.toast('⚠ Digite uma nota', true); return; }
  await API.os.historico.inserir(STATE.currentOsId, 'NOTA', txt);
  openOS(STATE.currentOsId);
  UI.toast('📝 Nota registrada!');
}
window.addNota = addNota;

async function delOS(id) {
  if (!confirm('Excluir esta OS?')) return;
  await API.os.deletar(id);
  await loadOS();
  UI.closeModal();
  renderOS();
  UI.toast('🗑️ OS excluída');
}
window.delOS = delOS;

// ═══════════════════════════════════════════════════════════
// CAIXA
// ═══════════════════════════════════════════════════════════
function renderCaixa() {
  const day    = document.getElementById('caixaDate')?.value || F.today();
  const movDia = STATE.movs.filter(m => m.data === day);
  const ent    = movDia.filter(m => m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0);
  const sai    = movDia.filter(m => m.tipo === 'saida').reduce((a, m)   => a + +m.valor, 0);
  const fiad   = movDia.filter(m => m.tipo === 'fiado').reduce((a, m)   => a + +m.valor, 0);

  document.getElementById('cxCards').innerHTML = `
    <div class="cx-card entrada"><div class="cx-num">R$ ${F.money(ent)}</div><div class="cx-label">Entradas</div></div>
    <div class="cx-card saida"><div class="cx-num">R$ ${F.money(sai)}</div><div class="cx-label">Saídas</div></div>
    <div class="cx-card saldo"><div class="cx-num" style="color:${ent - sai >= 0 ? 'var(--green)' : 'var(--red)'}">R$ ${F.money(ent - sai)}</div><div class="cx-label">Saldo</div></div>
    <div class="cx-card fiado"><div class="cx-num">R$ ${F.money(fiad)}</div><div class="cx-label">Fiado</div></div>`;

  const pays = {};
  movDia.filter(m => m.tipo === 'entrada').forEach(m => {
    pays[m.forma_pagamento] = (pays[m.forma_pagamento] || 0) + +m.valor;
  });
  document.getElementById('payBreak').innerHTML = Object.keys(pays).length
    ? Object.entries(pays).map(([k, v]) => `<div class="mov-item"><span class="pay-pill pp-${k}">${F.pagamento(k)}</span><span class="mov-val e">R$ ${F.money(v)}</span></div>`).join('')
    : '<p style="font-size:12px;color:var(--muted2);font-family:var(--mono)">Sem entradas hoje</p>';

  const all = [...movDia].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  document.getElementById('movList').innerHTML = all.length
    ? all.map(m => `
        <div class="mov-item">
          <div><div class="mov-desc">${m.descricao}</div>
          <div class="mov-meta">${F.time(m.criado_em)} ${m.forma_pagamento ? '· ' + F.pagamento(m.forma_pagamento) : ''} ${m.categoria ? '· ' + m.categoria : ''}</div></div>
          <span class="mov-val ${m.tipo === 'saida' ? 's' : 'e'}">${m.tipo === 'saida' ? '-' : '+'} R$ ${F.money(m.valor)}</span>
        </div>`).join('')
    : '<p style="font-size:12px;color:var(--muted2);font-family:var(--mono)">Sem movimentações</p>';
}
window.renderCaixa = renderCaixa;

async function addSaida() {
  const desc = document.getElementById('saidaDesc')?.value.trim();
  const val  = parseFloat(document.getElementById('saidaVal')?.value)  || 0;
  const cat  = document.getElementById('saidaCat')?.value || 'Outros';
  if (!desc)  { UI.toast('⚠ Descreva a saída', true); return; }
  if (val <= 0) { UI.toast('⚠ Valor inválido', true);  return; }
  const day = document.getElementById('caixaDate')?.value || F.today();
  await API.caixa.inserir({ tipo: 'saida', descricao: desc, valor: val, categoria: cat, data: day });
  UI.setVal('saidaDesc', ''); UI.setVal('saidaVal', '');
  await loadMovs();
  renderCaixa();
  UI.toast('➖ Saída registrada');
}
window.addSaida = addSaida;

// ═══════════════════════════════════════════════════════════
// ESTOQUE
// ═══════════════════════════════════════════════════════════
function renderEstoque() {
  const q    = (document.getElementById('searchEstoque')?.value || '').toLowerCase();
  let   list = STATE.produtos.filter(p => p.ativo !== false);
  if (q) list = list.filter(p => p.nome.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q));
  const box = document.getElementById('estoqueList');
  if (!box) return;
  if (!list.length) { box.innerHTML = '<div class="empty"><span class="empty-ico">📦</span><h3>SEM PRODUTOS</h3><p>Adicione produtos ao estoque</p></div>'; return; }
  box.innerHTML = list.map(p => `
    <div class="os-item" onclick="openProduto('${p.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <div><div class="osi-name">${p.nome}</div><div class="osi-desc">${p.categoria || ''} ${p.marca ? '· ' + p.marca : ''}</div></div>
        <div style="text-align:right">
          <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--green)">R$ ${F.money(p.preco_venda)}</div>
          ${p.preco_custo > 0 ? `<div style="font-family:var(--mono);font-size:10px;color:var(--blue)">Margem: ${((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0)}%</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <span style="font-size:11px;font-family:var(--mono);color:${p.estoque_atual <= p.estoque_minimo ? 'var(--red)' : 'var(--muted)'}">
          📦 ${p.estoque_atual} ${p.unidade || 'un'} ${p.estoque_atual <= p.estoque_minimo ? '⚠' : ''}
        </span>
      </div>
    </div>`).join('');
}
window.renderEstoque = renderEstoque;

function openNovoProduto() {
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">📦 Novo Produto</h3>
    <label class="flabel req">Nome</label><input type="text" id="pNome" class="finput" placeholder="Nome do produto">
    <div class="frow">
      <div><label class="flabel">Categoria</label><input type="text" id="pCat" class="finput" placeholder="Ex: Peças"></div>
      <div><label class="flabel">Marca</label><input type="text" id="pMarca" class="finput" placeholder="Ex: Samsung"></div>
    </div>
    <div class="frow">
      <div><label class="flabel">Preço Custo R$</label><input type="number" id="pCusto" step="0.01" class="finput" placeholder="0,00" oninput="updMargem()"></div>
      <div><label class="flabel">Preço Venda R$</label><input type="number" id="pVenda" step="0.01" class="finput" placeholder="0,00" oninput="updMargem()"></div>
    </div>
    <div id="margemPrev" style="font-family:var(--mono);font-size:11px;color:var(--blue);margin-bottom:10px"></div>
    <div class="frow">
      <div><label class="flabel">Estoque Inicial</label><input type="number" id="pEst" value="0" class="finput"></div>
      <div><label class="flabel">Estoque Mínimo</label><input type="number" id="pEstMin" value="5" class="finput"></div>
    </div>
    <button class="btn btn-green" onclick="salvarProduto()">✅ Salvar Produto</button>`);
}
window.openNovoProduto = openNovoProduto;

function updMargem() {
  const c = parseFloat(document.getElementById('pCusto')?.value) || 0;
  const v = parseFloat(document.getElementById('pVenda')?.value) || 0;
  const el = document.getElementById('margemPrev');
  if (el && c > 0 && v > 0) el.textContent = `Margem: ${((v - c) / c * 100).toFixed(1)}% — Lucro unit: R$ ${F.money(v - c)}`;
}
window.updMargem = updMargem;

async function salvarProduto() {
  const nome = document.getElementById('pNome')?.value.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', true); return; }
  const { error } = await API.produtos.inserir({
    nome,
    categoria:      document.getElementById('pCat')?.value    || '',
    marca:          document.getElementById('pMarca')?.value  || '',
    preco_custo:    parseFloat(document.getElementById('pCusto')?.value)  || 0,
    preco_venda:    parseFloat(document.getElementById('pVenda')?.value)  || 0,
    estoque_atual:  parseInt(document.getElementById('pEst')?.value)      || 0,
    estoque_minimo: parseInt(document.getElementById('pEstMin')?.value)   || 5,
  });
  if (error) { UI.toast('⚠ ' + error.message, true); return; }
  await loadProdutos(); UI.closeModal(); renderEstoque(); UI.toast('✅ Produto salvo!');
}
window.salvarProduto = salvarProduto;

async function openProduto(id) {
  const p = STATE.produtos.find(x => x.id === id);
  if (!p) return;
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">${p.nome}</h3>
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Dados</div></div>
      <div class="ir"><span class="irl">Preço Venda</span><span class="irv" style="color:var(--green)">R$ ${F.money(p.preco_venda)}</span></div>
      <div class="ir"><span class="irl">Preço Custo</span><span class="irv">R$ ${F.money(p.preco_custo)}</span></div>
      ${p.preco_custo > 0 ? `<div class="ir"><span class="irl">Margem</span><span class="irv" style="color:var(--blue)">${((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(1)}%</span></div>` : ''}
      <div class="ir"><span class="irl">Estoque</span><span class="irv" style="color:${p.estoque_atual <= p.estoque_minimo ? 'var(--red)' : 'var(--green)'}">${p.estoque_atual} ${p.unidade || 'un'}</span></div>
    </div>
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Ajustar Estoque</div></div>
      <div class="frow">
        <div><label class="flabel">Quantidade</label><input type="number" id="ajQ" class="finput"></div>
        <div><label class="flabel">Tipo</label><select id="ajT" class="finput"><option value="1">Entrada (+)</option><option value="-1">Saída (-)</option></select></div>
      </div>
      <button class="btn btn-blue" onclick="ajustarEstoque('${id}')">Ajustar</button>
    </div>
    <div class="brow">
      <button class="btn btn-red btn-sm" style="flex:.4" onclick="delProduto('${id}')">🗑️ Remover</button>
    </div>`);
}
window.openProduto = openProduto;

async function ajustarEstoque(id) {
  const p   = STATE.produtos.find(x => x.id === id);
  if (!p) return;
  const q   = parseInt(document.getElementById('ajQ')?.value) || 0;
  const t   = parseInt(document.getElementById('ajT')?.value) || 1;
  const novo = p.estoque_atual + (q * t);
  if (novo < 0) { UI.toast('⚠ Estoque não pode ser negativo', true); return; }
  await API.produtos.atualizar(id, { estoque_atual: novo });
  await loadProdutos(); openProduto(id); renderEstoque(); UI.toast(`📦 Estoque: ${novo} un`);
}
window.ajustarEstoque = ajustarEstoque;

async function delProduto(id) {
  if (!confirm('Desativar produto?')) return;
  await API.produtos.desativar(id);
  await loadProdutos(); UI.closeModal(); renderEstoque(); UI.toast('🗑️ Produto removido');
}
window.delProduto = delProduto;

function alertasEstoque() {
  const bx = STATE.produtos.filter(p => p.ativo !== false && p.estoque_atual <= p.estoque_minimo);
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">⚠️ Estoque Baixo (${bx.length})</h3>
    ${bx.length
      ? bx.map(p => `<div class="os-item"><div class="osi-name">${p.nome}</div><div style="font-family:var(--mono);font-size:11px;color:var(--red)">Atual: ${p.estoque_atual} | Mín: ${p.estoque_minimo}</div></div>`).join('')
      : '<p style="color:var(--green);font-family:var(--mono)">✅ Estoque OK!</p>'}`);
}
window.alertasEstoque = alertasEstoque;

// ═══════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════
function renderClientes() {
  const q    = (document.getElementById('searchCliente')?.value || '').toLowerCase();
  let   list = STATE.clientes;
  if (q) list = list.filter(c => c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(q));
  const box = document.getElementById('clientesList');
  if (!box) return;
  if (!list.length) { box.innerHTML = '<div class="empty"><span class="empty-ico">👥</span><h3>SEM CLIENTES</h3></div>'; return; }
  box.innerHTML = list.map(c => `
    <div class="os-item" onclick="openCliente('${c.id}')">
      <div style="display:flex;justify-content:space-between">
        <div><div class="osi-name">${c.nome}</div><div class="osi-desc">${c.telefone || c.email || '—'}</div></div>
        <div style="text-align:right">
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green)">R$ ${F.money(c.total_gasto)}</div>
          <div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${c.total_os} OS</div>
        </div>
      </div>
    </div>`).join('');
}
window.renderClientes = renderClientes;

function openNovoCliente() {
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">👤 Novo Cliente</h3>
    <label class="flabel req">Nome</label><input type="text" id="cNome" class="finput">
    <div class="frow">
      <div><label class="flabel">Telefone</label><input type="tel" id="cTel" class="finput"></div>
      <div><label class="flabel">CPF/CNPJ</label><input type="text" id="cCpf" class="finput"></div>
    </div>
    <label class="flabel">Email</label><input type="email" id="cEmail" class="finput">
    <label class="flabel">Observações</label><textarea id="cObs" class="finput" rows="2"></textarea>
    <button class="btn btn-green" onclick="salvarCliente()">✅ Salvar</button>`);
}
window.openNovoCliente = openNovoCliente;

async function salvarCliente() {
  const nome = document.getElementById('cNome')?.value.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', true); return; }
  await API.clientes.inserir({ nome, telefone: document.getElementById('cTel')?.value || '', cpf_cnpj: document.getElementById('cCpf')?.value || '', email: document.getElementById('cEmail')?.value || '', observacoes: document.getElementById('cObs')?.value || '' });
  await loadClientes(); UI.closeModal(); renderClientes(); UI.toast('✅ Cliente salvo!');
}
window.salvarCliente = salvarCliente;

async function openCliente(id) {
  const c        = STATE.clientes.find(x => x.id === id);
  if (!c) return;
  const osCliente = STATE.os.filter(o => o.cliente_nome === c.nome).slice(0, 10);
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">${c.nome}</h3>
    <div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Dados</div></div>
      ${c.telefone ? `<div class="ir"><span class="irl">Telefone</span><span class="irv">${c.telefone}</span></div>` : ''}
      ${c.email    ? `<div class="ir"><span class="irl">Email</span><span class="irv">${c.email}</span></div>`    : ''}
      <div class="ir"><span class="irl">Total Gasto</span><span class="irv" style="color:var(--green)">R$ ${F.money(c.total_gasto)}</span></div>
      <div class="ir"><span class="irl">Total de OS</span><span class="irv">${c.total_os}</span></div>
    </div>
    ${osCliente.length ? `<div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Últimas OS</div></div>${osCliente.map(o => `<div class="mov-item" style="cursor:pointer" onclick="openOS('${o.id}');UI.closeModal()"><div><div class="mov-desc">#${o.numero_os}</div><div class="mov-meta">${F.date(o.criado_em)}</div></div><span class="mov-val e">R$ ${F.money(o.total_final)}</span></div>`).join('')}</div>` : ''}
    <div class="brow">
      <button class="btn btn-blue" onclick="goP(2);UI.closeModal();setTimeout(()=>{UI.setVal('nName','${c.nome}');UI.setVal('nPhone','${c.telefone || ''}');},100)">➕ Nova OS</button>
      <button class="btn btn-green" onclick="sendWACliente('${c.telefone || ''}','${c.nome}')">💬 WhatsApp</button>
    </div>`);
}
window.openCliente = openCliente;

// ═══════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════
function setMesAtual() { UI.setVal('analyticsMes', new Date().toISOString().slice(0, 7)); }
window.setMesAtual = setMesAtual;

function renderAnalytics() {
  const mes     = document.getElementById('analyticsMes')?.value || new Date().toISOString().slice(0, 7);
  const osMes   = STATE.os.filter(o  => o.criado_em?.startsWith(mes));
  const osP     = osMes.filter(o     => o.status === 'paga');
  const movsMes = STATE.movs.filter(m => m.data?.startsWith(mes));
  const ent     = movsMes.filter(m   => m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0);
  const sai     = movsMes.filter(m   => m.tipo === 'saida').reduce((a, m)   => a + +m.valor, 0);
  const fiad    = STATE.os.filter(o  => o.status === 'fiado').reduce((a, o) => a + +o.total_final, 0);
  const lucro   = ent - sai;
  const ticket  = osP.length ? ent / osP.length : 0;
  const byDay   = {}, byPay = {}, byProd = {};

  movsMes.filter(m => m.tipo === 'entrada').forEach(m => {
    byDay[m.data] = (byDay[m.data] || 0) + +m.valor;
    byPay[m.forma_pagamento] = (byPay[m.forma_pagamento] || 0) + +m.valor;
  });
  osP.forEach(o => safeJSON(o.itens).forEach(it => {
    if (!byProd[it.desc]) byProd[it.desc] = { q: 0, t: 0 };
    byProd[it.desc].q += it.qty; byProd[it.desc].t += it.qty * it.price;
  }));

  const topProd = Object.entries(byProd).sort((a, b) => b[1].t - a[1].t).slice(0, 5);
  const days    = Object.keys(byDay).sort();
  const box     = document.getElementById('analyticsContent');
  if (!box) return;

  box.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card kpi-g"><div class="kpi-ico">💰</div><div class="kpi-val">R$ ${F.money(ent)}</div><div class="kpi-lbl">Receita</div></div>
      <div class="kpi-card kpi-b"><div class="kpi-ico">📈</div><div class="kpi-val">R$ ${F.money(lucro)}</div><div class="kpi-lbl">Lucro Líquido</div></div>
      <div class="kpi-card kpi-o"><div class="kpi-ico">🎫</div><div class="kpi-val">R$ ${F.money(ticket)}</div><div class="kpi-lbl">Ticket Médio</div></div>
      <div class="kpi-card kpi-r"><div class="kpi-ico">📝</div><div class="kpi-val">R$ ${F.money(fiad)}</div><div class="kpi-lbl">Fiado Pend.</div></div>
    </div>
    <div class="card">
      <div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Resumo Financeiro</div></div>
      <div class="ir"><span class="irl">Entradas</span><span class="irv" style="color:var(--green)">R$ ${F.money(ent)}</span></div>
      <div class="ir"><span class="irl">Saídas</span><span class="irv" style="color:var(--red)">R$ ${F.money(sai)}</span></div>
      <div class="ir"><span class="irl">Lucro líquido</span><span class="irv" style="color:var(--blue)">R$ ${F.money(lucro)}</span></div>
      <div class="ir"><span class="irl">Margem líquida</span><span class="irv" style="color:var(--purple)">${ent > 0 ? ((lucro / ent) * 100).toFixed(1) : 0}%</span></div>
      <div class="ir"><span class="irl">OS emitidas</span><span class="irv">${osMes.length}</span></div>
      <div class="ir"><span class="irl">OS pagas</span><span class="irv" style="color:var(--green)">${osP.length}</span></div>
    </div>
    ${days.length ? `<div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Receita por Dia</div></div><div class="chart-wrap"><canvas id="chartAnalytics"></canvas></div></div>` : ''}
    ${Object.keys(byPay).length ? `<div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Por Forma de Pagamento</div></div>${Object.entries(byPay).map(([k, v]) => `<div class="ir"><span><span class="pay-pill pp-${k}">${F.pagamento(k)}</span></span><span class="irv" style="color:var(--green)">R$ ${F.money(v)}</span></div>`).join('')}</div>` : ''}
    ${topProd.length ? `<div class="card"><div class="ctitle"><div class="ctitle-left"><div class="bar"></div>Top Produtos/Serviços</div></div>${topProd.map(([n, d], i) => `<div class="ir"><span class="irl">${i + 1}. ${n}</span><span class="irv" style="color:var(--green)">R$ ${F.money(d.t)}</span></div>`).join('')}</div>` : ''}
    <div class="ia-card">
      <div class="ia-title">🤖 IA — ANÁLISE DO MÊS</div>
      <div class="ia-content" id="iaAnalyticsText"><div class="ia-loading"><div class="ia-dot"></div><div class="ia-dot"></div><div class="ia-dot"></div></div></div>
      <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="iaAnaliseMes('${mes}')">🔄 Analisar com IA</button>
    </div>`;

  setTimeout(() => {
    const ctx = document.getElementById('chartAnalytics');
    if (!ctx) return;
    if (STATE.charts.analytics) STATE.charts.analytics.destroy();
    STATE.charts.analytics = new Chart(ctx, {
      type: 'line',
      data: { labels: days.map(d => d.slice(8)), datasets: [{ data: days.map(d => byDay[d] || 0), borderColor: 'var(--blue)', backgroundColor: 'rgba(61,139,255,.1)', fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: 'var(--blue)' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7a8db3', font: { size: 10 } } },
                  y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#7a8db3', font: { size: 10 }, callback: v => 'R$' + F.money(v) } } } },
    });
  }, 100);
}
window.renderAnalytics = renderAnalytics;

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
function loadConfig() {
  const e = STATE.empresa || {};
  UI.setVal('cStoreName', e.nome         || '');
  UI.setVal('cCnpj',      e.cnpj         || '');
  UI.setVal('cPhone',     e.telefone     || '');
  UI.setVal('cAddr',      e.endereco     || '');
  UI.setVal('cSite',      e.instagram    || '');
  UI.setVal('cPix',       e.chave_pix    || '');
  UI.setVal('cTerms',     e.termos_nota  || '');
  const lp = document.getElementById('logoPreview');
  if (lp && e.logo_url) { lp.src = e.logo_url; lp.style.display = 'block'; }
  loadTermsPreview();
}
window.loadConfig = loadConfig;

async function saveConfig() {
  if (!STATE.empresa?.id) return;
  const { error } = await API.empresa.update({
    nome:        document.getElementById('cStoreName')?.value || '',
    cnpj:        document.getElementById('cCnpj')?.value      || '',
    telefone:    document.getElementById('cPhone')?.value     || '',
    endereco:    document.getElementById('cAddr')?.value      || '',
    instagram:   document.getElementById('cSite')?.value      || '',
    chave_pix:   document.getElementById('cPix')?.value       || '',
    termos_nota: document.getElementById('cTerms')?.value     || '',
  });
  if (error) { UI.toast('⚠ Erro: ' + error.message, true); return; }
  const { data } = await sb.from('empresas').select('*,planos(*)').eq('id', STATE.empresa.id).single();
  STATE.empresa = data; STATE.plano = data?.planos;
  UI.set('headerStore', data?.nome || '');
  loadTermsPreview();
  UI.toast('💾 Configurações salvas!');
}
window.saveConfig = saveConfig;

function loadTermsPreview() {
  const el = document.getElementById('termsBox');
  if (el) el.textContent = STATE.empresa?.termos_nota || 'Configure os termos em ⚙️ Configurações';
}

function handleLogo(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 500_000) { UI.toast('⚠ Logo máx 500KB', true); return; }
  const r = new FileReader();
  r.onload = async ev => {
    await API.empresa.update({ logo_url: ev.target.result });
    STATE.empresa.logo_url = ev.target.result;
    const lp = document.getElementById('logoPreview');
    if (lp) { lp.src = ev.target.result; lp.style.display = 'block'; }
    UI.toast('🖼️ Logo salva!');
  };
  r.readAsDataURL(f);
}
window.handleLogo = handleLogo;

function removeLogo() {
  API.empresa.update({ logo_url: null });
  if (STATE.empresa) STATE.empresa.logo_url = null;
  const lp = document.getElementById('logoPreview');
  if (lp) { lp.src = ''; lp.style.display = 'none'; }
  UI.toast('🗑️ Logo removida');
}
window.removeLogo = removeLogo;

async function saveWhatsApp() {
  const { error } = await API.whatsapp.salvar({
    api_url:          document.getElementById('waUrl')?.value      || '',
    api_key:          document.getElementById('waKey')?.value      || '',
    numero:           document.getElementById('waNum')?.value      || '',
    ativo:            true,
    enviar_os_pronta: document.getElementById('waOsPronta')?.checked ?? true,
    enviar_cobranca:  document.getElementById('waCobranca')?.checked ?? true,
  });
  if (error) { UI.toast('⚠ Erro: ' + error.message, true); return; }
  UI.toast('✅ WhatsApp salvo!');
}
window.saveWhatsApp = saveWhatsApp;

async function exportBackup() {
  const payload = { empresa: STATE.empresa, os: STATE.os, movs: STATE.movs, produtos: STATE.produtos, clientes: STATE.clientes, exportado_em: new Date().toISOString() };
  const b = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'nexos_backup_' + F.today() + '.json';
  a.click();
  UI.toast('📤 Backup exportado!');
}
window.exportBackup = exportBackup;

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════
function checkNotifs() {
  const unread = STATE.notifs.filter(n => !n.lida).length;
  const dot    = document.getElementById('notifDot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
}

function toggleNotif() {
  document.getElementById('notifPanel')?.classList.toggle('open');
  document.getElementById('userMenu')?.classList.remove('open');
  renderNotifs();
}
window.toggleNotif = toggleNotif;

function renderNotifs() {
  const box = document.getElementById('notifList');
  if (!box) return;
  if (!STATE.notifs.length) { box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Nenhuma notificação</div>'; return; }
  box.innerHTML = STATE.notifs.slice(0, 15).map(n => `
    <div class="notif-item ${!n.lida ? 'unread' : ''}" onclick="marcarLida('${n.id}')">
      <div class="notif-title">${n.titulo}</div>
      <div class="notif-msg">${n.mensagem || ''}</div>
      <div class="notif-time">${F.datetime(n.criado_em)}</div>
    </div>`).join('');
}

async function marcarLida(id) {
  await API.notifs.marcarLida(id);
  const n = STATE.notifs.find(x => x.id === id); if (n) n.lida = true;
  renderNotifs(); checkNotifs();
}
window.marcarLida = marcarLida;

async function marcarTodasLidas() {
  await API.notifs.marcarTodasLidas();
  STATE.notifs.forEach(n => n.lida = true);
  renderNotifs(); checkNotifs(); UI.toast('✅ Todas lidas');
}
window.marcarTodasLidas = marcarTodasLidas;

function toggleUserMenu() {
  document.getElementById('userMenu')?.classList.toggle('open');
  document.getElementById('notifPanel')?.classList.remove('open');
}
window.toggleUserMenu = toggleUserMenu;

function toggleTheme() {
  STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', STATE.theme === 'light' ? 'light' : '');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = STATE.theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('nexos_theme', STATE.theme);
}
window.toggleTheme = toggleTheme;

// ═══════════════════════════════════════════════════════════
// MASTER ADMIN
// ═══════════════════════════════════════════════════════════
async function renderMaster() {
  if (STATE.perfil?.cargo !== 'master') return;
  const [{ data: empresas }, { data: allMovs }] = await Promise.all([
    API.master.listarEmpresas(),
    API.master.listarEntradas(),
  ]);
  const mrr          = empresas?.reduce((a, e) => a + +(e.planos?.preco || 0), 0) || 0;
  const totalReceita = allMovs?.reduce((a, m) => a + +m.valor, 0) || 0;
  const ativas       = empresas?.filter(e => e.ativa && !e.bloqueada).length || 0;

  document.getElementById('masterKpis').innerHTML = `
    <div class="kpi-card kpi-g"><div class="kpi-ico">🏪</div><div class="kpi-val">${empresas?.length || 0}</div><div class="kpi-lbl">Empresas</div></div>
    <div class="kpi-card kpi-b"><div class="kpi-ico">✅</div><div class="kpi-val">${ativas}</div><div class="kpi-lbl">Ativas</div></div>
    <div class="kpi-card kpi-p"><div class="kpi-ico">💎</div><div class="kpi-val">R$ ${F.money(mrr)}</div><div class="kpi-lbl">MRR</div></div>
    <div class="kpi-card kpi-o"><div class="kpi-ico">💰</div><div class="kpi-val">R$ ${F.money(totalReceita)}</div><div class="kpi-lbl">Receita Total</div></div>`;

  STATE._masterEmpresas = empresas || [];
  renderEmpresas();
}
window.renderMaster = renderMaster;

function renderEmpresas() {
  const q    = (document.getElementById('searchEmpresas')?.value || '').toLowerCase();
  let   list = STATE._masterEmpresas;
  if (q) list = list.filter(e => e.nome.toLowerCase().includes(q));
  const box = document.getElementById('empresasList');
  if (!box) return;
  box.innerHTML = list.slice(0, 50).map(e => `
    <div class="os-item ${e.bloqueada ? 'os-cancelada' : 'os-paga'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="osi-name">${e.nome}</div>
          <div class="osi-desc">${e.email || e.telefone || '—'}</div>
          <div class="osi-meta" style="margin-top:4px">
            <span class="sbadge ${e.bloqueada ? 'sb-cancelada' : 'sb-paga'}">${e.bloqueada ? 'Bloqueada' : 'Ativa'}</span>
            <span class="pay-pill pp-pix">${e.planos?.nome || 'Gratuito'}</span>
            <span style="font-size:11px;color:var(--muted);font-family:var(--mono)">${F.date(e.criado_em)}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
          <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="masterBloquear('${e.id}',${e.bloqueada})">${e.bloqueada ? '🔓 Desbloquear' : '🔒 Bloquear'}</button>
          <button class="btn btn-outline btn-sm" style="font-size:10px" onclick="masterAlterarPlano('${e.id}')">💎 Plano</button>
        </div>
      </div>
    </div>`).join('');
}
window.renderEmpresas = renderEmpresas;

async function masterBloquear(id, bloqueada) {
  if (!confirm(bloqueada ? 'Desbloquear empresa?' : 'Bloquear empresa?')) return;
  await API.empresa.bloquear(id, !bloqueada);
  renderMaster(); UI.toast(bloqueada ? '🔓 Desbloqueada' : '🔒 Bloqueada');
}
window.masterBloquear = masterBloquear;

async function masterAlterarPlano(id) {
  const { data: planos } = await API.empresa.getPlanos();
  UI.openModal(`
    <h3 style="font-size:18px;font-weight:700;margin-bottom:14px">💎 Alterar Plano</h3>
    ${planos.map(p => `
      <div class="os-item" onclick="confirmarPlano('${id}','${p.id}','${p.nome}');UI.closeModal()">
        <div style="display:flex;justify-content:space-between">
          <div><div class="osi-name">${p.nome}</div><div class="osi-desc">Até ${p.max_usuarios} usuários · ${p.max_os_mes} OS/mês</div></div>
          <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:var(--green)">R$ ${F.money(p.preco)}</div>
        </div>
      </div>`).join('')}`);
}
window.masterAlterarPlano = masterAlterarPlano;

async function confirmarPlano(empresaId, planoId, planoNome) {
  await API.empresa.alterarPlano(empresaId, planoId);
  renderMaster(); UI.toast('✅ Plano alterado para ' + planoNome);
}
window.confirmarPlano = confirmarPlano;

// ═══════════════════════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════════════════════
async function enviarWA(telefone, msg) {
  const wa  = await API.whatsapp.get();
  const num = (telefone || '').replace(/\D/g, '');
  if (!wa?.data?.ativo) {
    window.open((num ? `https://wa.me/55${num}?text=` : 'https://wa.me/?text=') + encodeURIComponent(msg), '_blank');
    return;
  }
  try {
    await fetch(wa.data.api_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${wa.data.api_key}` },
      body: JSON.stringify({ number: num, message: msg }),
    });
    UI.toast('✅ WhatsApp enviado!');
  } catch {
    window.open(`https://wa.me/55${num}?text=` + encodeURIComponent(msg), '_blank');
  }
}

function sendWA(id) {
  const o   = STATE.os.find(x => x.id === id); if (!o) return;
  const cfg = STATE.empresa || {};
  const itens = safeJSON(o.itens);
  const msg = `🧾 *${cfg.nome || 'NexOS'}*\n\n📋 *OS:* #${o.numero_os}\n👤 *Cliente:* ${o.cliente_nome}\n📅 *Data:* ${F.datetime(o.criado_em)}\n\n*Itens:*\n${itens.map(it => `• ${it.desc} x${it.qty} = R$ ${F.money(it.qty * it.price)}`).join('\n')}\n\n💰 *TOTAL: R$ ${F.money(o.total_final)}*\n💳 *Pagamento:* ${F.pagamento(o.forma_pagamento)}\n📊 *Status:* ${F.status(o.status)}${cfg.chave_pix ? '\n\n📱 *PIX:* ' + cfg.chave_pix : ''}`;
  enviarWA(o.cliente_telefone || '', msg);
}
window.sendWA = sendWA;

function sendWACliente(tel, nome) {
  enviarWA(tel, `Olá ${nome}! Entrando em contato da ${STATE.empresa?.nome || 'nossa loja'}. Como posso ajudar?`);
}
window.sendWACliente = sendWACliente;

// ═══════════════════════════════════════════════════════════
// IA
// ═══════════════════════════════════════════════════════════
async function _iaRender(prompt, elId, maxTokens = 600) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = '<div class="ia-loading"><div class="ia-dot"></div><div class="ia-dot"></div><div class="ia-dot"></div></div>';
  const texto = await API.ia.chamar(prompt, maxTokens);
  if (el) el.innerHTML = texto ? texto.replace(/\n/g, '<br>') : '<span style="color:var(--muted);font-family:var(--mono);font-size:11px">⚠ IA não configurada. Deploy a edge function ia-proxy.</span>';
  return texto;
}

async function iaSugerirPreco() {
  if (!STATE.newItems.length) { UI.toast('⚠ Adicione itens primeiro', true); return; }
  const itens = STATE.newItems.map(i => `${i.desc} (x${i.qty})`).join(', ');
  const total = STATE.newItems.reduce((a, i) => a + i.qty * i.price, 0);
  document.getElementById('iaSugestaoCard').style.display = 'block';
  await _iaRender(`Você é um consultor de precificação para pequenas empresas brasileiras. Analise estes itens/serviços: ${itens}. Valor atual total: R$ ${F.money(total)}. Sugira se o preço está adequado e dê uma faixa de mercado. Seja direto. Máximo 5 linhas.`, 'iaSugestaoText');
}
window.iaSugerirPreco = iaSugerirPreco;

async function iaDescricao() {
  if (!STATE.newItems.length) { UI.toast('⚠ Adicione itens primeiro', true); return; }
  const itens = STATE.newItems.map(i => i.desc).join(', ');
  document.getElementById('iaSugestaoCard').style.display = 'block';
  const texto = await _iaRender(`Crie uma descrição profissional para uma OS com: ${itens}. Português, máximo 3 linhas, tom profissional. Sem asteriscos.`, 'iaSugestaoText');
  if (texto) UI.setVal('nDesc', texto);
}
window.iaDescricao = iaDescricao;

async function iaFluxoCaixa() {
  const mes     = new Date().toISOString().slice(0, 7);
  const movsMes = STATE.movs.filter(m => m.data?.startsWith(mes));
  const ent     = movsMes.filter(m => m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0);
  const sai     = movsMes.filter(m => m.tipo === 'saida').reduce((a, m)   => a + +m.valor, 0);
  const abertas = STATE.os.filter(o => o.status === 'aberta' || o.status === 'em_andamento').length;
  const fiados  = STATE.os.filter(o => o.status === 'fiado').reduce((a, o) => a + +o.total_final, 0);
  await _iaRender(`Analista financeiro de pequenas empresas. Dados do mês: Entradas: R$ ${F.money(ent)}, Saídas: R$ ${F.money(sai)}, Saldo: R$ ${F.money(ent - sai)}, OS abertas: ${abertas}, Fiado: R$ ${F.money(fiados)}. Previsão de caixa para próximos 15 dias e risco financeiro. Máximo 4 linhas.`, 'iaFluxoText');
}
window.iaFluxoCaixa = iaFluxoCaixa;

async function iaSugerirEstoque() {
  const baixo      = STATE.produtos.filter(p => p.estoque_atual <= p.estoque_minimo);
  const maisUsados = [...STATE.produtos].sort((a, b) => b.vezes_usado - a.vezes_usado).slice(0, 5);
  await _iaRender(`Consultor de estoque. Baixo estoque: ${baixo.map(p => p.nome + ' (' + p.estoque_atual + ' un)').join(', ') || 'nenhum'}. Mais usados: ${maisUsados.map(p => p.nome + ' (' + p.vezes_usado + 'x)').join(', ') || 'nenhum'}. Sugira reposição prioritária. Máximo 4 linhas.`, 'iaEstoqueText');
}
window.iaSugerirEstoque = iaSugerirEstoque;

async function iaAnaliseMes(mes) {
  const osMes   = STATE.os.filter(o  => o.criado_em?.startsWith(mes));
  const movsMes = STATE.movs.filter(m => m.data?.startsWith(mes));
  const ent     = movsMes.filter(m   => m.tipo === 'entrada').reduce((a, m) => a + +m.valor, 0);
  const sai     = movsMes.filter(m   => m.tipo === 'saida').reduce((a, m)   => a + +m.valor, 0);
  await _iaRender(`Analise este mês de uma pequena empresa: ${osMes.length} OS, R$ ${F.money(ent)} receita, R$ ${F.money(sai)} despesas, lucro R$ ${F.money(ent - sai)}. Avalie desempenho e dê 2 sugestões. Máximo 5 linhas.`, 'iaAnalyticsText');
}
window.iaAnaliseMes = iaAnaliseMes;

// ═══════════════════════════════════════════════════════════
// ASSINATURA CANVAS
// ═══════════════════════════════════════════════════════════
function initSig() {
  const c = document.getElementById('sigC');
  if (c) { c.width = c.offsetWidth; c.height = 130; }
}

function _getSigPos(e, c) {
  const r = c.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return [t.clientX - r.left, t.clientY - r.top];
}

function sigSD(e) {
  e.preventDefault();
  STATE.sigDrawing = true;
  const c = document.getElementById('sigC');
  [STATE.slx, STATE.sly] = _getSigPos(e, c);
}

function sigDM(e) {
  if (!STATE.sigDrawing) return;
  e.preventDefault();
  const c   = document.getElementById('sigC');
  const ctx = c.getContext('2d');
  const [x, y] = _getSigPos(e, c);
  ctx.beginPath(); ctx.moveTo(STATE.slx, STATE.sly); ctx.lineTo(x, y);
  ctx.strokeStyle = '#f0f4ff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  [STATE.slx, STATE.sly] = [x, y];
}

function sigSU() { STATE.sigDrawing = false; }

function clearSig() {
  const c = document.getElementById('sigC');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function isEmptySig(c) {
  if (!c) return true;
  return !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some(v => v !== 0);
}
window.clearSig = clearSig;

// ═══════════════════════════════════════════════════════════
// COMPROVANTE
// ═══════════════════════════════════════════════════════════
async function openComp(id) {
  STATE.currentCompId = id;
  const o   = STATE.os.find(x => x.id === id); if (!o) return;
  const cfg = STATE.empresa || {};
  const itens = safeJSON(o.itens);
  const fotos = safeJSON(o.fotos);
  const { data: parcs } = await API.parcelas.listar(id);

  const fotosH = fotos.length ? `<div class="comp-section">FOTOS</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:10px">${fotos.slice(0, 6).map(f => `<img src="${f}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">`).join('')}</div>` : '';
  const carneH = parcs?.length ? `<div class="comp-section">CARNÊ DE PAGAMENTO</div><div style="border:1px solid #ddd;border-radius:8px;padding:8px;margin-bottom:10px;font-size:11px">${parcs.map(p => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #f0f0f0"><span>Parc ${p.numero}/${p.total_parcelas}</span><span>R$ ${F.money(p.valor)}</span><span>${F.date(p.vencimento + 'T12:00:00')}</span><span style="color:${p.pago ? 'green' : '#888'}">${p.pago ? '✓' : 'Pend.'}</span></div>`).join('')}</div>` : '';
  const qrId  = 'qr-' + id;

  document.getElementById('compContent').innerHTML = `
    <div class="comp-paper" id="compPaper">
      <div class="comp-header">
        ${cfg.logo_url ? `<img src="${cfg.logo_url}" class="comp-logo-img">` : ''}
        <div class="comp-logo">${cfg.nome || 'NexOS'}</div>
        <div class="comp-sub">${cfg.cnpj ? 'CNPJ: ' + cfg.cnpj : ''}</div>
        <div class="comp-sub">${cfg.endereco || ''}</div>
        <div class="comp-sub">${cfg.telefone || ''} ${cfg.instagram ? '· ' + cfg.instagram : ''}</div>
      </div>
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:2px">NOTA / ORDEM DE SERVIÇO</div>
        <div class="comp-num">#${o.numero_os}</div>
        <div class="comp-date">${F.datetime(o.criado_em)}</div>
        <div style="margin-top:6px">
          <span style="background:${F.statusColor(o.status)};color:#fff;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">${F.status(o.status)}</span>
          <span style="margin-left:6px;background:#eee;color:#555;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">${F.pagamento(o.forma_pagamento)}</span>
        </div>
      </div>
      <div class="comp-section">CLIENTE</div>
      <div class="comp-row"><span>Nome</span><span><b>${o.cliente_nome}</b></span></div>
      ${o.cliente_telefone ? `<div class="comp-row"><span>Telefone</span><span>${o.cliente_telefone}</span></div>` : ''}
      ${o.cliente_doc      ? `<div class="comp-row"><span>CPF/Doc</span><span>${o.cliente_doc}</span></div>` : ''}
      <div class="comp-section">ITENS / SERVIÇOS</div>
      <div class="comp-items">${itens.map(it => `<div class="comp-item-row"><span>${it.desc} (x${it.qty})</span><span><b>R$ ${F.money(it.qty * it.price)}</b></span></div>`).join('')}</div>
      ${o.desconto > 0 ? `<div class="comp-row"><span>Desconto</span><span>- R$ ${F.money(o.desconto)}</span></div>` : ''}
      <div class="comp-total-row"><span>TOTAL</span><span>R$ ${F.money(o.total_final)}</span></div>
      ${o.valor_pago > 0             ? `<div class="comp-row"><span>Valor pago</span><span>R$ ${F.money(o.valor_pago)}</span></div>` : ''}
      ${o.valor_pago > o.total_final ? `<div class="comp-row"><span>Troco</span><span>R$ ${F.money(o.valor_pago - o.total_final)}</span></div>` : ''}
      ${o.garantia_dias > 0          ? `<div class="comp-row"><span>Garantia</span><span>${o.garantia_dias} dias</span></div>` : ''}
      ${o.descricao ? `<div class="comp-section">OBSERVAÇÕES</div><div style="font-size:12px;color:#555;line-height:1.6;margin-bottom:8px">${o.descricao}</div>` : ''}
      ${carneH}${fotosH}
      ${o.assinatura_url ? `<div class="comp-section">ASSINATURA</div><div style="border:1px solid #ddd;border-radius:8px;padding:8px;text-align:center;margin-bottom:8px"><img src="${o.assinatura_url}" style="max-width:100%;max-height:70px;object-fit:contain"><div style="font-size:10px;color:#888;margin-top:4px">${o.cliente_nome}</div></div>` : ''}
      ${cfg.termos_nota ? `<div class="comp-terms">${cfg.termos_nota}</div>` : ''}
      <div class="comp-footer">
        <div class="comp-qr" id="${qrId}"></div>
        <div class="comp-hash">OS: #${o.numero_os} | HASH: ${o.hash || 'N/A'}</div>
        ${cfg.chave_pix ? `<div style="margin-top:8px"><b>PIX:</b> ${cfg.chave_pix}</div>` : ''}
        <div style="margin-top:10px;font-size:10px">Obrigado pela preferência! 🙏</div>
      </div>
    </div>`;

  setTimeout(() => {
    try {
      const el = document.getElementById(qrId);
      if (el && window.QRCode) new QRCode(el, { text: 'OS:#' + o.numero_os + '|HASH:' + o.hash, width: 80, height: 80, colorDark: '#2979ff', colorLight: '#ffffff' });
    } catch {}
  }, 200);

  document.getElementById('compView').classList.add('open');
}
window.openComp = openComp;

function closeComp()  { document.getElementById('compView').classList.remove('open'); }
function printComp()  { window.print(); }
function shareComp()  {
  const o = STATE.os.find(x => x.id === STATE.currentCompId); if (!o) return;
  const txt = `🧾 OS #${o.numero_os}\n${o.cliente_nome}\nTotal: R$ ${F.money(o.total_final)}\n${F.datetime(o.criado_em)}`;
  if (navigator.share) navigator.share({ title: 'OS #' + o.numero_os, text: txt });
  else navigator.clipboard.writeText(txt).then(() => UI.toast('📋 Copiado!'));
}
window.closeComp = closeComp;
window.printComp = printComp;
window.shareComp = shareComp;

function viewPhoto(osId, idx) {
  const o     = STATE.os.find(x => x.id === osId); if (!o) return;
  const fotos = safeJSON(o.fotos);
  UI.openModal(`<div style="text-align:center"><img src="${fotos[idx]}" style="max-width:100%;border-radius:12px;margin-bottom:12px"><div style="font-family:var(--mono);font-size:11px;color:var(--muted)">${idx + 1} de ${fotos.length}</div></div>`);
}
window.viewPhoto = viewPhoto;

// ═══════════════════════════════════════════════════════════
// PDF
// ═══════════════════════════════════════════════════════════
async function genPDF(id) {
  const o = STATE.os.find(x => x.id === id); if (!o) return;
  if (!window.jspdf) { UI.toast('⚠ jsPDF não carregado', true); return; }
  UI.toast('⏳ Gerando PDF...', false, true);
  try {
    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 15;
    let   y = M;
    const cfg   = STATE.empresa || {};
    const itens = safeJSON(o.itens);
    const BG = [10,14,26], ACC = [61,139,255], GRN = [0,200,100], TXT = [240,244,255], MUT = [122,141,179];

    doc.setFillColor(...BG); doc.rect(0, 0, W, 297, 'F');
    doc.setFillColor(15, 22, 41); doc.rect(0, 0, W, 48, 'F');

    if (cfg.logo_url) { try { doc.addImage(cfg.logo_url, 'PNG', M, 8, 20, 20, '', 'FAST'); } catch {} }
    const lx = cfg.logo_url ? M + 25 : M;
    doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(...ACC);
    doc.text(cfg.nome || 'NexOS', lx, 18);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...MUT);
    if (cfg.cnpj)     doc.text('CNPJ: ' + cfg.cnpj, lx, 25);
    if (cfg.endereco) doc.text(cfg.endereco, lx, 30);
    if (cfg.telefone) doc.text(cfg.telefone, lx, 35);

    doc.setFontSize(28); doc.setFont('helvetica','bold'); doc.setTextColor(...ACC);
    doc.text('#' + o.numero_os, W - M, 18, { align: 'right' });
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...MUT);
    doc.text('NOTA / OS', W - M, 24, { align: 'right' });
    doc.text(F.datetime(o.criado_em), W - M, 30, { align: 'right' });
    y = 58;

    const sec = (t) => { doc.setFillColor(22,30,54); doc.rect(M,y,W-2*M,7,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...ACC); doc.text(t,M+2,y+5); y+=10; };
    const row = (l, v) => { if (!v) return; doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...MUT); doc.text(l+':',M+2,y); doc.setTextColor(...TXT); doc.setFont('helvetica','bold'); doc.text(String(v),M+42,y); y+=6; };

    doc.setFillColor(10,35,18); doc.roundedRect(M,y,W-2*M,14,3,3,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...GRN);
    doc.text('R$ ' + F.money(o.total_final), W-M-2, y+9, { align:'right' }); y+=20;

    sec('CLIENTE'); row('Nome', o.cliente_nome); row('Telefone', o.cliente_telefone); row('CPF/Doc', o.cliente_doc);
    y += 2; sec('ITENS');
    itens.forEach((it, i) => {
      doc.setFillColor(i%2===0?16:19, i%2===0?22:26, i%2===0?42:46); doc.rect(M,y-1,W-2*M,7,'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...TXT);
      doc.text(it.desc.slice(0,55), M+2, y+4);
      doc.setTextColor(...GRN); doc.setFont('helvetica','bold');
      doc.text('R$ '+F.money(it.qty*it.price), W-M-2, y+4, { align:'right' }); y+=7;
    });
    doc.setFillColor(10,32,18); doc.rect(M,y,W-2*M,8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...GRN);
    doc.text('TOTAL', M+2, y+6); doc.text('R$ '+F.money(o.total_final), W-M-2, y+6, { align:'right' }); y+=12;

    if (o.descricao) { sec('DESCRIÇÃO'); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...TXT); const ls=doc.splitTextToSize(o.descricao,W-2*M-4); doc.text(ls,M+2,y); y+=ls.length*5+6; }
    if (cfg.termos_nota) { sec('TERMOS'); doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...MUT); const tl=doc.splitTextToSize(cfg.termos_nota,W-2*M-4); doc.text(tl,M+2,y); y+=tl.length*4+6; }

    doc.setFillColor(16,20,36); doc.rect(M,y,W-2*M,16,'F');
    doc.setFont('courier','bold'); doc.setFontSize(7); doc.setTextColor(...ACC); doc.text('VERIFICAÇÃO',M+3,y+6);
    doc.setFont('courier','normal'); doc.setFontSize(6); doc.setTextColor(...MUT);
    doc.text('OS: #'+o.numero_os+' | '+F.datetime(o.criado_em),M+3,y+11);
    doc.text('HASH: '+(o.hash||'N/A'),M+3,y+15);

    doc.save('OS_'+o.numero_os+'_'+o.cliente_nome.replace(/\s+/g,'_')+'.pdf');
    UI.toast('📄 PDF gerado!');
  } catch (e) { UI.toast('⚠ Erro PDF: ' + e.message, true); }
}
window.genPDF = genPDF;

function exportCaixaPDF() { printRelatorio(); }
function printRelatorio() {
  const day  = document.getElementById('caixaDate')?.value || F.today();
  const movs = STATE.movs.filter(m => m.data === day);
  const ent  = movs.filter(m => m.tipo==='entrada').reduce((a,m)=>a+ +m.valor,0);
  const sai  = movs.filter(m => m.tipo==='saida').reduce((a,m)=>a+ +m.valor,0);
  const cfg  = STATE.empresa || {};
  const w = window.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Caixa ${day}</title><style>body{font-family:monospace;max-width:420px;margin:20px auto}table{width:100%;border-collapse:collapse}td{padding:5px 8px;border-bottom:1px solid #eee;font-size:13px}.tot{font-weight:700}.pos{color:green}.neg{color:red}</style></head><body>${cfg.logo_url?`<img src="${cfg.logo_url}" style="height:50px;margin-bottom:8px;border-radius:6px">`:''}<h2>${cfg.nome||'NexOS'}</h2><h3>CAIXA — ${day}</h3><table>${movs.map(m=>`<tr><td>${F.time(m.criado_em)}</td><td>${m.descricao}</td><td class="${m.tipo==='saida'?'neg':'pos'}">${m.tipo==='saida'?'-':'+'} R$ ${F.money(m.valor)}</td></tr>`).join('')}</table><hr><table><tr class="tot"><td>ENTRADAS</td><td class="pos">R$ ${F.money(ent)}</td></tr><tr class="tot"><td>SAÍDAS</td><td class="neg">R$ ${F.money(sai)}</td></tr><tr class="tot"><td>SALDO</td><td>R$ ${F.money(ent-sai)}</td></tr></table></body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}
window.exportCaixaPDF  = exportCaixaPDF;
window.printRelatorio  = printRelatorio;

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS GLOBAIS
// ═══════════════════════════════════════════════════════════
function initEventListeners() {
  const c = document.getElementById('sigC');
  if (c) {
    c.addEventListener('touchstart', sigSD, { passive: false });
    c.addEventListener('touchmove',  sigDM, { passive: false });
    c.addEventListener('touchend',   sigSU);
    c.addEventListener('mousedown',  sigSD);
    c.addEventListener('mousemove',  sigDM);
    c.addEventListener('mouseup',    sigSU);
  }

  document.getElementById('mwrap')?.addEventListener('click', function(e) {
    if (e.target === this) UI.closeModal();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#notifPanel') && !e.target.closest('#notifBtn'))
      document.getElementById('notifPanel')?.classList.remove('open');
    if (!e.target.closest('#userMenu') && !e.target.closest('.user-chip'))
      document.getElementById('userMenu')?.classList.remove('open');
  });

  document.getElementById('searchOS')?.addEventListener('input', debounce(renderOS, 300));
  document.getElementById('searchEstoque')?.addEventListener('input', debounce(renderEstoque, 300));
  document.getElementById('searchCliente')?.addEventListener('input', debounce(renderClientes, 300));
}

window.addEventListener('resize', () => {
  const c = document.getElementById('sigC');
  if (c) { c.width = c.offsetWidth; c.height = 130; }
});

window.closeM = () => UI.closeModal();
