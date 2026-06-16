/* ============================================================
   NexOS v5.1 — core/app.js
   Features: desconto OS (#11), blacklist (#32), garantia (#25),
   meta mensal (#19), histórico preços (#20),
   aniversário (#28), precificação automática (#17),
   pesquisa global aprimorada (#37), orçamento (#13),
   PIX QR Code (#6), comprovante automático (#7),
   impressão térmica (#36), relatório PDF (#10),
   notificação push OS vencida (#9), log auditoria (#39),
   backup (#40)
   v5.1: dashboard vendas x mão de obra, carnês dentro do Caixa,
   remoção de checklist e PIN não usados
   ============================================================ */
'use strict';

// ══════════════════════════════════════════════════════════════
// ESTADO LOCAL
// ══════════════════════════════════════════════════════════════
const APP = {
  os: [], clientes: [], produtos: [], agenda: [],
  _page: 'dashboard',
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const _c  = (s, n)     => typeof s === 'string' ? s.trim().slice(0, n || 300).replace(/[<>"'`]/g, '') : '';
const _n  = (s, mn, mx)=> { const v = parseFloat(s); return isNaN(v) ? 0 : Math.min(Math.max(v, mn ?? 0), mx ?? 9_999_999); };
const _e  = s          => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const gv  = (id, d)    => { const el = document.getElementById(id); return el ? el.value : (d !== undefined ? d : ''); };
const gi  = (id, d)    => { const v = parseInt(gv(id, '')); return isNaN(v) ? (d || 0) : v; };
const gn  = (id, d)    => { const v = parseFloat(gv(id, '')); return isNaN(v) ? (d || 0) : v; };
const calcMargem = (c, v) => v > 0 ? (((v - c) / v) * 100).toFixed(0) : 0;

// ══════════════════════════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════════════════════════
const PAGE_TITLES = {
  dashboard:'Dashboard', os:'Ordens de Serviço', clientes:'Clientes',
  estoque:'Estoque', caixa:'Caixa', agenda:'Agenda', config:'Configurações',
  orcamentos:'Orçamentos', auditoria:'Log de Auditoria',
  'nova-os':'Nova OS', 'ver-os':'OS', 'novo-cliente':'Novo Cliente',
  'ver-cliente':'Cliente', 'novo-produto':'Novo Produto', 'novo-evento':'Novo Evento',
  'novo-orcamento':'Novo Orçamento',
};
const SECONDARY_PAGES = [
  'nova-os','ver-os','novo-cliente','ver-cliente',
  'novo-produto','novo-evento','novo-orcamento',
];

let _prevPage = 'dashboard';
let _verOsId  = null;

function goPage(page, opts = {}) {
  if (!SECONDARY_PAGES.includes(APP._page)) _prevPage = APP._page;
  APP._page = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');

  const navPage = SECONDARY_PAGES.includes(page) ? _prevPage : page;
  document.querySelectorAll('.nav-item,.mobile-nav-item')
    .forEach(i => i.classList.toggle('active', i.dataset.page === navPage));

  const fab = document.getElementById('fab');
  if (fab) fab.style.display =
    (!SECONDARY_PAGES.includes(page) && ['os','clientes','estoque','agenda','orcamentos'].includes(page)) ? 'flex' : 'none';

  UI.setPageTitle(PAGE_TITLES[page] || page);
  if (!SECONDARY_PAGES.includes(page)) localStorage.setItem('nexos_v5_page', page);

  const pc = document.getElementById('page-content'); if (pc) pc.scrollTop = 0;

  const renderers = {
    dashboard: renderDash, os: renderOS, clientes: renderClientes,
    estoque: renderEstoque, caixa: renderCaixa, agenda: renderAgenda,
    config: renderConfig, orcamentos: renderOrcamentos,
    auditoria: renderAuditoria,
  };
  if (renderers[page]) renderers[page]();
  if (window.lucide) lucide.createIcons();
}

function goBack()    { goPage(_prevPage); }
function closeModal(){ document.getElementById('mwrap')?.classList.remove('open'); document.body.style.overflow = ''; }
function openModal(html) {
  const mb = document.getElementById('mbody'); if (!mb) return;
  mb.innerHTML = html;
  document.getElementById('mwrap').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function fabAction() {
  const a = { os: novaOS, clientes: novoCliente, estoque: novoProduto, agenda: novoEvento, orcamentos: novoOrcamento };
  if (a[APP._page]) a[APP._page]();
}

// ══════════════════════════════════════════════════════════════
// APP INIT
// ══════════════════════════════════════════════════════════════
const App = {
  async init() {
    try {
      [APP.os, APP.clientes, APP.produtos, APP.agenda] = await Promise.all([
        API.getOS(STATE.user.id),
        API.getClientes(STATE.user.id),
        API.getProdutos(STATE.user.id),
        API.getAgenda(STATE.user.id, today() + 'T00:00:00', today() + 'T23:59:59'),
      ]);
    } catch(e) { console.error('App.init:', e); }

    this._ui();
    this._agendaAlert();
    this._carnesAlert();
    this._estoqueAlert();
    requestNotifPermission();

    // Verificar OS vencidas após 8s (não interrompe o carregamento)
    setTimeout(verificarOSVencidas, 8000);
    // Verificar push de OS aguardando (Feature #9)
    setTimeout(pushOSPendentes, 12000);

    const last = localStorage.getItem('nexos_v5_page') || 'dashboard';
    const lastValido = !SECONDARY_PAGES.includes(last) && document.getElementById('page-' + last);
    goPage(lastValido ? last : 'dashboard');
    if (window.lucide) lucide.createIcons();
  },

  _ui() {
    const p    = STATE.perfil || {};
    const nome = p.empresa_nome || STATE.user?.email || 'NexOS';
    const ini  = initials(nome);
    ['sidebar-avatar','header-avatar'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      if (p.logo_url) {
        el.innerHTML = `<img src="${p.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
      } else {
        el.textContent = ini;
      }
    });
    const sn = document.getElementById('sidebar-name'); if (sn) sn.textContent = nome.split(' ')[0];
    const sr = document.getElementById('sidebar-role'); if (sr) sr.textContent  = 'Proprietário';
  },

  async _agendaAlert() {
    if (!APP.agenda.length) return;
    UI.toast(`📅 ${APP.agenda.length} compromisso(s) hoje`, 'info');
    if ('Notification' in window && Notification.permission === 'granted') {
      const msg = APP.agenda.map(e => `• ${e.titulo}${e.hora ? ' às ' + e.hora : ''}`).join('\n');
      new Notification('NexOS — Agenda de Hoje', { body: msg, icon: 'NexOS.png' });
    }
  },

  async _carnesAlert() {
    try {
      const venc = await API.getParcelas(STATE.user.id, true);
      if (venc.length > 0) UI.toast(`⚠️ ${venc.length} parcela(s) vencida(s)`, 'warning');
    } catch {}
  },

  _estoqueAlert() {
    const baixo = APP.produtos.filter(p => (p.quantidade || 0) <= (p.estoque_min || 0));
    if (baixo.length) UI.toast(`📦 ${baixo.length} produto(s) abaixo do estoque mínimo`, 'warning');
  },
};

// ══════════════════════════════════════════════════════════════
// NOTIFICAÇÃO PUSH — Feature #9
// ══════════════════════════════════════════════════════════════
async function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => {});
  }
}

async function pushOSPendentes() {
  if (Notification.permission !== 'granted') return;
  const pendentes = APP.os.filter(o => ['aguardando','andamento'].includes(o.status));
  if (pendentes.length === 0) return;
  // Push nativa — só mostra se app não está em foco
  if (document.visibilityState !== 'visible') {
    new Notification('NexOS — OS Pendentes', {
      body: `Você tem ${pendentes.length} OS abertas aguardando atendimento.`,
      icon: 'NexOS.png',
    });
  }
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function _normSt(s) {
  return { concluido:'concluido', retirada:'concluido', aguardando:'aguardando',
           andamento:'andamento', cancelado:'cancelado', fiado:'fiado',
           orcamento:'orcamento' }[s] || s || 'aguardando';
}

async function renderDash() {
  try {
    const d = await API.getDashboard(STATE.user.id);

    // KPIs
    const kf = document.getElementById('kpi-fat');   if (kf) kf.textContent = fmt(d.faturamento);
    const kl = document.getElementById('kpi-lucro'); if (kl) kl.textContent = fmt(d.lucro);
    const ko = document.getElementById('kpi-os');    if (ko) ko.textContent = d.os_abertas;

    // v5.1 — Vendas x Mão de Obra
    const kv = document.getElementById('kpi-vendas');   if (kv) kv.textContent = fmt(d.vendas_pecas   || 0);
    const km = document.getElementById('kpi-maoobra');  if (km) km.textContent = fmt(d.vendas_mao_obra || 0);

    const ka = document.getElementById('kpi-alertas');
    if (ka) {
      const bx = APP.produtos.filter(p => (p.quantidade || 0) <= (p.estoque_min || 0)).length;
      const total = d.parcelas_vencidas + bx;
      ka.textContent = total || '✓';
      ka.style.color = total > 0 ? 'var(--red)' : 'var(--green)';
    }

    // Feature #19 — Meta mensal
    const metaBar = document.getElementById('meta-bar');
    const metaPct = document.getElementById('meta-pct');
    const metaVal = document.getElementById('meta-val');
    if (metaBar && d.meta > 0) {
      metaBar.style.width = d.meta_pct + '%';
      if (metaPct) metaPct.textContent = d.meta_pct.toFixed(0) + '%';
      if (metaVal) metaVal.textContent = fmt(d.faturamento) + ' / ' + fmt(d.meta);
      document.getElementById('meta-section')?.style.removeProperty('display');
    }

    // OS recentes
    const box = document.getElementById('dash-os-list'); if (!box) return;
    const recent = APP.os.slice(0, 8);
    if (!recent.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma OS ainda</div><button class="btn btn-primary mt-3" onclick="novaOS()">+ Nova OS</button></div>';
      return;
    }
    box.innerHTML = recent.map(o => _osCard(o)).join('');

    // Agenda
    const agb = document.getElementById('dash-agenda');
    if (agb && d.agenda_hoje.length) {
      agb.innerHTML = d.agenda_hoje.map(e => `
        <div class="agenda-item">
          <div class="agenda-dot" style="background:${e.cor || 'var(--blue)'}"></div>
          <div class="agenda-info">
            <div class="agenda-title">${_e(e.titulo)}</div>
            <div class="agenda-time">${e.hora || 'Dia todo'}${e.clientes?.nome ? ' · ' + _e(e.clientes.nome) : ''}</div>
          </div>
        </div>`).join('');
    } else if (agb) {
      agb.innerHTML = '<p style="font-size:.8rem;color:var(--text-3)">Sem compromissos hoje</p>';
    }
  } catch(e) { console.error('renderDash:', e); }
}

// Card de OS reutilizável
function _osCard(o) {
  const st = _normSt(o.status);
  const venc = o.garantia_dias && o.status === 'concluido' ? '' : '';
  return `<div class="os-item s-${st}" onclick="verOS('${o.id}')">
    <div class="osi-top">
      <div class="osi-num">OS #${o.numero || '?'}</div>
      <span class="sbadge sb-${st}">${statusLabel(o.status)}</span>
    </div>
    <div class="osi-name">${_e(o.clientes?.nome || o.cliente_nome || '–')}</div>
    <div class="osi-desc">${_e(o.equipamento || o.item || '')}${o.defeito ? ' · ' + _e(o.defeito.slice(0, 40)) : ''}</div>
    <div class="osi-meta">
      <span class="pay-pill pp-${o.forma_pagamento || ''}">${payLabel(o.forma_pagamento)}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${fmtDate(o.criado_em)}</span>
      <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);margin-left:auto">${fmt(o.valor_total)}</span>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ORDENS DE SERVIÇO — Lista
// ══════════════════════════════════════════════════════════════
let _osFilter = 'all';

function renderOS() {
  const box = document.getElementById('os-list'); if (!box) return;
  const q   = gv('os-search', '').toLowerCase();
  let list  = [...APP.os].filter(o => o.status !== 'orcamento');

  if (_osFilter !== 'all') list = list.filter(o => o.status === _osFilter);
  if (q) list = list.filter(o =>
    (o.clientes?.nome || o.cliente_nome || '').toLowerCase().includes(q) ||
    String(o.numero || '').includes(q) ||
    (o.equipamento || o.item || '').toLowerCase().includes(q)
  );

  const cnt = document.getElementById('os-count');
  if (cnt) cnt.textContent = list.length + ' registro' + (list.length !== 1 ? 's' : '');

  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">${APP.os.length ? 'Nenhuma OS neste filtro' : 'Nenhuma OS ainda'}</div>${!APP.os.length ? '<button class="btn btn-primary mt-3" onclick="novaOS()">+ Nova OS</button>' : ''}</div>`;
    return;
  }
  box.innerHTML = list.map(o => _osCard(o)).join('');
}

function setOsFilter(f, el) {
  _osFilter = f;
  document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  renderOS();
}

// ══════════════════════════════════════════════════════════════
// NOVA OS
// ══════════════════════════════════════════════════════════════
let _newItens = [], _newFotos = [], _curPay = '', _sigDraw = false, _sigLX = 0, _sigLY = 0;

// Compressão de foto — Feature #3: 500KB → 5MB aceito, comprime para ~800KB
async function comprimirFoto(file, maxKB = 800) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1600;
      let w = img.width, h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
        else        { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
      }
      const cv  = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      // Qualidade adaptativa
      let quality = 0.85;
      const tryCompress = () => {
        cv.toBlob(blob => {
          if (blob && blob.size > maxKB * 1024 && quality > 0.4) {
            quality -= 0.1;
            tryCompress();
          } else {
            const reader = new FileReader();
            reader.onload = e => res(e.target.result);
            reader.readAsDataURL(blob || new Blob());
          }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => rej(new Error('Falha ao carregar imagem'));
    img.src = url;
  });
}

// v5.1 — estado de edição e pagamento múltiplo
let _editOsId   = null;   // null = novo, id = editando
let _editOriginalItens = []; // cópia dos itens ANTES da edição, p/ reconciliar estoque
let _editOriginalAssinatura = null; // assinatura já salva, p/ não apagar se o usuário não redesenhar
let _multiPays  = [];     // [{ forma:'pix', valor:0 }, ...]

function novaOS(isOrcamento = false) {
  _editOsId  = null;
  _editOriginalItens = [];
  _editOriginalAssinatura = null;
  _newItens  = []; _newFotos = [];
  _multiPays = [];

  const campos = ['m-cli-search','m-cli-nome','m-cli-tel','m-cli-doc','m-equip','m-defeito',
                   'm-diag','m-obs','m-garantia-dias'];
  campos.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['m-mao-obra'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0'; });
  ['m-desconto'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0'; });

  const mid = document.getElementById('m-cli-id'); if (mid) mid.value = '';
  const dd  = document.getElementById('m-cli-dropdown'); if (dd) dd.style.display = 'none';

  document.getElementById('m-status').value = isOrcamento ? 'orcamento' : 'aguardando';
  document.getElementById('m-tipo').value   = isOrcamento ? 'orcamento' : 'servico';

  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  document.getElementById('carneConfig').style.display = 'none';
  document.getElementById('fiadoWarn').style.display   = 'none';
  document.getElementById('pix-qr-section').style.display = 'none';

  const box = document.getElementById('m-itens-rows');
  if (box) box.innerHTML = '<p style="font-size:12px;color:var(--text-3);padding:8px 4px">Nenhum item adicionado</p>';

  document.getElementById('m-total').textContent = 'R$ 0,00';
  const pg = document.getElementById('m-photo-grid'); if (pg) pg.innerHTML = '';

  renderMultiPay();
  setTipoOS(isOrcamento ? 'orcamento' : 'servico');

  const t = document.getElementById('nova-os-title');
  if (t) t.textContent = isOrcamento ? 'Novo Orçamento' : 'Nova OS';

  const btn = document.getElementById('btn-emitir-os');
  if (btn) btn.textContent = isOrcamento ? '📄 SALVAR ORÇAMENTO' : '✅ EMITIR ORDEM DE SERVIÇO';

  const md = document.getElementById('m-data');
  if (md) {
    const n = new Date();
    md.value = n.getFullYear() + '-' + pad(n.getMonth()+1) + '-' + pad(n.getDate()) +
               'T' + pad(n.getHours()) + ':' + pad(n.getMinutes());
  }

  goPage('nova-os');
  setTimeout(() => { initSig(); if (window.lucide) lucide.createIcons(); }, 150);
}

// v5.1 — Editar OS existente
async function editarOS(id) {
  const os = APP.os.find(o => o.id === id) || await API.getOSById(id, STATE.user.id).catch(() => null);
  if (!os) { UI.toast('OS não encontrada', 'error'); return; }

  _editOsId  = id;
  _newFotos  = [];
  _multiPays = [];
  try { _newFotos = JSON.parse(os.fotos || '[]'); } catch {}

  // Restaurar itens
  let itensArr = [];
  try { itensArr = JSON.parse(os.itens || '[]'); } catch {}
  _newItens = itensArr.map(i => ({
    desc: i.descricao || i.desc || '',
    qty:  i.quantidade || 1,
    preco: i.valor_unit || 0,
    produto_id: i.produto_id || null,
    preco_custo: i.preco_custo || 0,
  }));
  // v5.1 — snapshot dos itens originais (antes do usuário alterar), p/ reconciliar estoque ao salvar
  _editOriginalItens = JSON.parse(JSON.stringify(_newItens));
  _editOriginalAssinatura = os.assinatura || null;

  // Campos texto
  const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  sv('m-cli-nome',      os.clientes?.nome || os.cliente_nome || '');
  sv('m-cli-tel',       os.clientes?.telefone || '');
  sv('m-cli-doc',       os.clientes?.cpf || '');
  sv('m-cli-search',    os.clientes?.nome || os.cliente_nome || '');
  sv('m-cli-id',        os.cliente_id || '');
  sv('m-equip',         os.equipamento || os.item || '');
  sv('m-defeito',       os.defeito || '');
  sv('m-diag',          os.diagnostico || '');
  sv('m-obs',           os.observacoes || '');
  sv('m-mao-obra',      os.valor_mao_obra || '0');
  sv('m-desconto',      os.desconto_pct || '0');
  sv('m-garantia-dias', os.garantia_dias || '');
  sv('m-status',        os.status || 'aguardando');
  sv('m-tipo',          os.tipo || 'servico');

  // Data
  const md = document.getElementById('m-data');
  if (md && os.criado_em) {
    const d = new Date(os.criado_em);
    md.value = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }

  // Pagamento múltiplo ou simples
  if (os.pagamentos_multiplos) {
    try { _multiPays = JSON.parse(os.pagamentos_multiplos); } catch {}
  }
  if (!_multiPays.length && os.forma_pagamento && os.forma_pagamento !== 'aguardando') {
    _multiPays = [{ forma: os.forma_pagamento, valor: os.valor_total || 0 }];
  }

  renderOSItens();
  renderMultiPay();
  setTipoOS(os.tipo || 'servico');

  // Marcar chips
  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  _multiPays.forEach(p => {
    const chip = document.querySelector(`.pchip[onclick*="'${p.forma}'"]`);
    if (chip) chip.classList.add('p-active');
  });

  const t = document.getElementById('nova-os-title');
  if (t) t.textContent = `Editando OS #${os.numero || '–'}`;

  // v5.1 — indicar visualmente que já existe assinatura registrada
  const sigLbl = document.getElementById('sig-status-label');
  if (sigLbl) sigLbl.textContent = _editOriginalAssinatura ? '✅ Assinatura já registrada (toque para refazer)' : 'Toque para assinar';

  const btn = document.getElementById('btn-emitir-os');
  if (btn) { btn.innerHTML = '<i data-lucide="save" style="width:16px;height:16px"></i> SALVAR ALTERAÇÕES'; }

  const pg = document.getElementById('m-photo-grid');
  if (pg) pg.innerHTML = _newFotos.map((f, i) =>
    `<div class="photo-thumb"><img src="${f}"><button class="photo-del" onclick="_newFotos.splice(${i},1);editarOS('${id}')">✕</button></div>`).join('');

  goPage('nova-os');
  setTimeout(() => { initSig(); if (window.lucide) lucide.createIcons(); }, 150);
}

// v5.1 — Tipo de OS
function setTipoOS(tipo) {
  document.getElementById('m-tipo').value = tipo;
  ['servico','produto','misto','orcamento'].forEach(t => {
    const btn = document.getElementById('tbtn-' + t);
    if (btn) btn.classList.toggle('active', t === tipo);
  });

  // Equipamento/defeito visível só em serviço, misto, orçamento
  const cardEquip = document.getElementById('card-equip-os');
  if (cardEquip) cardEquip.style.display = tipo === 'produto' ? 'none' : 'block';

  // Mão de obra visível só em serviço, misto, orçamento
  const cardMO = document.getElementById('card-mao-obra-os');
  if (cardMO) cardMO.style.display = tipo === 'produto' ? 'none' : 'block';

  // Pagamento oculto em orçamento
  const cardPag = document.getElementById('card-pag-os');
  if (cardPag) cardPag.style.display = tipo === 'orcamento' ? 'none' : 'block';

  // Status automático
  const st = document.getElementById('m-status');
  if (st && tipo === 'orcamento' && st.value !== 'orcamento') st.value = 'orcamento';
  if (st && tipo !== 'orcamento' && st.value === 'orcamento') st.value = 'aguardando';

  // Texto do botão
  const btn = document.getElementById('btn-emitir-os');
  if (btn && !_editOsId) {
    const labels = { servico:'✅ EMITIR ORDEM DE SERVIÇO', produto:'✅ REGISTRAR VENDA',
                     misto:'✅ EMITIR ORDEM DE SERVIÇO', orcamento:'📄 SALVAR ORÇAMENTO' };
    btn.innerHTML = `<i data-lucide="check-circle" style="width:16px;height:16px"></i> ${labels[tipo] || 'SALVAR'}`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }
}

// v5.1 — Pagamento múltiplo
function togglePayChip(forma, el) {
  // Formas únicas (exclusivas): aguardando, fiado, carne → substituem tudo
  const exclusivas = ['aguardando','fiado','carne'];
  const isExclusiva = exclusivas.includes(forma);

  if (isExclusiva) {
    // Se já é a única selecionada, deseleciona
    if (_multiPays.length === 1 && _multiPays[0].forma === forma) {
      _multiPays = [];
    } else {
      _multiPays = [{ forma, valor: recalcTotalOS() }];
    }
  } else {
    // Remove formas exclusivas se existirem
    _multiPays = _multiPays.filter(p => !exclusivas.includes(p.forma));
    const idx = _multiPays.findIndex(p => p.forma === forma);
    if (idx >= 0) {
      _multiPays.splice(idx, 1);
    } else {
      // Se já tem uma forma, o novo recebe 0 pra usuário digitar
      const total = recalcTotalOS();
      const jaUsado = _multiPays.reduce((s, p) => s + (+p.valor || 0), 0);
      _multiPays.push({ forma, valor: Math.max(0, total - jaUsado) });
    }
  }

  // Atualiza chips
  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  _multiPays.forEach(p => {
    const chip = document.querySelector(`.pchip[onclick*="'${p.forma}'"]`);
    if (chip) chip.classList.add('p-active');
  });

  // Extras exclusivos
  document.getElementById('fiadoWarn').style.display    = _multiPays.some(p => p.forma==='fiado') ? 'block' : 'none';
  document.getElementById('carneConfig').style.display  = _multiPays.some(p => p.forma==='carne') ? 'block' : 'none';
  const temPix = _multiPays.some(p => p.forma==='pix');
  document.getElementById('pix-qr-section').style.display = temPix ? 'block' : 'none';
  if (temPix) setTimeout(() => gerarQRPix(), 300);
  if (_multiPays.some(p => p.forma==='carne')) calcCarne();

  renderMultiPay();
}

function renderMultiPay() {
  const box = document.getElementById('multi-pay-rows'); if (!box) return;
  if (!_multiPays.length) { box.innerHTML = ''; return; }

  const total = recalcTotalOS();
  const payEmojis = { dinheiro:'💵', pix:'📱', credito:'💳', debito:'💳',
                      transferencia:'🏦', fiado:'📝', carne:'📜', aguardando:'⏳' };

  box.innerHTML = _multiPays.map((p, i) => {
    const emoji = payEmojis[p.forma] || '💰';
    return `<div class="mpay-row">
      <div class="mpay-label">${emoji} ${payLabel(p.forma)}</div>
      <input type="number" class="form-control mpay-input" value="${(+p.valor || 0).toFixed(2)}"
             step="0.01" placeholder="R$"
             oninput="_multiPays[${i}].valor = parseFloat(this.value)||0; _atualizarTrocoMulti()">
      <button class="mpay-del" onclick="removerPay(${i})" title="Remover">✕</button>
    </div>`;
  }).join('');

  _atualizarTrocoMulti();
}

// v5.1 — remove uma forma de pagamento da lista (sem o bug de criar item fantasma)
function removerPay(i) {
  _multiPays.splice(i, 1);
  document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');
  _multiPays.forEach(p => {
    const chip = document.querySelector(`.pchip[onclick*="'${p.forma}'"]`);
    if (chip) chip.classList.add('p-active');
  });
  document.getElementById('fiadoWarn').style.display    = _multiPays.some(p => p.forma==='fiado') ? 'block' : 'none';
  document.getElementById('carneConfig').style.display  = _multiPays.some(p => p.forma==='carne') ? 'block' : 'none';
  document.getElementById('pix-qr-section').style.display = _multiPays.some(p => p.forma==='pix') ? 'block' : 'none';
  renderMultiPay();
}

function _atualizarTrocoMulti() {
  const total   = recalcTotalOS();
  const pago    = _multiPays.reduce((s, p) => s + (+p.valor || 0), 0);
  const troco   = pago - total;
  const warn    = document.getElementById('multi-pay-total-warn');
  if (!warn) return;
  if (_multiPays.length <= 1) { warn.style.display = 'none'; return; }
  warn.style.display = 'block';
  if (troco > 0.009)
    warn.innerHTML = `<span style="color:var(--green)">✅ Troco: ${fmt(troco)}</span>`;
  else if (troco < -0.009)
    warn.innerHTML = `⚠️ Falta: ${fmt(Math.abs(troco))}`;
  else
    warn.innerHTML = `<span style="color:var(--green)">✅ Valor exato!</span>`;
}

// Compatibilidade reversa (ainda chamado pelo PIX/carne internamente)
function setPay(p, el) { togglePayChip(p, el); }

function calcTrocoOS() {
  // mantida por chamadas legadas no carne
  _atualizarTrocoMulti();
}

// ── Itens ────────────────────────────────────────────────────
function addOSItem() {
  const desc  = gv('m-i-desc', '').trim();
  const qty   = gn('m-i-qty', 1) || 1;
  const preco = gn('m-i-preco', 0);
  if (!desc) { UI.toast('Descreva o item', 'warning'); return; }
  _newItens.push({ desc, qty, preco });
  document.getElementById('m-i-desc').value  = '';
  document.getElementById('m-i-qty').value   = '1';
  document.getElementById('m-i-preco').value = '';
  renderOSItens();
}

function renderOSItens() {
  const box = document.getElementById('m-itens-rows'); if (!box) return;
  if (!_newItens.length) {
    box.innerHTML = '<p style="font-size:12px;color:var(--text-3);padding:8px 4px;font-family:var(--mono)">Nenhum item</p>';
    recalcTotalOS(); return;
  }
  box.innerHTML = _newItens.map((it, i) => `
    <div class="it-row">
      <span style="font-size:13px">${_e(it.desc)}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">x${it.qty}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt(it.qty * it.preco)}</span>
      <button class="it-del" onclick="_newItens.splice(${i},1);renderOSItens()">✕</button>
    </div>`).join('');
  recalcTotalOS();
}

function recalcTotalOS() {
  const subtotal  = _newItens.reduce((a, i) => a + i.qty * i.preco, 0) + gn('m-mao-obra', 0);
  // Feature #11 — Desconto
  const descPct   = gn('m-desconto', 0);
  const descValor = subtotal * (descPct / 100);
  const total     = Math.max(0, subtotal - descValor);
  const el = document.getElementById('m-total'); if (el) el.textContent = fmt(total);
  const descEl = document.getElementById('m-desconto-val');
  if (descEl) descEl.textContent = descPct > 0 ? `Desconto: -${fmt(descValor)}` : '';
  return total;
}

function addDoEstoque() {
  const sel = APP.produtos.filter(p => p.quantidade > 0);
  if (!sel.length) { UI.toast('Estoque vazio', 'warning'); return; }
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">📦 Adicionar do Estoque</h3>
    ${sel.map(p => `
      <div class="prod-item" onclick="_addItemEst('${p.id}')">
        <div style="display:flex;justify-content:space-between">
          <span style="font-weight:600">${_e(p.nome)}</span>
          <span style="color:var(--green);font-family:var(--mono)">${fmt(p.preco_venda)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-2);font-family:var(--mono)">
          Estoque: ${p.quantidade} | Margem: ${calcMargem(p.preco_custo, p.preco_venda)}%
        </div>
      </div>`).join('')}
    <button class="btn btn-ghost btn-sm" onclick="closeModal()" style="margin-top:8px">← Fechar</button>`);
}

function _addItemEst(id) {
  const p = APP.produtos.find(x => x.id === id); if (!p) return;
  _newItens.push({ desc: p.nome, qty: 1, preco: p.preco_venda || 0, produto_id: id, preco_custo: p.preco_custo || 0 });
  closeModal();
  renderOSItens();
  UI.toast('Adicionado: ' + p.nome, 'success');
}

// Feature #17 — Precificação automática
function sugerirPreco() {
  const custo  = gn('form-prd-custo', 0);
  const margem = gn('form-prd-margem-sug', 30) || 30;
  if (!custo) { UI.toast('Digite o custo primeiro', 'warning'); return; }
  const venda = custo / (1 - margem / 100);
  const el = document.getElementById('form-prd-venda'); if (el) el.value = venda.toFixed(2);
  updMgPrd();
  UI.toast(`Preço sugerido com margem de ${margem}%`, 'success');
}

function calcCarne() {
  const total = recalcTotalOS();
  const n = gi('carneN', 3) || 3, dia = gi('carneDia', 10) || 10, ent = gn('carneEnt', 0);
  const parc = (total - ent) / n;
  const hoje = new Date(); let txt = '';
  for (let i = 1; i <= n; i++) {
    const cd = new Date(hoje.getFullYear(), hoje.getMonth() + i, dia);
    txt += `Parc ${i}/${n}: ${fmt(parc)} — ${fmtDate(cd.toISOString())}\n`;
  }
  const prev = document.getElementById('carnePreview');
  if (prev) prev.innerHTML = `<pre style="margin:0;white-space:pre-wrap">${txt}</pre>`;
}

// Feature #6 — QR Code PIX com valor real
function gerarQRPix() {
  const p     = STATE.perfil || {};
  const chave = p.pix;
  if (!chave) { document.getElementById('pix-qr-section').style.display = 'none'; return; }

  const total = recalcTotalOS();
  const txid  = 'OS' + Date.now().toString(36).toUpperCase().slice(-8);
  const brCode = gerarPixBRCode({
    chave,
    nome:   p.empresa_nome || 'NEXOS',
    cidade: p.cidade       || 'BRASIL',
    valor:  total,
    txid,
  });

  const qrEl = document.getElementById('pix-qr-canvas');
  if (qrEl && window.QRCode) {
    qrEl.innerHTML = '';
    new QRCode(qrEl, { text: brCode, width: 160, height: 160, colorDark: '#000000', colorLight: '#ffffff' });
  }

  const copyEl = document.getElementById('pix-copia-cola');
  if (copyEl) copyEl.value = brCode;
}

function copiarPixCode() {
  const el = document.getElementById('pix-copia-cola'); if (!el) return;
  navigator.clipboard.writeText(el.value).then(() => UI.toast('Código PIX copiado!', 'success'));
}

// ── Assinatura ───────────────────────────────────────────────
function initSig() {
  const cv = document.getElementById('sigCanvas'); if (!cv) return;
  const pr = window.devicePixelRatio || 1;
  cv.width  = cv.offsetWidth  * pr;
  cv.height = cv.offsetHeight * pr;
  const ctx = cv.getContext('2d');
  ctx.scale(pr, pr); ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const getP = e => {
    const r = cv.getBoundingClientRect();
    return e.touches ? { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }
                     : { x: e.clientX - r.left,              y: e.clientY - r.top };
  };
  cv.addEventListener('mousedown',  e => { _sigDraw = true; const p = getP(e); _sigLX = p.x; _sigLY = p.y; });
  cv.addEventListener('mousemove',  e => { if (!_sigDraw) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(_sigLX, _sigLY); ctx.lineTo(p.x, p.y); ctx.stroke(); _sigLX = p.x; _sigLY = p.y; });
  cv.addEventListener('mouseup',    () => _sigDraw = false);
  cv.addEventListener('touchstart', e => { e.preventDefault(); _sigDraw = true; const p = getP(e); _sigLX = p.x; _sigLY = p.y; }, { passive: false });
  cv.addEventListener('touchmove',  e => { e.preventDefault(); if (!_sigDraw) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(_sigLX, _sigLY); ctx.lineTo(p.x, p.y); ctx.stroke(); _sigLX = p.x; _sigLY = p.y; }, { passive: false });
  cv.addEventListener('touchend',   () => _sigDraw = false);
}
function clearSig() { const cv = document.getElementById('sigCanvas'); if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

// ── Fotos — Feature #3: Aceita até 5MB com compressão automática ──
const MAX_PHOTOS  = 9;
const MAX_MB_IN   = 5;
const ALLOWED_IMG = new Set(['image/png', 'image/jpeg', 'image/webp']);

function _isSafeDataUrl(url) {
  return typeof url === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(url);
}

async function handlePhotos(e) {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (_newFotos.length >= MAX_PHOTOS) { UI.toast('Limite de 9 fotos por OS', 'warning'); break; }
    if (!ALLOWED_IMG.has(f.type))        { UI.toast('Formato inválido. Use PNG, JPG ou WEBP', 'warning'); continue; }
    if (f.size > MAX_MB_IN * 1_000_000) { UI.toast(`Foto acima de ${MAX_MB_IN}MB`, 'warning'); continue; }
    try {
      UI.toast('Comprimindo foto...', 'info');
      const data = await comprimirFoto(f);
      if (!_isSafeDataUrl(data)) { UI.toast('Foto rejeitada por segurança', 'error'); continue; }
      _newFotos.push(data);
      renderPhotoGrid();
    } catch { UI.toast('Erro ao processar foto', 'error'); }
  }
  e.target.value = '';
}

function renderPhotoGrid() {
  const g = document.getElementById('m-photo-grid'); if (!g) return;
  g.innerHTML = _newFotos.map((f, i) => `
    <div class="photo-thumb">
      <img src="${_isSafeDataUrl(f) ? f : ''}" alt="Foto ${i+1}">
      <button class="rx" onclick="_newFotos.splice(${i},1);renderPhotoGrid()">✕</button>
    </div>`).join('');
}

// ── Salvar OS ────────────────────────────────────────────────
async function salvarOS() {
  const nome = _c(gv('m-cli-nome', '').trim(), 100);
  if (!nome) { UI.toast('Nome do cliente é obrigatório', 'warning'); return; }
  if (!_newItens.length && !gn('m-mao-obra', 0)) { UI.toast('Adicione ao menos 1 item ou mão de obra', 'warning'); return; }

  const status = gv('m-status', 'aguardando');
  // v5.1 — pagamento múltiplo: forma principal = primeira ou 'aguardando'
  const formasPrincipais = _multiPays.filter(p => p.forma !== 'aguardando');
  const formaPrincipal = formasPrincipais.length ? formasPrincipais[0].forma :
                          (_multiPays[0]?.forma || 'aguardando');

  if (status !== 'orcamento' && !_multiPays.length) {
    UI.toast('Selecione a forma de pagamento', 'warning'); return;
  }

  const totalItens = _newItens.reduce((a, i) => a + i.qty * i.preco, 0);
  const maoObra    = gn('m-mao-obra', 0);
  const subtotal   = totalItens + maoObra;
  const descPct    = gn('m-desconto', 0);
  const descValor  = subtotal * (descPct / 100);
  const total      = Math.max(0, subtotal - descValor);

  const sig     = document.getElementById('sigCanvas');
  let sigData   = sig && !isEmptySig(sig) ? sig.toDataURL('image/png') : null;
  // v5.1 — BUGFIX: ao editar, o canvas sempre abre vazio (não redesenhamos a
  // assinatura antiga nele). Sem isso, qualquer edição apagaria a assinatura
  // do cliente mesmo que o usuário só quisesse mudar o status/valor.
  if (!sigData && _editOsId && _editOriginalAssinatura) sigData = _editOriginalAssinatura;

  const garantiaDias = gi('m-garantia-dias', 0) || 0;

  // Carnê
  let carneData = null;
  if (_multiPays.some(p => p.forma === 'carne')) {
    const n   = gi('carneN', 3) || 3;
    const dia = gi('carneDia', 10) || 10;
    const ent = gn('carneEnt', 0);
    const parc = (total - ent) / n;
    const hoje = new Date();
    carneData = { total, entrada: ent, parcelas: n, valorParcela: parc, vencDia: dia, itens: [] };
    for (let ci = 1; ci <= n; ci++) {
      const cd = new Date(hoje.getFullYear(), hoje.getMonth() + ci, dia);
      carneData.itens.push({ num: ci, valor: parc, venc: cd.toISOString().slice(0, 10), status: 'pendente' });
    }
  }

  let clienteId = gv('m-cli-id', '') || null;
  const tel     = _c(gv('m-cli-tel', ''), 20);
  if (!clienteId && nome) {
    try {
      const nc = await API.saveCliente(STATE.user.id, { nome, telefone: tel, cpf: _c(gv('m-cli-doc', ''), 20) });
      clienteId = nc.id;
      APP.clientes.push(nc);
    } catch(e) { console.error('criar cli:', e); }
  }

  if (clienteId) {
    const cli = APP.clientes.find(c => c.id === clienteId);
    if (cli?.blacklist) {
      UI.confirm(`⛔ <b>${_e(cli.nome)}</b> está na blacklist.<br><br>Deseja continuar?`, async () => {
        await _finalizarSalvarOS({ nome, tel, clienteId, totalItens, maoObra, total, descPct, descValor, status, sigData, carneData, garantiaDias, formaPrincipal });
      });
      return;
    }
  }

  await _finalizarSalvarOS({ nome, tel, clienteId, totalItens, maoObra, total, descPct, descValor, status, sigData, carneData, garantiaDias, formaPrincipal });
}

async function _finalizarSalvarOS({ nome, tel, clienteId, totalItens, maoObra, total, descPct, descValor, status, sigData, carneData, garantiaDias, formaPrincipal }) {
  const isOrc = status === 'orcamento';
  const itensJSON = JSON.stringify(_newItens.map(i => ({
    descricao: i.desc, quantidade: i.qty, valor_unit: i.preco,
    produto_id: i.produto_id || null, preco_custo: i.preco_custo || 0,
  })));

  // v5.1 — pagamentos múltiplos serializado + valor_pago total
  const pagosTotal = _multiPays.reduce((s, p) => s + (+p.valor || 0), 0);

  const payload = {
    cliente_id: clienteId, cliente_nome: nome,
    equipamento: _c(gv('m-equip', ''), 200), item: _c(gv('m-equip', ''), 200),
    defeito:     _c(gv('m-defeito', ''), 500),
    diagnostico: _c(gv('m-diag', ''), 500),
    observacoes: _c(gv('m-obs', ''), 500),
    itens: itensJSON, valor_pecas: totalItens,
    valor_mao_obra: maoObra, valor_total: total,
    desconto_pct: descPct, desconto_valor: descValor,
    valor_pago: pagosTotal,
    forma_pagamento: formaPrincipal || 'aguardando',
    pagamentos_multiplos: _multiPays.length > 1 ? JSON.stringify(_multiPays) : null,
    status, tipo: gv('m-tipo', 'servico'),
    assinatura: sigData,
    fotos:      _newFotos.length ? JSON.stringify(_newFotos) : null,
    carne_data: carneData ? JSON.stringify(carneData) : null,
    garantia_dias: garantiaDias   || null,
    hash_doc: genHash(nome + total + Date.now()),
  };

  // v5.1 — BUGFIX: no CRIAR, removemos chaves vazias (evita inserir '' onde
  // o banco prefere null/default). No EDITAR isso é proibido: se removêssemos
  // a chave, o campo limpo pelo usuário (ex: apagar Observações, tirar garantia,
  // remover assinatura, voltar de pagamento múltiplo p/ único) NUNCA seria
  // atualizado no banco — o valor antigo ficaria preso pra sempre.
  if (!_editOsId) {
    Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === null) delete payload[k]; });
  }

  const btn = document.getElementById('btn-emitir-os');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    let saved;
    const isEdicao = !!_editOsId;

    if (isEdicao) {
      saved = await API.updateOS(_editOsId, STATE.user.id, payload);
      if (!saved) saved = { ...(APP.os.find(o => o.id === _editOsId) || {}), ...payload, id: _editOsId };
      await API.addHistorico(_editOsId, `OS editada. Status: ${statusLabel(status)}`);
      const idx = APP.os.findIndex(o => o.id === _editOsId);
      if (idx >= 0) APP.os[idx] = { ...APP.os[idx], ...saved };

      // v5.1 — Reconciliar ESTOQUE: devolve qtd dos itens originais, deduz qtd dos itens atuais.
      // Itens que não mudaram se cancelam (devolve e deduz o mesmo valor = sem efeito líquido).
      for (const it of _editOriginalItens) {
        if (it.produto_id) {
          const p = APP.produtos.find(x => x.id === it.produto_id);
          if (p) {
            p.quantidade = (p.quantidade || 0) + it.qty;
            await API.updateEstoque(STATE.user.id, it.produto_id, p.quantidade).catch(() => {});
          }
        }
      }
      for (const it of _newItens) {
        if (it.produto_id) {
          const p = APP.produtos.find(x => x.id === it.produto_id);
          if (p) {
            p.quantidade = Math.max(0, (p.quantidade || 0) - it.qty);
            await API.updateEstoque(STATE.user.id, it.produto_id, p.quantidade).catch(() => {});
          }
        }
      }

      // v5.1 — Reconciliar CAIXA: remove lançamentos antigos desta OS e relança com os valores/formas atuais
      if (!isOrc) {
        await window.sb.from('caixa').delete().eq('ordem_id', _editOsId).eq('dono_id', STATE.user.id).catch(() => {});
        const dia = today();
        for (const pg of _multiPays) {
          if (pg.forma === 'aguardando') continue;
          if (pg.forma === 'fiado') {
            await API.addCaixa(STATE.user.id, { tipo:'entrada', descricao:`Fiado - OS #${saved.numero} - ${nome}`, valor: 0, forma:'fiado', ordem_id: _editOsId, data: dia }).catch(() => {});
          } else if (pg.forma === 'carne') {
            if (carneData?.entrada > 0) await API.addCaixa(STATE.user.id, { tipo:'entrada', descricao:`Entrada carnê - OS #${saved.numero} - ${nome}`, valor: carneData.entrada, forma:'carne', ordem_id: _editOsId, data: dia }).catch(() => {});
          } else {
            const label = _multiPays.length > 1 ? ` (${payLabel(pg.forma)})` : '';
            await API.addCaixa(STATE.user.id, { tipo:'entrada', descricao:`OS #${saved.numero} - ${nome}${label}`, valor: +pg.valor || total, forma: pg.forma, ordem_id: _editOsId, data: dia }).catch(() => {});
          }
        }
      }

      UI.toast(`OS #${saved.numero || '–'} atualizada! ✅`, 'success');
    } else {
      saved = await API.createOS(STATE.user.id, payload);

      for (const it of _newItens) {
        if (it.produto_id) {
          const p = APP.produtos.find(x => x.id === it.produto_id);
          if (p && (p.quantidade || 0) >= it.qty) {
            const nq = (p.quantidade || 0) - it.qty;
            await API.updateEstoque(STATE.user.id, it.produto_id, nq);
            p.quantidade = nq;
          }
        }
      }

      if (!isOrc) {
        const dia = today();
        for (const pg of _multiPays) {
          if (pg.forma === 'aguardando') continue;
          if (pg.forma === 'fiado') {
            await API.addCaixa(STATE.user.id, { tipo:'entrada', descricao:`Fiado - OS #${saved.numero} - ${nome}`, valor: 0, forma:'fiado', ordem_id: saved.id, data: dia });
          } else if (pg.forma === 'carne') {
            if (carneData?.entrada > 0) await API.addCaixa(STATE.user.id, { tipo:'entrada', descricao:`Entrada carnê - OS #${saved.numero} - ${nome}`, valor: carneData.entrada, forma:'carne', ordem_id: saved.id, data: dia });
          } else {
            const label = _multiPays.length > 1 ? ` (${payLabel(pg.forma)})` : '';
            await API.addCaixa(STATE.user.id, { tipo:'entrada', descricao:`OS #${saved.numero} - ${nome}${label}`, valor: +pg.valor || total, forma: pg.forma, ordem_id: saved.id, data: dia });
          }
        }
        if (carneData) {
          for (const p of carneData.itens) {
            await window.sb.from('parcelas').insert({ dono_id: STATE.user.id, ordem_id: saved.id, numero: p.num, total: carneData.parcelas, valor: p.valor, vencimento: p.venc, pago: false }).catch(() => {});
          }
        }
      }

      APP.os.unshift(saved);
      UI.toast(`${isOrc ? 'Orçamento' : 'OS'} #${saved.numero} emitida! ✅`, 'success');
    }

    goBack();
    renderOS();
    if (!isEdicao && !isOrc) setTimeout(() => abrirComp(saved.id), 400);

  } catch(e) {
    UI.toast('Erro: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = _editOsId ? '💾 SALVAR ALTERAÇÕES' : '✅ EMITIR ORDEM DE SERVIÇO'; }
  }
}

// ══════════════════════════════════════════════════════════════
// VER OS — Detalhe
// ══════════════════════════════════════════════════════════════
async function verOS(id) {
  _verOsId = id;
  const os = APP.os.find(o => o.id === id) || await API.getOSById(id, STATE.user.id).catch(() => null);
  if (!os) { UI.toast('OS não encontrada', 'error'); return; }

  let itens = []; try { itens = JSON.parse(os.itens || '[]'); } catch {}
  let fotos = []; try { fotos = JSON.parse(os.fotos || '[]'); } catch {}
  let hist  = []; try { hist  = JSON.parse(os.historico || '[]'); } catch {}

  const nome = os.clientes?.nome || os.cliente_nome || '–';
  const tel  = os.clientes?.telefone || '';
  const st   = _normSt(os.status);

  const numEl  = document.getElementById('ver-os-num');    if (numEl)  numEl.textContent  = 'OS #' + (os.numero || '–');
  const stEl   = document.getElementById('ver-os-status'); if (stEl)   stEl.textContent   = statusLabel(os.status);

  // Feature #25 — Garantia
  let garantiaHtml = '';
  if (os.garantia_dias) {
    const g = await API.verificarGarantia(id);
    if (g) {
      garantiaHtml = `<div style="background:${g.valida ? 'rgba(52,211,153,.1)' : 'rgba(248,113,113,.1)'};border:1px solid ${g.valida ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)'};border-radius:var(--radius-md);padding:10px 14px;margin-bottom:10px;display:flex;gap:10px;align-items:center">
        <span style="font-size:1.2rem">${g.valida ? '🛡️' : '⚠️'}</span>
        <div>
          <div style="font-weight:600;font-size:.85rem">${g.valida ? 'Garantia ativa' : 'Garantia vencida'}</div>
          <div style="font-size:.75rem;color:var(--text-2)">Válida por ${g.dias} dias • Vence em ${fmtDate(g.vence_em)}</div>
        </div>
      </div>`;
    }
  }

  const itensH = itens.map(it => `
    <div class="it-row">
      <span style="font-size:13px">${_e(it.descricao || it.desc || '')}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">x${it.quantidade || 1}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt((it.quantidade || 1) * (it.valor_unit || 0))}</span>
      <span></span>
    </div>`).join('');

  const statusBtns = ['concluido','aguardando','andamento','retirada','cancelado','fiado'].map(s => `
    <button onclick="alterarStatusOS('${id}','${s}')" class="btn ${st === s ? 'btn-primary' : 'btn-ghost'} btn-sm">
      ${statusLabel(s)}
    </button>`).join('');

  const fotosH = fotos.length
    ? `<div class="card"><div class="card-title"><div class="ct-bar"></div>Fotos (${fotos.length})</div>
       <div class="photo-grid">${fotos.map((f, i) => `<div class="photo-thumb"><img src="${f}" onclick="verFoto('${id}',${i})"></div>`).join('')}</div></div>` : '';

  const sigH = os.assinatura
    ? `<div class="card"><div class="card-title"><div class="ct-bar"></div>Assinatura Digital</div>
       <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;text-align:center">
         <img src="${os.assinatura}" style="max-width:100%;max-height:60px">
         <div style="font-size:.72rem;color:var(--text-3);margin-top:4px;font-family:var(--mono)">${_e(nome)}</div>
       </div></div>` : '';

  const histH = hist.length
    ? hist.map(h => `<div class="hist-item"><div class="hist-dot"></div><div><div class="hist-time">${fDateFull(h.at || h.criado_em)}</div><div class="hist-txt">${_e(h.txt || h.texto || '')}</div></div></div>`).join('')
    : '<p style="font-size:.8rem;color:var(--text-3)">Sem histórico</p>';

  const body = document.getElementById('ver-os-body'); if (!body) return;
  body.innerHTML = `
    ${garantiaHtml}
    <div class="total-hl">
      <div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-3)">TOTAL</div>
        <div style="font-size:.82rem;color:var(--text-2)">${payLabel(os.forma_pagamento)}</div>
        ${(os.desconto_pct || 0) > 0 ? `<div style="font-size:.75rem;color:var(--red)">Desconto: ${os.desconto_pct}%</div>` : ''}
      </div>
      <div class="th-val">${fmt(os.valor_total)}</div>
    </div>

    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Cliente</div>
      <div class="ir"><span class="irl">Nome</span><span class="irv">${_e(nome)}</span></div>
      ${tel ? `<div class="ir"><span class="irl">Tel</span><span class="irv">${_e(tel)}</span></div>` : ''}
      <div class="ir"><span class="irl">Data</span><span class="irv">${fDateFull(os.criado_em)}</span></div>
      <div class="ir"><span class="irl">Tipo</span><span class="irv">${os.tipo || 'servico'}</span></div>
    </div>

    ${os.equipamento || os.item ? `
    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Equipamento</div>
      <div class="ir"><span class="irl">Equip.</span><span class="irv">${_e(os.equipamento || os.item || '')}</span></div>
      ${os.defeito    ? `<div class="ir"><span class="irl">Defeito</span><span class="irv">${_e(os.defeito)}</span></div>` : ''}
      ${os.diagnostico? `<div class="ir"><span class="irl">Diag.</span><span class="irv">${_e(os.diagnostico)}</span></div>` : ''}
    </div>` : ''}

    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Itens</div>
      ${itensH}
      ${(os.valor_mao_obra || 0) > 0 ? `<div class="it-row"><span>Mão de Obra</span><span></span><span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt(os.valor_mao_obra)}</span><span></span></div>` : ''}
      ${(os.desconto_valor || 0) > 0 ? `<div class="it-row"><span style="color:var(--red)">Desconto (${os.desconto_pct}%)</span><span></span><span style="font-family:var(--mono);font-size:11px;color:var(--red)">-${fmt(os.desconto_valor)}</span><span></span></div>` : ''}
      <div class="it-total-row"><span class="it-total-label">TOTAL</span><span class="it-total-val">${fmt(os.valor_total)}</span></div>
    </div>

    ${os.observacoes ? `<div class="card"><div class="card-title"><div class="ct-bar"></div>Observações</div><p style="font-size:14px;line-height:1.65">${_e(os.observacoes)}</p></div>` : ''}

    ${fotosH}${sigH}

    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Alterar Status</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${statusBtns}</div>
    </div>

    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Histórico / Notas</div>
      ${histH}
      <div class="form-group" style="margin-top:12px">
        <textarea id="nota-txt" class="form-control" placeholder="Adicionar nota..." rows="2"></textarea>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addNotaOS('${id}')">
        <i data-lucide="file-plus" style="width:13px;height:13px"></i> Salvar nota
      </button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <button class="btn btn-ghost" onclick="enviarWA('${id}')">
        <i data-lucide="message-circle" style="width:14px;height:14px"></i> WA
      </button>
      <button class="btn btn-ghost" onclick="gerarPDF('${id}')">
        <i data-lucide="file-text" style="width:14px;height:14px"></i> PDF
      </button>
      <button class="btn btn-ghost" onclick="imprimirTermico('${id}')">
        <i data-lucide="printer" style="width:14px;height:14px"></i> 58mm
      </button>
    </div>
    <button class="btn btn-ghost w-full" onclick="abrirComp('${id}')" style="margin-bottom:8px">
      <i data-lucide="receipt" style="width:14px;height:14px"></i> Ver Comprovante
    </button>
    <button class="btn btn-danger w-full" onclick="excluirOS('${id}')">
      <i data-lucide="trash-2" style="width:14px;height:14px"></i> Excluir OS
    </button>
    <div style="height:20px"></div>`;

  goPage('ver-os');
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

// Feature #7 — Mudança automática de status após pagamento PIX confirmado
async function confirmarPagamentoPIX(osId) {
  try {
    await API.updateOS(osId, STATE.user.id, { status: 'concluido', forma_pagamento: 'pix' });
    await API.addHistorico(osId, 'Pagamento PIX confirmado. Status alterado para Concluído.');
    await API.addCaixa(STATE.user.id, {
      tipo: 'entrada',
      descricao: 'Pagamento PIX confirmado',
      valor: APP.os.find(o => o.id === osId)?.valor_total || 0,
      forma: 'pix',
      ordem_id: osId,
    });
    const o = APP.os.find(o => o.id === osId); if (o) o.status = 'concluido';
    UI.toast('Pagamento PIX confirmado! OS marcada como Concluída ✅', 'success');
    if (_verOsId === osId) verOS(osId);
    renderOS();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function alterarStatusOS(id, novoStatus) {
  try {
    await API.updateOS(id, STATE.user.id, { status: novoStatus });
    await API.addHistorico(id, `Status alterado para: ${statusLabel(novoStatus)}`);
    const o = APP.os.find(o => o.id === id); if (o) o.status = novoStatus;
    UI.toast('Status atualizado!', 'success');
    renderOS(); renderDash();
    if (_verOsId === id) verOS(id);
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function addNotaOS(id) {
  const txt = _c(gv('nota-txt', '').trim(), 500);
  if (!txt) { UI.toast('Digite uma nota', 'warning'); return; }
  try { await API.addHistorico(id, txt); UI.toast('Nota salva!', 'success'); verOS(id); }
  catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function excluirOS(id) {
  UI.confirm('Excluir esta OS? Esta ação não pode ser desfeita.', async () => {
    try {
      await API.deleteOS(id, STATE.user.id);
      APP.os = APP.os.filter(o => o.id !== id);
      UI.toast('OS excluída!', 'success');
      goBack(); renderOS(); renderDash();
    } catch(e) { UI.toast('Erro ao excluir: ' + e.message, 'error'); }
  }, true);
}

function verFoto(osId, idx) {
  const os = APP.os.find(o => o.id === osId); if (!os) return;
  let f = []; try { f = JSON.parse(os.fotos || '[]'); } catch {}
  openModal(`<div style="text-align:center">
    <img src="${f[idx]}" style="max-width:100%;border-radius:12px">
    <div style="margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--text-2)">Foto ${idx+1}/${f.length}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="closeModal()">Fechar</button>
  </div>`);
}

// ══════════════════════════════════════════════════════════════
// COMPROVANTE / TEMPLATE — Feature #2
// ══════════════════════════════════════════════════════════════
let _compId = null;
// Templates: classico, moderno, minimalista
let _compTemplate = localStorage.getItem('nexos_comp_template') || 'classico';

function setCompTemplate(t) {
  _compTemplate = t;
  localStorage.setItem('nexos_comp_template', t);
  if (_compId) _renderComprovante(_compId);
}

function buildOSTemplate(os) {
  const p = STATE.perfil || {};
  let itens = []; try { itens = JSON.parse(os.itens || '[]'); } catch {}
  let fotos = []; try { fotos = JSON.parse(os.fotos || '[]'); } catch {}
  const nome = os.clientes?.nome || os.cliente_nome || '–';
  const tel  = os.clientes?.telefone || '';
  const st   = _normSt(os.status);
  const hash = os.hash_doc || genHash(os.id + (os.valor_total || 0));
  const qrId = 'qr' + Date.now();

  const itensH = itens.map(it =>
    `<div class="comp-item-r"><span>${_e(it.descricao || it.desc || '')} (x${it.quantidade || 1})</span><span><b>${fmt((it.quantidade || 1) * (it.valor_unit || 0))}</b></span></div>`
  ).join('');

  const fotosH = fotos.length
    ? `<div class="comp-sec">Fotos</div><div class="comp-photos">${fotos.slice(0, 6).map(f => `<img src="${f}" crossorigin="anonymous">`).join('')}</div>` : '';

  // Estilos por template
  const tplStyles = {
    classico:    'font-family:Georgia,serif;',
    moderno:     'font-family:Inter,sans-serif;',
    minimalista: 'font-family:monospace;border:none;',
  };
  const tplStyle = tplStyles[_compTemplate] || tplStyles.classico;

  const logoHtml = p.logo_url
    ? `<img src="${p.logo_url}" alt="Logo" style="height:48px;object-fit:contain;margin-bottom:6px">` : '';

  const html = `
  <div class="comp-paper" id="compPaper" style="${tplStyle}">
    <div class="comp-header">
      ${logoHtml}
      <div class="comp-store">${_e(p.empresa_nome || 'NexOS')}</div>
      ${p.cnpj    ? `<div class="comp-sub">CNPJ: ${_e(p.cnpj)}</div>`    : ''}
      ${p.endereco? `<div class="comp-sub">${_e(p.endereco)}</div>`       : ''}
      ${p.telefone? `<div class="comp-sub">${_e(p.telefone)}</div>`       : ''}
    </div>
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:2px;text-transform:uppercase">ORDEM DE SERVIÇO</div>
      <div class="comp-os-num">#${os.numero || '–'}</div>
      <div class="comp-date">${fDateFull(os.criado_em)}</div>
      <div style="margin-top:6px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        <span style="background:${statusBgColor(st)};color:#fff;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase">${statusLabel(os.status)}</span>
        <span style="background:#eee;color:#555;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">${payLabel(os.forma_pagamento)}</span>
      </div>
    </div>
    <div class="comp-sec">Cliente</div>
    <div class="comp-row"><span>Nome</span><span><b>${_e(nome)}</b></span></div>
    ${tel ? `<div class="comp-row"><span>Tel</span><span>${_e(tel)}</span></div>` : ''}
    ${os.equipamento || os.item ? `
      <div class="comp-sec">Equipamento</div>
      <div class="comp-row"><span>Equip.</span><span>${_e(os.equipamento || os.item || '')}</span></div>
      ${os.defeito ? `<div class="comp-row"><span>Defeito</span><span>${_e(os.defeito)}</span></div>` : ''}
      ${os.diagnostico ? `<div class="comp-row"><span>Diag.</span><span>${_e(os.diagnostico)}</span></div>` : ''}` : ''}
    <div class="comp-sec">Itens</div>
    <div class="comp-items">
      ${itensH}
      ${(os.valor_mao_obra || 0) > 0 ? `<div class="comp-item-r"><span>Mão de Obra</span><span><b>${fmt(os.valor_mao_obra)}</b></span></div>` : ''}
      ${(os.desconto_pct   || 0) > 0 ? `<div class="comp-item-r"><span style="color:#e74c3c">Desconto (${os.desconto_pct}%)</span><span style="color:#e74c3c">-${fmt(os.desconto_valor)}</span></div>` : ''}
    </div>
    <div class="comp-total"><span>TOTAL</span><span>${fmt(os.valor_total)}</span></div>
    ${(os.valor_pago || 0) > 0 ? `<div class="comp-row"><span>Pago</span><span>${fmt(os.valor_pago)}</span></div>` : ''}
    ${(os.garantia_dias || 0) > 0 ? `<div class="comp-row"><span>🛡️ Garantia</span><span>${os.garantia_dias} dias</span></div>` : ''}
    ${os.observacoes ? `<div class="comp-sec">Observações</div><div style="font-size:12px;color:#555;line-height:1.6;margin-bottom:8px">${_e(os.observacoes)}</div>` : ''}
    ${fotosH}
    ${os.assinatura ? `
      <div class="comp-sec">Assinatura</div>
      <div style="border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;margin-bottom:8px">
        <img src="${os.assinatura}" crossorigin="anonymous" style="max-width:100%;max-height:55px">
        <div style="font-size:10px;color:#888;margin-top:3px">${_e(nome)}</div>
      </div>` : ''}
    ${p.termos ? `<div class="comp-terms">${_e(p.termos)}</div>` : ''}
    <div class="comp-footer">
      <div id="${qrId}" style="display:flex;justify-content:center;margin-bottom:8px"></div>
      <div><b>Código de Verificação</b></div>
      <div class="comp-hash">OS: #${os.numero} | HASH: ${hash} | ${fDateFull(os.criado_em)}</div>
      ${p.pix ? `<div style="margin-top:7px"><b>PIX:</b> ${_e(p.pix)}</div>` : ''}
      <div style="margin-top:8px">Obrigado pela preferência! 🙏</div>
    </div>
  </div>`;

  return { html, qrId, hash };
}

function _renderComprovante(id) {
  const os = APP.os.find(o => o.id === id); if (!os) return null;
  const { html, qrId, hash } = buildOSTemplate(os);
  document.getElementById('compContent').innerHTML = html;
  setTimeout(() => {
    try {
      const el = document.getElementById(qrId);
      if (el && window.QRCode) new QRCode(el, { text: 'OS:#' + os.numero + '|HASH:' + hash, width: 80, height: 80, colorDark: '#1a6cf0', colorLight: '#ffffff' });
    } catch {}
  }, 200);
  return os;
}

function abrirComp(id) { _compId = id; if (!_renderComprovante(id)) return; document.getElementById('compView').classList.add('open'); }
function fecharComp()  { document.getElementById('compView').classList.remove('open'); }

// Feature #36 — Impressão Térmica (58mm / 80mm)
function imprimirTermico(id) {
  const os = APP.os.find(o => o.id === id); if (!os) return;
  const p  = STATE.perfil || {};
  let itens = []; try { itens = JSON.parse(os.itens || '[]'); } catch {}
  const nome = os.clientes?.nome || os.cliente_nome || '–';
  const linha = '--------------------------------';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    * { margin:0;padding:0;box-sizing:border-box; }
    body { font-family:monospace;font-size:10px;width:58mm;color:#000;background:#fff; }
    .center { text-align:center; }
    .bold   { font-weight:bold; }
    .right  { text-align:right; }
    .linha  { border-top:1px dashed #000;margin:4px 0; }
    @media print { @page { size:58mm auto;margin:2mm; } }
  </style></head><body>
  <div class="center bold" style="font-size:12px">${_e(p.empresa_nome || 'NexOS')}</div>
  ${p.telefone ? `<div class="center">${_e(p.telefone)}</div>` : ''}
  ${p.endereco ? `<div class="center">${_e(p.endereco)}</div>` : ''}
  <div class="linha"></div>
  <div class="center bold">ORDEM DE SERVIÇO #${os.numero}</div>
  <div class="center">${fDateFull(os.criado_em)}</div>
  <div class="linha"></div>
  <div>Cliente: ${_e(nome)}</div>
  ${os.equipamento ? `<div>Equip: ${_e(os.equipamento)}</div>` : ''}
  ${os.defeito     ? `<div>Defeito: ${_e(os.defeito.slice(0,40))}</div>` : ''}
  <div class="linha"></div>
  ${itens.map(it => `<div style="display:flex;justify-content:space-between"><span>${_e((it.descricao||it.desc||'').slice(0,22))} x${it.quantidade||1}</span><span>${fmt((it.quantidade||1)*(it.valor_unit||0))}</span></div>`).join('')}
  ${(os.valor_mao_obra||0)>0 ? `<div style="display:flex;justify-content:space-between"><span>Mao de Obra</span><span>${fmt(os.valor_mao_obra)}</span></div>` : ''}
  ${(os.desconto_pct||0)>0   ? `<div style="display:flex;justify-content:space-between"><span>Desconto ${os.desconto_pct}%</span><span>-${fmt(os.desconto_valor)}</span></div>` : ''}
  <div class="linha"></div>
  <div style="display:flex;justify-content:space-between" class="bold"><span>TOTAL</span><span>${fmt(os.valor_total)}</span></div>
  <div>Pgto: ${payLabel(os.forma_pagamento)}</div>
  ${os.garantia_dias ? `<div>Garantia: ${os.garantia_dias} dias</div>` : ''}
  ${p.termos ? `<div class="linha"></div><div style="font-size:9px">${_e(p.termos.slice(0,200))}</div>` : ''}
  <div class="linha"></div>
  <div class="center">Obrigado pela preferencia!</div>
  <div class="center" style="font-size:9px">Hash: ${(os.hash_doc||'').slice(0,16)}</div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=300,height=600');
  if (!w) { UI.toast('Permita popups para imprimir', 'warning'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); w.close(); }, 500);
}

async function compartilharComp() {
  const os = APP.os.find(o => o.id === _compId); if (!os) return;
  const el = document.getElementById('compPaper');
  if (!el || !window.html2canvas) { enviarWA(_compId); return; }
  try {
    UI.toast('Preparando imagem...', 'info');
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    canvas.toBlob(async blob => {
      if (!blob) { UI.toast('Erro ao gerar imagem', 'error'); return; }
      const file = new File([blob], `OS_${os.numero}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title: `OS #${os.numero}`, files: [file] }); }
        catch(e) { if (e.name !== 'AbortError') { _downloadBlob(blob, `OS_${os.numero}.png`); UI.toast('Imagem salva!', 'success'); } }
      } else {
        _downloadBlob(blob, `OS_${os.numero}.png`);
        UI.toast('Imagem salva! Compartilhe pelo app de fotos.', 'success');
      }
    }, 'image/png');
  } catch(e) { UI.toast('Erro ao compartilhar', 'error'); }
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// Feature #10 — Relatório mensal em PDF
async function gerarRelatorioPDF() {
  const mes = today().slice(0, 7);
  UI.toast('Gerando relatório...', 'info');
  try {
    const [os, caixa] = await Promise.all([
      API.getOS(STATE.user.id),
      API.getCaixa(STATE.user.id, mes + '-01', new Date(+mes.split('-')[0], +mes.split('-')[1], 0).toISOString().slice(0,10)),
    ]);
    const osMes  = os.filter(o => (o.criado_em || '').startsWith(mes));
    const ent    = caixa.filter(c => c.tipo === 'entrada').reduce((a, c) => a + (c.valor || 0), 0);
    const said   = caixa.filter(c => c.tipo === 'saida').reduce((a, c) => a + (c.valor || 0), 0);
    const p      = STATE.perfil || {};

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{font-family:sans-serif;margin:30px;color:#111} h1{color:#0ea5e9} table{width:100%;border-collapse:collapse;font-size:12px} th,td{padding:6px;border:1px solid #ddd;text-align:left} th{background:#f1f5f9}</style>
    </head><body>
    <h1>${_e(p.empresa_nome||'NexOS')} — Relatório ${mes}</h1>
    <p>Gerado em ${fDateFull(nowISO())}</p>
    <h3>Resumo Financeiro</h3>
    <table><tr><th>Item</th><th>Valor</th></tr>
    <tr><td>Faturamento</td><td>${fmt(ent)}</td></tr>
    <tr><td>Saídas</td><td>${fmt(said)}</td></tr>
    <tr><td><b>Lucro</b></td><td><b>${fmt(ent-said)}</b></td></tr>
    </table>
    <h3 style="margin-top:20px">OS do Mês (${osMes.length})</h3>
    <table><tr><th>#</th><th>Cliente</th><th>Status</th><th>Total</th><th>Data</th></tr>
    ${osMes.map(o=>`<tr><td>#${o.numero}</td><td>${_e(o.clientes?.nome||o.cliente_nome||'–')}</td><td>${statusLabel(o.status)}</td><td>${fmt(o.valor_total)}</td><td>${fmtDate(o.criado_em)}</td></tr>`).join('')}
    </table>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { UI.toast('Permita popups', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
    UI.toast('Relatório pronto!', 'success');
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

function enviarWA(id) {
  const os = APP.os.find(o => o.id === id); if (!os) return;
  const p  = STATE.perfil || {};
  let itens = []; try { itens = JSON.parse(os.itens || '[]'); } catch {}
  const nome    = os.clientes?.nome || os.cliente_nome || '–';
  const tel     = os.clientes?.telefone || '';
  const hash    = os.hash_doc || genHash(id + (os.valor_total || 0));
  const itensMsg= itens.map(it => `- ${it.descricao||it.desc||''} x${it.quantidade||1} = ${fmt((it.quantidade||1)*(it.valor_unit||0))}`).join('\n');
  const msg     = `*${p.empresa_nome||'NexOS'}*\n\nOS #${os.numero}\n*${nome}*\n${fDateFull(os.criado_em)}\n\nItens:\n${itensMsg}${(os.valor_mao_obra||0)>0?`\nMão de Obra: ${fmt(os.valor_mao_obra)}`:''}\n\n*TOTAL: ${fmt(os.valor_total)}*\n${payLabel(os.forma_pagamento)} | ${statusLabel(os.status)}${p.pix?'\nPIX: '+p.pix:''}${p.telefone?'\n'+p.telefone:''}\n\nHash: ${hash}`;
  window.open(API.buildWALink(tel, msg), '_blank');
}

async function gerarPDF(id) {
  const os = APP.os.find(o => o.id === id) || await API.getOSById(id, STATE.user.id).catch(() => null);
  if (!os) { UI.toast('OS não encontrada', 'error'); return; }
  if (!window.html2canvas || !window.jspdf) { UI.toast('Biblioteca não carregou. Recarregue a página.', 'error'); return; }
  _compId = id; _renderComprovante(id);
  await new Promise(r => setTimeout(r, 350));
  const el = document.getElementById('compPaper'); if (!el) { UI.toast('Erro ao gerar PDF', 'error'); return; }
  UI.toast('Gerando PDF...', 'info');
  try {
    const canvas  = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const imgH = W / (canvas.width / canvas.height);
    if (imgH <= H) {
      doc.addImage(imgData, 'PNG', 0, 0, W, imgH);
    } else {
      let rem = imgH, posY = 0;
      while (rem > 0) { doc.addImage(imgData, 'PNG', 0, -posY, W, imgH); rem -= H; posY += H; if (rem > 0) doc.addPage(); }
    }
    const nome = os.clientes?.nome || os.cliente_nome || 'os';
    doc.save('OS_' + os.numero + '_' + nome.replace(/\s+/g, '_') + '.pdf');
    UI.toast('PDF gerado! ✅', 'success');
  } catch(e) { UI.toast('Erro ao gerar PDF: ' + e.message, 'error'); }
}

async function salvarComoImagem() {
  const el = document.getElementById('compPaper');
  if (!el || !window.html2canvas) { UI.toast('Abra o comprovante primeiro', 'error'); return; }
  UI.toast('Gerando imagem...', 'info');
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const os = APP.os.find(o => o.id === _compId);
    canvas.toBlob(blob => { _downloadBlob(blob, 'OS_' + (os?.numero || 'comprovante') + '.png'); UI.toast('Imagem salva! ✅', 'success'); }, 'image/png');
  } catch(e) { UI.toast('Erro ao gerar imagem', 'error'); }
}

// ══════════════════════════════════════════════════════════════
// ORÇAMENTOS — Feature #13
// ══════════════════════════════════════════════════════════════
async function renderOrcamentos() {
  const box = document.getElementById('orc-list'); if (!box) return;
  try {
    const orcs = await API.getOrcamentos(STATE.user.id);
    if (!orcs.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Nenhum orçamento</div><button class="btn btn-primary mt-3" onclick="novoOrcamento()">+ Novo Orçamento</button></div>';
      return;
    }
    box.innerHTML = orcs.map(o => `
      <div class="card" style="cursor:pointer;padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:.75rem;color:var(--text-3);font-family:var(--mono)">ORÇAMENTO #${o.numero || '–'}</div>
            <div style="font-size:.95rem;font-weight:700">${_e(o.clientes?.nome || o.cliente_nome || '–')}</div>
            <div style="font-size:.78rem;color:var(--text-2)">${_e(o.equipamento || o.item || '')}${o.defeito ? ' · ' + _e(o.defeito.slice(0, 30)) : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:1rem;font-weight:700;color:var(--green)">${fmt(o.valor_total)}</div>
            <div style="font-size:.72rem;color:var(--text-3)">${fmtDate(o.criado_em)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="aprovarOrcamento('${o.id}')">✅ Aprovar → OS</button>
          <button class="btn btn-ghost btn-sm" onclick="verOS('${o.id}')">Ver</button>
          <button class="btn btn-danger btn-sm" onclick="recusarOrcamento('${o.id}')">✕</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('renderOrcamentos:', e); }
}

function novoOrcamento() { novaOS(true); }

async function aprovarOrcamento(id) {
  UI.confirm('Aprovar este orçamento? Ele será convertido em OS.', async () => {
    try {
      await API.aprovarOrcamento(id, STATE.user.id);
      await API.addHistorico(id, 'Orçamento aprovado. Convertido em OS.');
      const o = APP.os.find(x => x.id === id); if (o) o.status = 'aguardando';
      UI.toast('Orçamento aprovado! OS criada ✅', 'success');
      renderOrcamentos(); renderOS();
    } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
  });
}

async function recusarOrcamento(id) {
  UI.confirm('Recusar este orçamento?', async () => {
    try {
      await API.recusarOrcamento(id, STATE.user.id);
      const o = APP.os.find(x => x.id === id); if (o) o.status = 'cancelado';
      UI.toast('Orçamento recusado.', 'info');
      renderOrcamentos();
    } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
  }, true);
}

// ══════════════════════════════════════════════════════════════
// CLIENTES — Feature #32 Blacklist
// ══════════════════════════════════════════════════════════════
function renderClientes() {
  const box = document.getElementById('cli-list'); if (!box) return;
  const q   = gv('cli-search', '').toLowerCase();
  const list = APP.clientes.filter(c =>
    !q || c.nome.toLowerCase().includes(q) ||
    (c.telefone || '').includes(q) ||
    (c.email    || '').toLowerCase().includes(q)
  );
  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">${q ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</div></div>`;
    return;
  }
  box.innerHTML = list.map(c => `
    <div class="card" style="cursor:pointer;padding:13px 15px;${c.blacklist ? 'border-left:3px solid var(--red)' : ''}" onclick="verCliente('${c.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;margin-bottom:3px">
            ${c.blacklist ? '⛔ ' : ''}${_e(c.nome)}
            ${c.aniversario && c.aniversario.slice(5) === today().slice(5) ? ' 🎂' : ''}
          </div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-2)">
            ${c.telefone ? '📱 ' + _e(c.telefone) : ''}${c.email ? ' · ' + _e(c.email) : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">
          <button onclick="event.stopPropagation();toggleBlacklist('${c.id}')" style="background:none;border:none;color:${c.blacklist?'var(--red)':'var(--text-3)'};cursor:pointer;padding:6px" title="Blacklist">
            <i data-lucide="slash" style="width:15px;height:15px"></i>
          </button>
          <button onclick="event.stopPropagation();editarCliente('${c.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;padding:6px">
            <i data-lucide="edit-2" style="width:15px;height:15px"></i>
          </button>
          <button onclick="excluirCliente(event,'${c.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;padding:6px">
            <i data-lucide="trash-2" style="width:15px;height:15px"></i>
          </button>
        </div>
      </div>
    </div>`).join('');
  if (window.lucide) lucide.createIcons();
}

async function toggleBlacklist(id) {
  const c = APP.clientes.find(x => x.id === id); if (!c) return;
  const novo = !c.blacklist;
  UI.confirm(
    novo ? `Adicionar <b>${_e(c.nome)}</b> à blacklist? Um alerta aparecerá ao criar nova OS.`
         : `Remover <b>${_e(c.nome)}</b> da blacklist?`,
    async () => {
      try {
        await API.saveCliente(STATE.user.id, { ...c, blacklist: novo });
        c.blacklist = novo;
        UI.toast(novo ? '⛔ Cliente na blacklist' : 'Cliente removido da blacklist', novo ? 'warning' : 'success');
        renderClientes();
      } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
    }
  );
}

function novoCliente() {
  ['form-cli-id','form-cli-nome','form-cli-tel','form-cli-doc','form-cli-email','form-cli-end','form-cli-aniv'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const bl = document.getElementById('form-cli-blacklist'); if (bl) bl.checked = false;
  const t  = document.getElementById('form-cli-title');     if (t)  t.textContent = 'Novo Cliente';
  goPage('novo-cliente');
}

function editarCliente(id) {
  const c = APP.clientes.find(x => x.id === id); if (!c) return;
  document.getElementById('form-cli-id').value   = c.id;
  document.getElementById('form-cli-nome').value = c.nome;
  document.getElementById('form-cli-tel').value  = c.telefone  || '';
  document.getElementById('form-cli-doc').value  = c.cpf       || '';
  const em = document.getElementById('form-cli-email'); if (em) em.value = c.email     || '';
  const en = document.getElementById('form-cli-end');   if (en) en.value = c.endereco  || '';
  const av = document.getElementById('form-cli-aniv');  if (av) av.value = c.aniversario|| '';
  const bl = document.getElementById('form-cli-blacklist'); if (bl) bl.checked = !!c.blacklist;
  const t  = document.getElementById('form-cli-title'); if (t) t.textContent = 'Editar Cliente';
  goPage('novo-cliente');
}

async function salvarCliente() {
  const nome = _c(gv('form-cli-nome', '').trim(), 100);
  if (!nome) { UI.toast('Nome obrigatório', 'warning'); return; }
  const bl = document.getElementById('form-cli-blacklist');
  const d  = {
    id:        gv('form-cli-id', '')    || undefined,
    nome,
    telefone:  _c(gv('form-cli-tel',   ''), 20),
    cpf:       _c(gv('form-cli-doc',   ''), 20),
    email:     _c(gv('form-cli-email', ''), 100),
    endereco:  _c(gv('form-cli-end',   ''), 200),
    aniversario: gv('form-cli-aniv', '') || null,
    blacklist: bl?.checked || false,
  };
  try {
    const saved = await API.saveCliente(STATE.user.id, d);
    if (d.id) { const i = APP.clientes.findIndex(x => x.id === d.id); if (i !== -1) APP.clientes[i] = saved; }
    else APP.clientes.push(saved);
    UI.toast('Cliente salvo!', 'success');
    goBack(); renderClientes();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function excluirCliente(e, id) {
  e.stopPropagation();
  UI.confirm('Excluir este cliente?', async () => {
    try {
      await API.deleteCliente(STATE.user.id, id);
      APP.clientes = APP.clientes.filter(c => c.id !== id);
      UI.toast('Cliente excluído!', 'success'); renderClientes();
    } catch(err) { UI.toast('Erro: ' + err.message, 'error'); }
  }, true);
}

// ══════════════════════════════════════════════════════════════
// ESTOQUE — Feature #17 Precificação automática
// ══════════════════════════════════════════════════════════════
function renderEstoque() {
  const box = document.getElementById('est-list'); if (!box) return;
  const q   = gv('est-search', '').toLowerCase();
  const list = APP.produtos.filter(p => p.ativo !== false && (!q || p.nome.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q)));
  if (!list.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">Nenhum produto</div><button class="btn btn-primary mt-3" onclick="novoProduto()">+ Novo Produto</button></div>';
    return;
  }
  box.innerHTML = list.map(p => `
    <div class="prod-item" onclick="editarProduto('${p.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <div>
          <div style="font-size:14px;font-weight:600">${_e(p.nome)}</div>
          ${p.codigo ? `<div style="font-family:monospace;font-size:10px;color:var(--text-2)">#${_e(p.codigo)}</div>` : ''}
        </div>
        <div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--green)">${fmt(p.preco_venda)}</div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <span style="font-family:monospace;font-size:11px;color:${(p.quantidade||0)<=(p.estoque_min||0)?'var(--red)':'var(--green)'}">
          Est: ${p.quantidade || 0} (min:${p.estoque_min || 0})
        </span>
        ${p.preco_custo > 0 ? `<span style="font-family:monospace;font-size:11px;color:var(--blue)">Mg: ${calcMargem(p.preco_custo, p.preco_venda)}%</span>` : ''}
        <span style="font-family:monospace;font-size:11px;color:var(--text-2)">Custo: ${fmt(p.preco_custo)}</span>
      </div>
    </div>`).join('');
}

function novoProduto() {
  ['form-prd-id','form-prd-nome','form-prd-cod','form-prd-custo','form-prd-venda'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('form-prd-qtd').value = '0';
  document.getElementById('form-prd-min').value = '0';
  const t = document.getElementById('form-prd-title'); if (t) t.textContent = 'Novo Produto';
  const r = document.getElementById('prd-resumo');   if (r) r.style.display = 'none';
  goPage('novo-produto');
}

function editarProduto(id) {
  const p = APP.produtos.find(x => x.id === id); if (!p) return;
  document.getElementById('form-prd-id').value    = p.id;
  document.getElementById('form-prd-nome').value  = p.nome;
  document.getElementById('form-prd-cod').value   = p.codigo || '';
  document.getElementById('form-prd-custo').value = p.preco_custo || 0;
  document.getElementById('form-prd-venda').value = p.preco_venda || 0;
  document.getElementById('form-prd-qtd').value   = p.quantidade  || 0;
  document.getElementById('form-prd-min').value   = p.estoque_min || 0;
  const t = document.getElementById('form-prd-title'); if (t) t.textContent = 'Editar Produto';
  const r = document.getElementById('prd-resumo');
  if (r) {
    r.style.display = 'block';
    document.getElementById('res-venda').textContent = fmt(p.preco_venda);
    document.getElementById('res-custo').textContent = fmt(p.preco_custo);
    document.getElementById('res-mg').textContent    = calcMargem(p.preco_custo, p.preco_venda) + '%';
    const estEl = document.getElementById('res-est');
    if (estEl) { estEl.textContent = p.quantidade || 0; estEl.style.color = (p.quantidade || 0) <= (p.estoque_min || 0) ? 'var(--red)' : 'var(--green)'; }
  }
  goPage('novo-produto');
  setTimeout(updMgPrd, 50);

  // Feature #20 — Botão ver histórico de preços
  const histBtn = document.getElementById('btn-hist-precos');
  if (histBtn) { histBtn.style.display = 'block'; histBtn.onclick = () => verHistoricoPrecos(id); }
}

function updMgPrd() {
  const c = parseFloat(gv('form-prd-custo', 0));
  const v = parseFloat(gv('form-prd-venda', 0));
  const el = document.getElementById('mg-prev');
  if (el && c > 0 && v > 0) el.textContent = 'Margem: ' + calcMargem(c, v) + '% | Lucro: ' + fmt(v - c);
  else if (el) el.textContent = '';
}

async function salvarProduto() {
  const nome = _c(gv('form-prd-nome', '').trim(), 100);
  if (!nome) { UI.toast('Nome obrigatório', 'warning'); return; }
  const d = {
    id: gv('form-prd-id', '') || undefined,
    nome, codigo: _c(gv('form-prd-cod', ''), 50),
    preco_custo: gv('form-prd-custo', 0),
    preco_venda: gv('form-prd-venda', 0),
    quantidade:  gi('form-prd-qtd', 0),
    estoque_min: gi('form-prd-min', 0),
  };
  try {
    const saved = await API.saveProduto(STATE.user.id, d);
    if (d.id) { const i = APP.produtos.findIndex(x => x.id === d.id); if (i !== -1) APP.produtos[i] = saved; }
    else APP.produtos.push(saved);
    UI.toast('Produto salvo!', 'success'); goBack(); renderEstoque();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

// Feature #20 — Ver histórico de preços
async function verHistoricoPrecos(produtoId) {
  const hist = await API.getHistoricoPrecos(STATE.user.id, produtoId);
  if (!hist.length) { UI.toast('Sem histórico de preços', 'info'); return; }
  openModal(`
    <h3 style="margin-bottom:14px;font-size:16px;font-weight:700">📈 Histórico de Preços</h3>
    ${hist.map(h => `
      <div style="padding:10px;border-bottom:1px solid var(--border)">
        <div style="font-size:.75rem;color:var(--text-3);font-family:var(--mono)">${fDateFull(h.criado_em)}</div>
        <div style="display:flex;gap:16px;margin-top:4px">
          <span style="font-size:.8rem">Custo: <b>${fmt(h.preco_custo)}</b> → <b style="color:var(--green)">${fmt(h.novo_custo)}</b></span>
          <span style="font-size:.8rem">Venda: <b>${fmt(h.preco_venda)}</b> → <b style="color:var(--green)">${fmt(h.novo_venda)}</b></span>
        </div>
      </div>`).join('')}
    <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="closeModal()">Fechar</button>`);
}

// ══════════════════════════════════════════════════════════════
// CAIXA
// ══════════════════════════════════════════════════════════════
async function renderCaixa() {
  const dataSel = gv('cx-date', today()) || today();
  try {
    const movs = await API.getCaixa(STATE.user.id, dataSel, dataSel);
    const ent  = movs.filter(m => m.tipo === 'entrada').reduce((a, m) => a + (m.valor || 0), 0);
    const said = movs.filter(m => m.tipo === 'saida').reduce((a, m) => a + (m.valor || 0), 0);
    const fiad = movs.filter(m => m.tipo === 'fiado').reduce((a, m) => a + (m.valor || 0), 0);

    const cx = document.getElementById('cx-cards');
    if (cx) cx.innerHTML = `
      <div class="cx-card c-green"><div class="cx-num">${fmt(ent)}</div><div class="cx-label">Entradas</div></div>
      <div class="cx-card c-red"><div class="cx-num">${fmt(said)}</div><div class="cx-label">Saídas</div></div>
      <div class="cx-card c-blue"><div class="cx-num">${fmt(ent - said)}</div><div class="cx-label">Saldo</div></div>
      <div class="cx-card c-yellow"><div class="cx-num">${fmt(fiad)}</div><div class="cx-label">Fiado</div></div>`;

    const pp = {};
    movs.filter(m => m.tipo === 'entrada').forEach(m => { pp[m.forma] = (pp[m.forma] || 0) + (m.valor || 0); });
    const pg = document.getElementById('cx-pags');
    if (pg) pg.innerHTML = Object.keys(pp).length
      ? Object.entries(pp).map(([k, v]) => `<div class="mov-item"><span class="pay-pill pp-${k}">${pagLabel(k)}</span><span class="mov-val mv-e">${fmt(v)}</span></div>`).join('')
      : '<div style="font-size:12px;color:var(--text-3);font-family:monospace">Nenhuma entrada</div>';

    const mv = document.getElementById('cx-movs');
    if (mv) mv.innerHTML = movs.length
      ? movs.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).map(m => `
        <div class="mov-item">
          <div>
            <div class="mov-desc">${_e(m.descricao || '')}</div>
            <div class="mov-meta">${fTime(m.criado_em)}${m.forma ? ' – ' + pagLabel(m.forma) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mov-val mv-${m.tipo === 'saida' ? 's' : m.tipo === 'fiado' ? 'f' : 'e'}">${m.tipo === 'saida' ? '–' : '+'}${fmt(m.valor)}</span>
            <button onclick="excluirMov('${m.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:14px">🗑️</button>
          </div>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--text-3);font-family:monospace">Nenhuma movimentação</div>';
  } catch(e) { console.error('renderCaixa:', e); }

  renderCarnes();
}

async function registrarSaida() {
  const desc = _c(gv('cx-saida-desc', '').trim(), 200);
  const val  = parseFloat(gv('cx-saida-val', ''));
  if (!desc)       { UI.toast('Descreva a saída', 'warning'); return; }
  if (!val || val <= 0) { UI.toast('Valor inválido', 'warning'); return; }
  const data = gv('cx-date', today()) || today();
  try {
    await API.addCaixa(STATE.user.id, { tipo: 'saida', descricao: desc, valor: val, forma: 'dinheiro', data });
    document.getElementById('cx-saida-desc').value = '';
    document.getElementById('cx-saida-val').value  = '';
    UI.toast('Saída registrada!', 'success'); renderCaixa();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function excluirMov(id) {
  UI.confirm('Excluir esta movimentação?', async () => {
    try { await API.deleteCaixa(STATE.user.id, id); UI.toast('Excluído!', 'success'); renderCaixa(); }
    catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
  }, true);
}

// ══════════════════════════════════════════════════════════════
// AGENDA
// ══════════════════════════════════════════════════════════════
async function renderAgenda() {
  const from = gv('ag-date', today()) || today();
  try {
    const eventos = await API.getAgenda(STATE.user.id, from + 'T00:00:00', from + 'T23:59:59');
    APP.agenda = eventos;
    const box = document.getElementById('ag-list'); if (!box) return;
    if (!eventos.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sem compromissos neste dia</div></div>';
      return;
    }
    box.innerHTML = eventos.map(e => `
      <div class="card" style="cursor:pointer;border-left:3px solid ${e.cor||'var(--blue)'}" onclick="editarEvento('${e.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:14px;font-weight:600">${_e(e.titulo)}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-2)">${e.hora || 'Dia todo'}${e.clientes?.nome ? ' · ' + _e(e.clientes.nome) : ''}</div>
            ${e.descricao ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px">${_e(e.descricao)}</div>` : ''}
          </div>
          <button onclick="excluirEvento(event,'${e.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:20px;padding:4px 8px;line-height:1">×</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('renderAgenda:', e); }
}

function novoEvento() {
  ['form-ev-titulo','form-ev-hora','form-ev-desc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('form-ev-id').value   = '';
  document.getElementById('form-ev-data').value = gv('ag-date', today()) || today();
  document.getElementById('form-ev-cor').value  = '#38BDF8';
  const sel = document.getElementById('form-ev-cli');
  if (sel) sel.innerHTML = '<option value="">Sem cliente</option>' + APP.clientes.map(c => `<option value="${c.id}">${_e(c.nome)}</option>`).join('');
  const t = document.getElementById('form-ev-title'); if (t) t.textContent = 'Novo Evento';
  goPage('novo-evento');
}

function editarEvento(id) {
  const e = APP.agenda.find(x => x.id === id); if (!e) return;
  document.getElementById('form-ev-id').value     = e.id;
  document.getElementById('form-ev-titulo').value = e.titulo;
  document.getElementById('form-ev-data').value   = e.data_inicio?.slice(0, 10) || today();
  document.getElementById('form-ev-hora').value   = e.hora || '';
  document.getElementById('form-ev-desc').value   = e.descricao || '';
  document.getElementById('form-ev-cor').value    = e.cor || '#38BDF8';
  const sel = document.getElementById('form-ev-cli');
  if (sel) sel.innerHTML = '<option value="">Sem cliente</option>' + APP.clientes.map(c => `<option value="${c.id}" ${e.cliente_id === c.id ? 'selected' : ''}>${_e(c.nome)}</option>`).join('');
  const t = document.getElementById('form-ev-title'); if (t) t.textContent = 'Editar Evento';
  goPage('novo-evento');
}

async function salvarEvento() {
  const titulo = _c(gv('form-ev-titulo', '').trim(), 100);
  const data   = gv('form-ev-data', today()) || today();
  const hora   = gv('form-ev-hora', '') || '';
  if (!titulo) { UI.toast('Título obrigatório', 'warning'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { UI.toast('Data inválida', 'warning'); return; }

  const btn = document.querySelector('#page-novo-evento .btn-primary');
  if (btn) btn.disabled = true;

  const d = {
    id: gv('form-ev-id', '') || undefined,
    titulo, hora: hora || null,
    data_inicio: data + 'T' + (hora || '00:00'),
    cliente_id:  gv('form-ev-cli', '') || null,
    cor:         gv('form-ev-cor', '#38BDF8'),
    descricao:   _c(gv('form-ev-desc', ''), 300),
  };
  try {
    const saved = await API.saveEvento(STATE.user.id, d);
    const agDate = document.getElementById('ag-date'); if (agDate) agDate.value = data;
    if (d.id) { const i = APP.agenda.findIndex(x => x.id === d.id); if (i !== -1) APP.agenda[i] = saved; }
    else APP.agenda.push(saved);
    UI.toast('Evento salvo! ✅', 'success'); goBack(); await renderAgenda();
  } catch(e) {
    UI.toast('Erro: ' + (e.message || 'não foi possível salvar'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function excluirEvento(e, id) {
  e.stopPropagation();
  UI.confirm('Excluir evento?', async () => {
    try {
      await API.deleteEvento(STATE.user.id, id);
      APP.agenda = APP.agenda.filter(x => x.id !== id);
      UI.toast('Evento excluído!', 'success'); renderAgenda();
    } catch(err) { UI.toast('Erro: ' + err.message, 'error'); }
  }, true);
}

// ══════════════════════════════════════════════════════════════
// CARNÊS
// ══════════════════════════════════════════════════════════════
async function renderCarnes() {
  const box = document.getElementById('carne-list'); if (!box) return;
  try {
    const parc = await API.getParcelas(STATE.user.id);
    if (!parc.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-title">Nenhum carnê ativo</div></div>';
      return;
    }
    box.innerHTML = parc.map(p => {
      const venc = isVenc(p.vencimento);
      const os   = p.ordens_servico;
      const nome = os?.clientes?.nome || os?.cliente_nome || '–';
      const tel  = os?.clientes?.telefone || '';
      return `<div class="card" style="margin-bottom:10px${venc ? ';border-left:3px solid var(--red)' : ''}">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--blue)">${os ? 'OS #' + os.numero : '–'}</div>
            <div style="font-size:15px;font-weight:600">${_e(nome)}</div>
            <div style="font-size:11px;color:var(--text-2)">Parc ${p.numero || '?'}/${p.total || '?'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:15px;font-weight:700;color:var(--green)">${fmt(p.valor)}</div>
            <div style="font-size:11px;color:${venc ? 'var(--red)' : 'var(--text-2)'};font-family:var(--mono)">
              ${venc ? '⚠️ ' : ''}Venc: ${fmtDate(p.vencimento)}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="pagarParcelaUI('${p.id}',${p.valor},'${p.ordem_id || ''}')">✅ Marcar Pago</button>
          ${tel ? `<button class="btn btn-ghost btn-sm" onclick="cobrarWA('${p.id}','${tel}','${nome}','${fmt(p.valor)}','${fmtDate(p.vencimento)}')">💬 Cobrar</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error('renderCarnes:', e); }
}

async function pagarParcelaUI(id, valor, ordemId) {
  UI.confirm(`Confirmar pagamento de ${fmt(valor)}?`, async () => {
    try {
      await API.pagarParcela(STATE.user.id, id, valor, ordemId || null);
      UI.toast('Parcela paga! ✅', 'success'); renderCarnes();
    } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
  });
}

function cobrarWA(id, tel, nome, valor, venc) {
  const p   = STATE.perfil || {};
  const msg = `Olá *${nome}*! 👋\n\nPassando para lembrá-lo(a) do pagamento pendente:\n\n💰 *Valor:* ${valor}\n📅 *Vencimento:* ${venc}${p.pix ? '\n\n🔑 *PIX:* ' + p.pix : ''}\n\n_${p.empresa_nome || 'NexOS'}_`;
  window.open(API.buildWALink(tel, msg), '_blank');
}

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ══════════════════════════════════════════════════════════════
function renderConfig() {
  const p = STATE.perfil || {};
  [['cfg-nome', p.empresa_nome], ['cfg-cnpj', p.cnpj], ['cfg-tel', p.telefone],
   ['cfg-end', p.endereco], ['cfg-pix', p.pix], ['cfg-termos', p.termos],
   ['cfg-cidade', p.cidade], ['cfg-meta', p.meta_mensal]].forEach(([id, val]) => {
    const el = document.getElementById(id); if (el) el.value = val || '';
  });
  // Logo preview
  const lp = document.getElementById('cfg-logo-preview');
  if (lp) lp.src = p.logo_url || '';
  // Tema/acento
  const tema = document.getElementById('cfg-tema'); if (tema) tema.value = STATE.tema;
}

async function salvarConfig() {
  const d = {
    empresa_nome: _c(gv('cfg-nome',   ''), 100),
    cnpj:         _c(gv('cfg-cnpj',   ''), 20),
    telefone:     _c(gv('cfg-tel',    ''), 20),
    endereco:     _c(gv('cfg-end',    ''), 200),
    cidade:       _c(gv('cfg-cidade', ''), 80),
    pix:          _c(gv('cfg-pix',    ''), 100),
    termos:       _c(gv('cfg-termos', ''), 800),
    meta_mensal:  parseFloat(gv('cfg-meta', '0')) || 0,
    tema:         STATE.tema,
    acento:       STATE.acento,
  };
  if (!d.empresa_nome) { UI.toast('Nome da empresa obrigatório', 'warning'); return; }
  try {
    STATE.perfil = await API.upsertPerfil(STATE.user.id, d);
    App._ui();
    UI.toast('Configurações salvas! ✅', 'success');
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

// Feature #4 — Upload de logo
async function handleLogoUpload(e) {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    UI.toast('Enviando logo...', 'info');
    const url = await API.uploadLogo(STATE.user.id, file);
    STATE.perfil.logo_url = url;
    const lp = document.getElementById('cfg-logo-preview'); if (lp) lp.src = url;
    App._ui();
    UI.toast('Logo atualizada! ✅', 'success');
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// LOG DE AUDITORIA — Feature #39
// ══════════════════════════════════════════════════════════════
async function renderAuditoria() {
  const box = document.getElementById('audit-list'); if (!box) return;
  box.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-title">Carregando...</div></div>';
  try {
    const logs = await API.getAuditLog(STATE.user.id, 100);
    if (!logs.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro de auditoria</div></div>';
      return;
    }
    const operacaoCor = { INSERT: 'var(--green)', UPDATE: 'var(--blue)', DELETE: 'var(--red)', PAGAR: 'var(--green)' };
    box.innerHTML = logs.map(l => `
      <div class="card" style="padding:10px 14px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:.72rem;font-weight:700;color:${operacaoCor[l.operacao]||'var(--text-2)'};font-family:var(--mono)">${l.operacao}</span>
          <span style="font-size:.7rem;color:var(--text-3);font-family:var(--mono)">${fDateFull(l.criado_em)}</span>
        </div>
        <div style="font-size:.8rem;color:var(--text-2)"><b>${l.tabela}</b> #${l.registro_id || '–'}</div>
        <div style="font-size:.72rem;color:var(--text-3);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(l.dados || '')}</div>
      </div>`).join('');
  } catch(e) { box.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Erro ao carregar auditoria</div></div>'; }
}

// ══════════════════════════════════════════════════════════════
// BACKUP — Feature #40
// ══════════════════════════════════════════════════════════════
async function exportarDados() {
  UI.toast('Gerando backup...', 'info');
  try {
    const dados = await API.gerarBackup(STATE.user.id);
    const blob  = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    _downloadBlob(blob, 'nexos_v5_backup_' + today() + '.json');
    UI.toast('Backup exportado! ✅', 'success');
    await API.audit('backup', 'EXPORT', STATE.user.id, { data: today() });
  } catch(e) { UI.toast('Erro ao exportar: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// EXCLUIR CONTA
// ══════════════════════════════════════════════════════════════
async function excluirContaPermanente() {
  UI.confirmSecure('Excluir sua conta apagará TODOS os dados permanentemente. Esta ação NÃO pode ser desfeita.', async () => {
    try {
      const uid = STATE.user.id;
      await Promise.all([
        window.sb.from('ordens_servico').delete().eq('dono_id', uid),
        window.sb.from('clientes').delete().eq('dono_id', uid),
        window.sb.from('produtos').delete().eq('dono_id', uid),
        window.sb.from('caixa').delete().eq('dono_id', uid),
        window.sb.from('agenda').delete().eq('dono_id', uid),
        window.sb.from('parcelas').delete().eq('dono_id', uid),
        window.sb.from('perfil').delete().eq('user_id', uid),
      ]);
      await window.sb.auth.signOut();
      UI.toast('Conta excluída permanentemente.', 'info');
      setTimeout(() => location.reload(), 2000);
    } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
  });
}

// ══════════════════════════════════════════════════════════════
// PESQUISA GLOBAL APRIMORADA — Feature #37
// ══════════════════════════════════════════════════════════════
function abrirBuscaGlobal() {
  const el = document.getElementById('global-search-overlay');
  if (el) { el.classList.add('open'); document.getElementById('global-search-input')?.focus(); }
}

function fecharBuscaGlobal() {
  const el = document.getElementById('global-search-overlay');
  if (el) el.classList.remove('open');
}

function globalSearch(q) {
  if (!q || q.length < 2) {
    const res = document.getElementById('global-search-results');
    if (res) res.innerHTML = '';
    return;
  }
  const ql  = q.toLowerCase();
  const res = document.getElementById('global-search-results'); if (!res) return;

  const osRes  = APP.os.filter(o =>
    (o.clientes?.nome || o.cliente_nome || '').toLowerCase().includes(ql) ||
    String(o.numero || '').includes(ql) ||
    (o.equipamento || o.item || '').toLowerCase().includes(ql)
  ).slice(0, 5);

  const cliRes = APP.clientes.filter(c =>
    c.nome.toLowerCase().includes(ql) ||
    (c.telefone || '').includes(ql)
  ).slice(0, 3);

  const estRes = APP.produtos.filter(p =>
    p.nome.toLowerCase().includes(ql) ||
    (p.codigo || '').toLowerCase().includes(ql)
  ).slice(0, 3);

  if (!osRes.length && !cliRes.length && !estRes.length) {
    res.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:.85rem">Nenhum resultado</div>';
    return;
  }

  let html = '';
  if (osRes.length) {
    html += `<div style="padding:8px 14px;font-size:.7rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:1px">OS</div>`;
    html += osRes.map(o => `
      <div onclick="fecharBuscaGlobal();verOS('${o.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:.1s" onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
        <div style="font-size:.85rem;font-weight:600">OS #${o.numero} — ${_e(o.clientes?.nome || o.cliente_nome || '–')}</div>
        <div style="font-size:.75rem;color:var(--text-2)">${_e(o.equipamento || o.item || '')} · ${statusLabel(o.status)} · ${fmt(o.valor_total)}</div>
      </div>`).join('');
  }
  if (cliRes.length) {
    html += `<div style="padding:8px 14px;font-size:.7rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:1px">Clientes</div>`;
    html += cliRes.map(c => `
      <div onclick="fecharBuscaGlobal();verCliente('${c.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:.1s" onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
        <div style="font-size:.85rem;font-weight:600">${c.blacklist ? '⛔ ' : ''}${_e(c.nome)}</div>
        <div style="font-size:.75rem;color:var(--text-2)">${c.telefone || c.email || '–'}</div>
      </div>`).join('');
  }
  if (estRes.length) {
    html += `<div style="padding:8px 14px;font-size:.7rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:1px">Estoque</div>`;
    html += estRes.map(p => `
      <div onclick="fecharBuscaGlobal();editarProduto('${p.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:.1s" onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
        <div style="font-size:.85rem;font-weight:600">${_e(p.nome)}</div>
        <div style="font-size:.75rem;color:var(--text-2)">${fmt(p.preco_venda)} · Est: ${p.quantidade || 0}</div>
      </div>`).join('');
  }
  res.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// VER CLIENTE
// ══════════════════════════════════════════════════════════════
let _verCliId = null;

async function verCliente(id) {
  _verCliId = id;
  const c = APP.clientes.find(x => x.id === id); if (!c) return;

  const n = document.getElementById('vcli-nome'); if (n) n.textContent = c.nome;
  const t = document.getElementById('vcli-tel');  if (t) t.textContent = c.telefone || c.email || '';

  const osCliente  = APP.os.filter(o => o.cliente_id === id || o.cliente_nome === c.nome);
  const totalGasto = osCliente.reduce((a, o) => a + (+o.valor_total || 0), 0);
  const osFiado    = osCliente.filter(o => o.status === 'fiado');
  const totalDevendo = osFiado.reduce((a, o) => a + (+o.valor_total || 0), 0);
  const osAbertas  = osCliente.filter(o => ['aguardando','andamento'].includes(o.status));
  const osPagas    = osCliente.filter(o => ['concluido','retirada'].includes(o.status));

  const body = document.getElementById('vcli-body'); if (!body) return;
  body.innerHTML = `
    ${c.blacklist ? `<div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:12px;font-size:.85rem;color:var(--red);font-weight:600">⛔ Cliente na Blacklist</div>` : ''}
    ${c.aniversario && c.aniversario.slice(5) === today().slice(5) ? `<div style="background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:12px;font-size:.85rem;color:var(--green);font-weight:600">🎂 Hoje é o aniversário de ${_e(c.nome.split(' ')[0])}!</div>` : ''}
    <div class="cx-grid" style="margin-bottom:12px">
      <div class="cx-card c-blue"><div class="cx-num">${fmt(totalGasto)}</div><div class="cx-label">Total Gasto</div></div>
      <div class="cx-card ${totalDevendo > 0 ? 'c-red' : 'c-green'}"><div class="cx-num">${totalDevendo > 0 ? fmt(totalDevendo) : '✓'}</div><div class="cx-label">${totalDevendo > 0 ? 'Devendo' : 'Tudo Pago'}</div></div>
      <div class="cx-card c-yellow"><div class="cx-num">${osAbertas.length}</div><div class="cx-label">Abertas</div></div>
      <div class="cx-card c-green"><div class="cx-num">${osPagas.length}</div><div class="cx-label">Pagas</div></div>
    </div>
    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Dados</div>
      ${c.telefone  ? `<div class="ir"><span class="irl">WhatsApp</span><span class="irv"><a href="https://wa.me/55${(c.telefone||'').replace(/\D/g,'')}" target="_blank" style="color:var(--green)">${_e(c.telefone)}</a></span></div>` : ''}
      ${c.email     ? `<div class="ir"><span class="irl">E-mail</span><span class="irv">${_e(c.email)}</span></div>` : ''}
      ${c.cpf       ? `<div class="ir"><span class="irl">CPF/CNPJ</span><span class="irv">${_e(c.cpf)}</span></div>` : ''}
      ${c.endereco  ? `<div class="ir"><span class="irl">Endereço</span><span class="irv">${_e(c.endereco)}</span></div>` : ''}
      ${c.aniversario ? `<div class="ir"><span class="irl">Aniversário</span><span class="irv">${fmtDate(c.aniversario)}</span></div>` : ''}
    </div>
    <div class="card">
      <div class="card-title"><div class="ct-bar"></div>Histórico (${osCliente.length})</div>
      ${osCliente.length
        ? osCliente.map(o => _osCard(o)).join('')
        : '<p style="font-size:.82rem;color:var(--text-3)">Nenhuma OS ainda</p>'}
    </div>`;

  goPage('ver-cliente');
  if (window.lucide) lucide.createIcons();
}

function editarClienteAtual()  { if (_verCliId) editarCliente(_verCliId); }
function novaOSparaCliente()   {
  const c = APP.clientes.find(x => x.id === _verCliId); if (!c) return;
  novaOS();
  setTimeout(() => {
    const sn = document.getElementById('m-cli-search'); if (sn) sn.value = c.nome;
    const si = document.getElementById('m-cli-id');     if (si) si.value = c.id;
    const nn = document.getElementById('m-cli-nome');   if (nn) nn.value = c.nome;
    const nt = document.getElementById('m-cli-tel');    if (nt) nt.value = c.telefone || '';
    const nd = document.getElementById('m-cli-doc');    if (nd) nd.value = c.cpf || '';
  }, 200);
}

function cobrarClienteWA(id) {
  const c = APP.clientes.find(x => x.id === id); if (!c || !c.telefone) return;
  const osFiado = APP.os.filter(o => (o.cliente_id === id || o.cliente_nome === c.nome) && o.status === 'fiado');
  const total   = osFiado.reduce((a, o) => a + (+o.valor_total || 0), 0);
  const p       = STATE.perfil || {};
  const listaOS = osFiado.map(o => `• OS #${o.numero} — ${o.equipamento||o.item||'Serviço'} — ${fmt(o.valor_total)}`).join('\n');
  const msg     = `Olá *${c.nome}*! 👋\n\nServiço(s) em aberto:\n\n💰 *Total: ${fmt(total)}*\n\n${listaOS}${p.pix?'\n\n🔑 *PIX:* '+p.pix:''}\n\n_${p.empresa_nome||'NexOS'}_`;
  window.open(API.buildWALink(c.telefone, msg), '_blank');
}

// ══════════════════════════════════════════════════════════════
// AUTOCOMPLETE DE CLIENTE NA NOVA OS
// ══════════════════════════════════════════════════════════════
function filtrarClienteOS(q) {
  const dd  = document.getElementById('m-cli-dropdown'); if (!dd) return;
  const val = (q || '').toLowerCase().trim();
  if (!val) { dd.style.display = 'none'; return; }
  const matches = APP.clientes.filter(c =>
    c.nome.toLowerCase().includes(val) || (c.telefone || '').includes(val)
  ).slice(0, 8);
  if (!matches.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = matches.map(c => `
    <div onclick="selecionarClienteOS('${c.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:.1s${c.blacklist?';background:rgba(248,113,113,.06)':''}" onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background='${c.blacklist?'rgba(248,113,113,.06)':''}'">
      <div style="font-size:.87rem;font-weight:600">${c.blacklist ? '⛔ ' : ''}${_e(c.nome)}</div>
      <div style="font-size:.75rem;color:var(--text-2);font-family:var(--mono)">${c.telefone || c.email || ''}</div>
    </div>`).join('');
  dd.style.display = 'block';
}

function selecionarClienteOS(id) {
  const c  = APP.clientes.find(x => x.id === id); if (!c) return;
  const dd = document.getElementById('m-cli-dropdown'); if (dd) dd.style.display = 'none';
  const ms = document.getElementById('m-cli-search');   if (ms) ms.value = c.nome;
  const mi = document.getElementById('m-cli-id');       if (mi) mi.value = c.id;
  const mn = document.getElementById('m-cli-nome');     if (mn) mn.value = c.nome;
  const mt = document.getElementById('m-cli-tel');      if (mt) mt.value = c.telefone || '';
  const md = document.getElementById('m-cli-doc');      if (md) md.value = c.cpf || '';

  // Alerta blacklist
  if (c.blacklist) UI.toast(`⛔ Atenção: ${c.nome} está na blacklist!`, 'warning');
}

document.addEventListener('click', e => {
  const dd = document.getElementById('m-cli-dropdown');
  const ms = document.getElementById('m-cli-search');
  if (dd && ms && !dd.contains(e.target) && e.target !== ms) dd.style.display = 'none';
});

// ══════════════════════════════════════════════════════════════
// ASSINATURA FULLSCREEN
// ══════════════════════════════════════════════════════════════
let _sigFSD = false, _sigFSLX = 0, _sigFSLY = 0;

function abrirAssinatura() {
  const el = document.getElementById('sig-fullscreen'); if (!el) return;
  el.style.display = 'flex';
  setTimeout(() => {
    const cv = document.getElementById('sigCanvasFS'); if (!cv) return;
    const pr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width  = rect.width  * pr;
    cv.height = rect.height * pr;
    const ctx = cv.getContext('2d');
    ctx.scale(pr, pr); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const getP = e => {
      const r = cv.getBoundingClientRect();
      return e.touches ? { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }
                       : { x: e.clientX - r.left,              y: e.clientY - r.top };
    };
    cv.onmousedown  = e => { _sigFSD = true; const p = getP(e); _sigFSLX = p.x; _sigFSLY = p.y; };
    cv.onmousemove  = e => { if (!_sigFSD) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(_sigFSLX, _sigFSLY); ctx.lineTo(p.x, p.y); ctx.stroke(); _sigFSLX = p.x; _sigFSLY = p.y; };
    cv.onmouseup    = () => _sigFSD = false;
    cv.ontouchstart = e => { e.preventDefault(); _sigFSD = true; const p = getP(e); _sigFSLX = p.x; _sigFSLY = p.y; };
    cv.ontouchmove  = e => { e.preventDefault(); if (!_sigFSD) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(_sigFSLX, _sigFSLY); ctx.lineTo(p.x, p.y); ctx.stroke(); _sigFSLX = p.x; _sigFSLY = p.y; };
    cv.ontouchend   = () => _sigFSD = false;
  }, 100);
}

function limparSigFS()   { const cv = document.getElementById('sigCanvasFS'); if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
function fecharAssinatura() { const el = document.getElementById('sig-fullscreen'); if (el) el.style.display = 'none'; }

function confirmarAssinatura() {
  const cv = document.getElementById('sigCanvasFS');
  if (!cv || isEmptySig(cv)) { UI.toast('Assine antes de confirmar', 'warning'); return; }
  const cvH = document.getElementById('sigCanvas');
  if (cvH) { cvH.width = cv.width; cvH.height = cv.height; cvH.getContext('2d').drawImage(cv, 0, 0); }
  const lbl = document.getElementById('sig-status-label'); if (lbl) lbl.textContent = '✅ Assinatura registrada';
  fecharAssinatura();
  UI.toast('Assinatura confirmada!', 'success');
}

// ══════════════════════════════════════════════════════════════
// OS VENCIDAS / FIADO
// ══════════════════════════════════════════════════════════════
async function verificarOSVencidas() {
  const osFiado = APP.os.filter(o => o.status === 'fiado');
  if (!osFiado.length) return;
  UI.confirm(
    `⚠️ <b>${osFiado.length} OS em fiado</b> detectada(s).<br>Deseja enviar cobrança via WhatsApp?`,
    async () => {
      for (const os of osFiado) {
        const tel = os.clientes?.telefone || '';
        if (!tel) continue;
        const nome = os.clientes?.nome || os.cliente_nome || 'Cliente';
        const msg  = `Olá *${nome}*! 👋\n\nOS em aberto:\n\n📋 *OS #${os.numero}*\n🔧 ${os.equipamento || os.item || 'Serviço'}\n💰 *${fmt(os.valor_total)}*${STATE.perfil?.pix ? '\n\n🔑 *PIX:* ' + STATE.perfil.pix : ''}\n\n_${STATE.perfil?.empresa_nome || 'NexOS'}_`;
        window.open(API.buildWALink(tel, msg), '_blank');
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
// EXPOR GLOBAIS
// ══════════════════════════════════════════════════════════════
window.App = App;
