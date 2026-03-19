/* ============================================================
   NexOS v3.5 — app.js
   Todos os erros corrigidos. Funções defensivas.
   ============================================================ */

// ── APP STATE ──────────────────────────────────────────────
const APP = {
  os:            [],
  clientes:      [],
  produtos:      [],
  notifs:        [],
  funcionarios:  [],
  agenda:        [],
  contasPagar:   [],
  contasReceber: [],
  charts:        {},
  calDate:       new Date(),
  osFiltro:      'all',
  osSearch:      '',
  anPeriodo:     'month',
  settingsTab:   'company',
  realtimeSubs:  [],
};

// ── HELPERS SEGUROS ────────────────────────────────────────
function _seg() {
  if (!window.SEGMENTS) return { labels:{ pt:{} }, os_form_fields:[], id:'tech' };
  // Lê sempre direto do configs — nunca do cache _current
  const id = localStorage.getItem('nexos_segment') || STATE?.empresa?.segmento || 'tech';
  const seg = SEGMENTS.configs[id] || SEGMENTS.configs.tech;
  // Atualiza o cache com o objeto correto
  SEGMENTS._current = seg;
  return seg;
}
function _lang() { return (window.I18N) ? I18N.lang : 'pt'; }
function _t(key) { return (window.I18N) ? I18N.t(key) : key; }

// ── BOOT ───────────────────────────────────────────────────
const App = {

  async init() {
    if (!STATE.empresa) return;
    UI.loading(true, 'Carregando...');
    try {
      await App._loadInitialData();
      App._setupRealtime();
      App._setGreeting();
      goPage(localStorage.getItem('nexos_page') || 'dashboard');
    } catch(e) {
      console.error('Erro init:', e);
      UI.toast('Erro ao carregar: ' + e.message, 'error');
    } finally {
      UI.loading(false);
    }
  },

  async _loadInitialData() {
    const id = STATE.empresa.id;
    const [os, cli, prod, notif, funcs, agenda] = await Promise.all([
      API.getOS(id),
      API.getClientes(id),
      API.getProdutos(id),
      API.getNotificacoes(id),
      API.getFuncionarios(id),
      API.getAgendaHoje(id),
    ]);
    APP.os           = os   || [];
    APP.clientes     = cli  || [];
    APP.produtos     = prod || [];
    APP.notifs       = notif|| [];
    APP.funcionarios = funcs|| [];
    APP.agenda       = agenda||[];
    App._updateNotifBadge();
    App._updateOSBadge();
  },

  _setupRealtime() {
    const id = STATE.empresa.id;
    APP.realtimeSubs.forEach(s => { try { s.unsubscribe?.(); } catch(e){} });
    APP.realtimeSubs = [
      API.subscribeOS(id, async () => {
        APP.os = await API.getOS(id);
        App._updateOSBadge();
        const pg = document.querySelector('.page.active');
        if (pg?.id === 'page-os')        renderOSList();
        if (pg?.id === 'page-dashboard') renderDashOS();
      }),
      API.subscribeNotifs(id, async (payload) => {
        APP.notifs = await API.getNotificacoes(id);
        App._updateNotifBadge();
        if (payload?.new) UI.toast('🔔 ' + (payload.new.titulo || 'Nova notificação'), 'info');
      }),
    ];
  },

  _updateNotifBadge() {
    const n = (APP.notifs||[]).filter(x => !x.lida).length;
    UI.badge('notif-badge', n);
    UI.badge('mobile-notif-badge', n);
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = n > 0 ? 'block' : 'none';
  },

  _updateOSBadge() {
    const ab = (APP.os||[]).filter(o => ['aguardando','andamento'].includes(o.status)).length;
    UI.badge('nav-os-badge', ab);
  },

  _setGreeting() {
    const h = new Date().getHours();
    const nome = STATE.funcionario?.nome?.split(' ')[0]
              || STATE.perfil?.nome?.split(' ')[0]
              || '';
    const s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const el = document.getElementById('dash-greeting');
    if (el) el.textContent = s + (nome ? ', ' + nome + '!' : '!');
  },
};

// ── NAVEGAÇÃO ──────────────────────────────────────────────
function goPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.remove('active'));

  const el = document.getElementById('page-' + page);
  if (!el) return;
  el.classList.add('active');
  document.querySelectorAll(`[data-nav="${page}"]`).forEach(n => n.classList.add('active'));
  localStorage.setItem('nexos_page', page);

  const titles = {
    dashboard: 'Dashboard', os: _seg().labels[_lang()]?.os_module || 'OS',
    clients: 'Clientes', stock: 'Estoque', cash: 'Financeiro',
    schedule: 'Agenda', analytics: 'Relatórios', ai: 'Inteligência Artificial',
    notifications: 'Notificações', settings: 'Configurações',
  };
  UI.setPageTitle(titles[page] || page);

  // Fecha mobile more se aberto
  if (window.moreOpen) toggleMobileMore();

  const renders = {
    dashboard:     renderDashboard,
    os:            renderOSList,
    clients:       renderClients,
    stock:         renderStock,
    cash:          renderCash,
    schedule:      renderCalendar,
    analytics:     renderAnalytics,
    ai:            renderAI,
    notifications: renderNotifications,
    settings:      () => renderSettings(APP.settingsTab),
    master:        renderMaster,
  };
  try { renders[page]?.(); } catch(e) { console.error('Erro ao renderizar ' + page + ':', e); }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── DASHBOARD ──────────────────────────────────────────────
async function renderDashboard() {
  if (!STATE.empresa) return;
  try {
    const data = await API.getDashboardData(STATE.empresa.id);

    const set = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
    set('kpi-revenue', fmt(data.faturamento_mes));
    set('kpi-os',      data.os_abertas);
    set('kpi-done',    data.os_concluidas_mes);
    set('kpi-profit',  fmt(data.faturamento_mes * 0.35));

    if (data.delta_pct !== null) {
      const de = document.getElementById('kpi-revenue-delta');
      if (de) {
        const up = parseFloat(data.delta_pct) >= 0;
        de.textContent = (up?'+':'') + data.delta_pct + '%';
        de.className = 'kpi-delta ' + (up ? 'up' : 'down');
      }
    }

    renderDashAlerts(data);
    renderDashRanking(data.top_clientes);
    renderDashAgenda(data.agenda_hoje);
    renderDashOS();
    renderDashChart(7);
  } catch(e) {
    console.error('Erro dashboard:', e);
  }
}

function renderDashAlerts(data) {
  const wrap = document.getElementById('dash-alerts');
  if (!wrap) return;
  const al = [];
  if (data.estoques_baixos > 0)
    al.push({ icon:'alert-triangle', color:'var(--orange)', text: data.estoques_baixos + ' produto(s) com estoque baixo', page:'stock' });
  if (data.parcelas_vencidas > 0)
    al.push({ icon:'clock', color:'var(--red)', text: data.parcelas_vencidas + ' parcela(s) vencida(s)', page:'cash' });
  if (data.aniversarios?.length > 0)
    al.push({ icon:'cake', color:'var(--purple)', text: data.aniversarios.map(a=>a.nome.split(' ')[0]).join(', ') + ' fazem aniversário hoje!', page:'clients' });
  wrap.innerHTML = al.map(a =>
    `<div onclick="goPage('${a.page}')" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-2);border:1px solid var(--border);border-left:3px solid ${a.color};border-radius:var(--radius-md);cursor:pointer;font-size:.8rem;color:var(--text-1);flex:1;min-width:200px">
      <i data-lucide="${a.icon}" style="width:14px;height:14px;color:${a.color};flex-shrink:0"></i>${a.text}
    </div>`
  ).join('');
  if (al.length && window.lucide) lucide.createIcons();
}

function renderDashRanking(clientes) {
  const wrap = document.getElementById('dash-ranking');
  if (!wrap) return;
  if (!clientes?.length) { wrap.innerHTML = '<div class="empty-text" style="padding:20px 0">Sem dados ainda</div>'; return; }
  const cores = ['var(--yellow)','var(--text-2)','var(--orange)'];
  wrap.innerHTML = clientes.map((c,i) =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i<clientes.length-1?'border-bottom:1px solid var(--border)':''}">
      <div style="width:22px;height:22px;border-radius:50%;background:${cores[i]||'var(--bg-3)'};display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:800;color:var(--bg);flex-shrink:0">${i+1}</div>
      <div style="width:32px;height:32px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#fff;flex-shrink:0">${initials(c.nome)}</div>
      <div style="flex:1;min-width:0"><div style="font-size:.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome}</div><div style="font-size:.72rem;color:var(--text-3)">${c.count} serviço(s)</div></div>
      <div style="font-size:.82rem;font-weight:700;color:var(--green);flex-shrink:0">${fmt(c.total)}</div>
    </div>`
  ).join('');
}

function renderDashAgenda(eventos) {
  const wrap = document.getElementById('dash-agenda');
  if (!wrap) return;
  if (!eventos?.length) { wrap.innerHTML = '<div class="empty-text" style="padding:20px 0">Sem compromissos hoje</div>'; return; }
  wrap.innerHTML = eventos.map(e =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:4px;height:36px;border-radius:2px;background:${e.cor||'var(--blue)'};flex-shrink:0"></div>
      <div><div style="font-size:.84rem;font-weight:600">${e.titulo}</div>
      <div style="font-size:.74rem;color:var(--text-3)">${e.data_inicio ? new Date(e.data_inicio).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''} · ${e.clientes?.nome||''}</div></div>
    </div>`
  ).join('');
}

function renderDashOS() {
  const wrap = document.getElementById('dash-os-list');
  if (!wrap) return;
  const rec = (APP.os||[]).slice(0,5);
  if (!rec.length) { wrap.innerHTML = '<div class="empty-text">Nenhuma OS ainda</div>'; return; }
  wrap.innerHTML = rec.map(o => osCard(o, true)).join('');
  if (window.lucide) lucide.createIcons();
}

async function renderDashChart(days) {
  try {
    const data = await API.getFaturamentoDiario(STATE.empresa.id, days);
    const canvas = document.getElementById('dash-chart');
    if (!canvas) return;
    APP.charts.dash?.destroy();
    APP.charts.dash = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(d => { const dt = new Date(d.date+'T12:00:00'); return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }),
        datasets: [{ data: data.map(d=>d.value), borderColor:'#38BDF8', backgroundColor:'rgba(56,189,248,.08)', fill:true, tension:.4, pointRadius:3, pointBackgroundColor:'#38BDF8', borderWidth:2 }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#6B7280',font:{size:10}} },
          y:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#6B7280',font:{size:10},callback:v=>'R$'+v.toLocaleString('pt-BR')} }
        }
      }
    });
  } catch(e) { console.error('Erro chart:', e); }
}

function setChartPeriod(days, btn) {
  document.querySelectorAll('.chart-header .filter-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderDashChart(days);
}

// ── OS — LISTA ─────────────────────────────────────────────
function renderOSList() {
  const list = document.getElementById('os-list');
  if (!list) return;

  let filtrado = [...(APP.os||[])];
  if (APP.osFiltro !== 'all') filtrado = filtrado.filter(o => o.status === APP.osFiltro);
  if (APP.osSearch) {
    const q = APP.osSearch.toLowerCase();
    filtrado = filtrado.filter(o =>
      String(o.numero||'').includes(APP.osSearch) ||
      (o.item||'').toLowerCase().includes(q) ||
      (o.extra_1||'').toLowerCase().includes(q) ||
      (o.clientes?.nome||'').toLowerCase().includes(q)
    );
  }

  const count = document.getElementById('os-page-count');
  if (count) count.textContent = filtrado.length + ' registro' + (filtrado.length!==1?'s':'');

  if (!filtrado.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i data-lucide="clipboard-list" style="width:36px;height:36px"></i></div>
      <div class="empty-title">${APP.osFiltro==='all' ? 'Nenhuma OS ainda' : 'Sem OS com este status'}</div>
      <div class="empty-text">${APP.osFiltro==='all' ? 'Toque em "Nova OS" para começar' : 'Tente outro filtro'}</div>
      ${APP.osFiltro==='all'?'<button class="btn btn-primary mt-3" onclick="openNewOS()"><i data-lucide="plus" style="width:14px;height:14px"></i> Nova OS</button>':''}
    </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  list.innerHTML = filtrado.map(o => osCard(o)).join('');
  if (window.lucide) lucide.createIcons();
}

function osCard(os, compact=false) {
  const st  = STATUS_CONFIG[os.status] || { label: os.status, color:'var(--text-3)' };
  const cli = os.clientes?.nome || 'Sem cadastro';
  const seg = _seg();
  const lang = _lang();
  return `
    <div class="os-card" data-status="${os.status}" onclick="openViewOS('${os.id}')">
      <div class="os-card-left">
        <div class="os-card-num">#${os.numero||'?'}</div>
        <div class="os-card-info">
          <div class="os-card-title">${os.item||'–'}</div>
          ${os.extra_1?`<div class="os-card-sub">${os.extra_1}</div>`:''}
          <div class="os-card-meta">
            <i data-lucide="user" style="width:11px;height:11px"></i> ${cli}
            ${os.funcionarios?`<span style="margin-left:8px"><i data-lucide="wrench" style="width:11px;height:11px"></i> ${os.funcionarios.nome}</span>`:''}
          </div>
        </div>
      </div>
      <div class="os-card-right">
        <span class="badge" style="background:${st.color}22;color:${st.color};border-color:${st.color}33;white-space:nowrap">${st.label}</span>
        <div class="os-card-value">${fmt(os.valor_total||0)}</div>
        <div class="os-card-date">${fmtDate(os.criado_em)}</div>
      </div>
    </div>`;
}

function filterOS() {
  APP.osSearch = document.getElementById('os-search')?.value || '';
  renderOSList();
}

function filterOSStatus(status, btn) {
  APP.osFiltro = status;
  document.querySelectorAll('#os-status-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOSList();
}

// ── OS — MODAL NOVA/EDITAR ─────────────────────────────────
let _osModalId = null;
let _osItems   = [];
let _osStatus  = 'aguardando';

function openNewOS() {
  _osModalId = null;
  _osItems   = [];
  _osStatus  = 'aguardando';
  buildOSModal(null);
}

async function openViewOS(id) {
  try {
    const os = await API.getOSById(id);
    if (!os) { UI.toast('OS não encontrada', 'error'); return; }
    buildOSViewModal(os);
  } catch(e) {
    UI.toast('Erro ao carregar OS: ' + e.message, 'error');
  }
}

async function openEditOS(id) {
  try {
    const os = await API.getOSById(id);
    if (!os) { UI.toast('OS não encontrada', 'error'); return; }
    _osModalId = id;
    buildOSModal(os);
  } catch(e) {
    UI.toast('Erro ao carregar OS: ' + e.message, 'error');
  }
}

function _closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
  document.body.style.overflow = '';
}

function buildOSModal(os) {
  // Garante que pega o objeto completo do segmento, nunca cache corrompido
  if (window.SEGMENTS) SEGMENTS._current = null;
  const seg    = _seg();
  const lang   = _lang();
  const fields = seg.os_form_fields || [];
  const prefs  = (() => { try { return JSON.parse(localStorage.getItem('nexos_prefs')||'{}'); } catch(e){ return {}; } })();
  const title  = os
    ? 'Editar ' + (seg.labels[lang]?.os_single || 'OS')
    : (seg.labels[lang]?.os_new || 'Nova OS');

  const FIELD_DB = {
    item:'item', defect:'defeito', diagnosis:'diagnostico',
    technician:'tecnico_id', warranty:'garantia_dias',
    extra_1:'extra_1', extra_2:'extra_2', extra_3:'extra_3',
    notes:'observacoes', delivery:'data_entrega', priority:'prioridade',
  };

  const funcsOpts = (APP.funcionarios||[]).map(f =>
    `<option value="${f.id}" ${os?.tecnico_id===f.id?'selected':''}>${f.nome}</option>`
  ).join('');

  const clientesOpts = (APP.clientes||[]).map(c =>
    `<option value="${c.id}" ${os?.cliente_id===c.id?'selected':''}>${c.nome}</option>`
  ).join('');

  const renderField = (f) => {
    if (!f?.type) return '';
    const segLabels = seg.labels[lang] || seg.labels['pt'] || {};
    const label = f.label_key ? (segLabels[f.label_key] || _t(f.label_key) || f.label_key) : (f.label || '');
    const ph    = f.placeholder_key ? (segLabels[f.placeholder_key] || '') : (f.placeholder || '');
    const dbKey = FIELD_DB[f.id] || f.id;
    const val   = os ? (os[dbKey] ?? '') : '';

    switch(f.type) {
      case 'client_select': return `
        <div class="form-group">
          <label class="form-label">Cliente</label>
          <div style="display:flex;gap:8px">
            <select id="os-f-cliente_id" class="form-control" style="flex:1">
              <option value="">Sem cadastro (venda rápida)</option>${clientesOpts}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openNewClientInline()" title="Novo cliente">
              <i data-lucide="user-plus" style="width:14px;height:14px"></i>
            </button>
          </div>
        </div>`;

      case 'text': return label ? `
        <div class="form-group">
          <label class="form-label">${label}${f.required?'<span style="color:var(--red)"> *</span>':''}</label>
          <input type="text" id="os-f-${f.id}" class="form-control" value="${String(val).replace(/"/g,'&quot;')}" placeholder="${ph}" ${f.required?'required':''}>
        </div>` : '';

      case 'textarea': return label ? `
        <div class="form-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <label class="form-label" style="margin:0">${label}</label>
            ${f.minimizable?`<button type="button" onclick="toggleFieldMin('os-f-${f.id}-wrap')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:.72rem">▲ Minimizar</button>`:''}
          </div>
          <div id="os-f-${f.id}-wrap">
            <textarea id="os-f-${f.id}" class="form-control" rows="3" placeholder="${ph}">${String(val).replace(/</g,'&lt;')}</textarea>
          </div>
        </div>` : '';

      case 'number': return label ? `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <input type="number" id="os-f-${f.id}" class="form-control" value="${val||f.default||''}" min="0">
        </div>` : '';

      case 'date': return `
        <div class="form-group">
          <label class="form-label">Data de Entrega</label>
          <input type="date" id="os-f-${f.id}" class="form-control" value="${val}">
        </div>`;

      case 'staff_select': return `
        <div class="form-group">
          <label class="form-label">${label || 'Técnico'}</label>
          <select id="os-f-tecnico_id" class="form-control">
            <option value="">Sem atribuição</option>${funcsOpts}
          </select>
        </div>`;

      case 'priority_select': return `
        <div class="form-group">
          <label class="form-label">Prioridade</label>
          <select id="os-f-prioridade" class="form-control">
            <option value="normal" ${(!os||os.prioridade==='normal')?'selected':''}>Normal</option>
            <option value="alta"   ${os?.prioridade==='alta'?'selected':''}>Alta</option>
            <option value="urgente"${os?.prioridade==='urgente'?'selected':''}>Urgente</option>
          </select>
        </div>`;

      case 'payment_select': return `
        <div class="form-group">
          <label class="form-label">Forma de Pagamento</label>
          <select id="os-f-forma_pagamento" class="form-control" onchange="onPaymentChange(this.value)">
            <option value="">Selecionar...</option>
            ${Object.entries(PAY_CONFIG).map(([k,v])=>`<option value="${k}" ${os?.forma_pagamento===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
          <div id="parcelas-wrap" style="display:${os?.forma_pagamento==='parcelado'?'block':'none'};margin-top:8px">
            <label class="form-label">Nº de Parcelas</label>
            <select id="os-f-n_parcelas" class="form-control">
              ${[2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}">${n}x</option>`).join('')}
            </select>
          </div>
        </div>`;

      case 'parts_list': return `
        <div class="form-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="form-label" style="margin:0">${seg.labels[lang]?.parts_field || 'Itens'}</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addOSItem()">
              <i data-lucide="plus" style="width:13px;height:13px"></i> Adicionar
            </button>
          </div>
          <div id="os-items-list"></div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:.74rem;color:var(--text-3)">Mão de obra</div>
              <input type="number" id="os-f-valor_mao_obra" class="form-control" style="width:130px;margin-top:4px" placeholder="0,00" value="${os?.valor_mao_obra||''}" min="0" step="0.01" oninput="recalcTotal()">
            </div>
            <div style="text-align:right">
              <div style="font-size:.74px;color:var(--text-3)">Total</div>
              <div style="font-size:1.1rem;font-weight:800;color:var(--green)" id="os-total-display">${fmt(os?.valor_total||0)}</div>
            </div>
          </div>
        </div>`;

      case 'photo_upload':
        if (!prefs.photos_enabled && !os) return '';
        return `
          <div class="form-group">
            <label class="form-label">Fotos</label>
            <div class="photo-grid" id="os-photos-grid">
              <label class="photo-add-btn" for="os-photo-input">
                <i data-lucide="camera" style="width:20px;height:20px"></i><span>Adicionar foto</span>
                <input type="file" id="os-photo-input" accept="image/*" multiple style="display:none" onchange="addOSPhotos(this)">
              </label>
            </div>
          </div>`;

      case 'signature_pad':
        if (!prefs.signature_enabled && !os) return '';
        return `
          <div class="form-group">
            <label class="form-label">Assinatura do Cliente</label>
            <canvas id="sig-pad" style="width:100%;height:120px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-md);touch-action:none"></canvas>
            <button type="button" onclick="clearSignature()" class="btn btn-ghost btn-sm" style="margin-top:4px">Limpar</button>
          </div>`;

      default: return '';
    }
  };

  // Remove modal anterior se existir
  document.getElementById('os-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'os-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="_closeModal('os-modal')">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>
      <div class="modal-body">
        ${os ? `
        <div class="form-group">
          <label class="form-label">Status</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="os-status-btns">
            ${Object.entries(STATUS_CONFIG).map(([k,v])=>`
              <button type="button" class="filter-btn ${os.status===k?'active':''}" onclick="setOSStatus('${k}',this)"
                style="${os.status===k?'border-color:'+v.color+';color:'+v.color+';background:'+v.color+'22':''}">
                ${v.label}
              </button>`).join('')}
          </div>
        </div>` : ''}

        ${fields.map(f => { try { return renderField(f); } catch(e) { console.error('Campo '+f.id, e); return ''; } }).join('')}

        <div class="form-group">
          <label class="form-label">Observações Internas</label>
          <textarea id="os-f-observacoes" class="form-control" rows="2" placeholder="Observações...">${os?.observacoes||''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('os-modal')">Cancelar</button>
        ${os?`<button class="btn btn-secondary" onclick="_closeModal('os-modal');openGenerateDocs('${os.id}')"><i data-lucide="file-text" style="width:14px;height:14px"></i> Docs</button>`:''}
        <button class="btn btn-primary" id="os-save-btn" onclick="saveOS()">
          <i data-lucide="save" style="width:14px;height:14px"></i> Salvar
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Popula itens
  if (os?.itens) {
    try { _osItems = typeof os.itens === 'string' ? JSON.parse(os.itens) : (os.itens||[]); }
    catch(e) { _osItems = []; }
  } else {
    _osItems = [];
  }
  _osStatus = os?.status || 'aguardando';

  renderOSItems();
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

function setOSStatus(status, btn) {
  _osStatus = status;
  document.querySelectorAll('#os-status-btns .filter-btn').forEach(b => {
    b.classList.remove('active');
    b.style.cssText = '';
  });
  const st = STATUS_CONFIG[status];
  if (btn && st) {
    btn.classList.add('active');
    btn.style.borderColor = st.color;
    btn.style.color = st.color;
    btn.style.background = st.color + '22';
  }
}

function addOSItem() {
  _osItems.push({ descricao:'', quantidade:1, valor_unit:0 });
  renderOSItems();
}

function renderOSItems() {
  const wrap = document.getElementById('os-items-list');
  if (!wrap) return;
  if (!_osItems.length) {
    wrap.innerHTML = '<div style="font-size:.78rem;color:var(--text-3);padding:8px 0">Nenhum item adicionado</div>';
    recalcTotal();
    return;
  }
  wrap.innerHTML = _osItems.map((item,i) => `
    <div style="display:grid;grid-template-columns:1fr 60px 90px 28px;gap:6px;align-items:center;margin-bottom:6px">
      <input type="text" class="form-control" style="font-size:.82rem" placeholder="Descrição" value="${(item.descricao||'').replace(/"/g,'&quot;')}"
        oninput="_osItems[${i}].descricao=this.value">
      <input type="number" class="form-control" style="font-size:.82rem;text-align:center" placeholder="Qtd" value="${item.quantidade||1}" min="1"
        oninput="_osItems[${i}].quantidade=+this.value;recalcTotal()">
      <input type="number" class="form-control" style="font-size:.82rem;text-align:right" placeholder="0,00" value="${item.valor_unit||''}" min="0" step="0.01"
        oninput="_osItems[${i}].valor_unit=+this.value;recalcTotal()">
      <button type="button" onclick="_osItems.splice(${i},1);renderOSItems()" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px">
        <i data-lucide="x" style="width:14px;height:14px"></i>
      </button>
    </div>`).join('');
  recalcTotal();
  if (window.lucide) lucide.createIcons();
}

function recalcTotal() {
  const itensTotal = _osItems.reduce((s,i) => s + ((i.quantidade||1)*(i.valor_unit||0)), 0);
  const maoObra    = parseFloat(document.getElementById('os-f-valor_mao_obra')?.value) || 0;
  const el = document.getElementById('os-total-display');
  if (el) el.textContent = fmt(itensTotal + maoObra);
}

function onPaymentChange(val) {
  const wrap = document.getElementById('parcelas-wrap');
  if (wrap) wrap.style.display = val === 'parcelado' ? 'block' : 'none';
}

function toggleFieldMin(wrapId) {
  const w = document.getElementById(wrapId);
  if (w) w.style.display = w.style.display === 'none' ? '' : 'none';
}

async function saveOS() {
  const seg  = _seg();
  const lang = _lang();
  const item = document.getElementById('os-f-item')?.value?.trim();
  if (!item) {
    UI.toast('⚠ Preencha o campo ' + (seg.labels[lang]?.item_field || 'equipamento'), 'warning');
    return;
  }

  const itensTotal = _osItems.reduce((s,i) => s + ((i.quantidade||1)*(i.valor_unit||0)), 0);
  const maoObra    = parseFloat(document.getElementById('os-f-valor_mao_obra')?.value) || 0;
  const total      = itensTotal + maoObra;

  const g = id => document.getElementById(id)?.value || null;

  const osData = {
    status:          _osStatus || 'aguardando',
    cliente_id:      g('os-f-cliente_id') || null,
    item,
    extra_1:         g('os-f-extra_1'),
    extra_2:         g('os-f-extra_2'),
    extra_3:         g('os-f-extra_3'),
    defeito:         g('os-f-defect'),
    diagnostico:     g('os-f-diagnosis'),
    tecnico_id:      g('os-f-tecnico_id') || null,
    garantia_dias:   parseInt(g('os-f-warranty')) || null,
    prioridade:      g('os-f-prioridade') || 'normal',
    data_entrega:    g('os-f-delivery'),
    forma_pagamento: g('os-f-forma_pagamento'),
    n_parcelas:      parseInt(g('os-f-n_parcelas')) || null,
    valor_mao_obra:  maoObra,
    valor_total:     total,
    itens:           JSON.stringify(_osItems),
    observacoes:     g('os-f-observacoes'),
  };

  // Remove nulos/vazios
  Object.keys(osData).forEach(k => {
    if (osData[k] === null || osData[k] === '' || osData[k] === undefined) delete osData[k];
  });

  const btn = document.getElementById('os-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    let saved;
    if (_osModalId) {
      saved = await API.updateOS(_osModalId, osData);
      await API.addHistoricoOS(_osModalId, `Status alterado para: ${statusLabel(osData.status)}`);
    } else {
      saved = await API.createOS(STATE.empresa.id, osData);
      if (osData.forma_pagamento === 'parcelado' && osData.n_parcelas > 1) {
        await API.createParcelas(STATE.empresa.id, saved.id, total, osData.n_parcelas, today());
      }
      if (!['orcamento','fiado','parcelado'].includes(osData.forma_pagamento) && total > 0) {
        await API.addCaixaEntry(STATE.empresa.id, {
          tipo:'entrada', descricao:`OS #${saved.numero} - ${item}`,
          valor:total, forma:osData.forma_pagamento, ordem_id:saved.id,
        });
      }
    }

    const cli = (APP.clientes||[]).find(c => c.id === osData.cliente_id);
    if (['concluido','retirada'].includes(osData.status) && cli?.telefone) {
      const msg = `Olá ${cli.nome}, sua ${seg.labels[lang]?.os_single||'OS'} #${saved.numero} está pronta! 🎉`;
      UI.toast('✅ OS salva! <a href="' + API.buildWhatsAppLink(cli.telefone,msg) + '" target="_blank" style="color:var(--green)">Avisar cliente</a>', 'success');
    } else {
      UI.toast('✅ OS salva!', 'success');
    }

    _closeModal('os-modal');
    APP.os = await API.getOS(STATE.empresa.id);
    renderOSList();
    App._updateOSBadge();

  } catch(e) {
    console.error('Erro saveOS:', e);
    UI.toast('❌ Erro: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px"></i> Salvar'; if(window.lucide) lucide.createIcons(); }
  }
}

function buildOSViewModal(os) {
  const seg  = _seg();
  const lang = _lang();
  const st   = STATUS_CONFIG[os.status] || { label:os.status, color:'var(--text-3)' };
  const itens = (() => { try { return typeof os.itens === 'string' ? JSON.parse(os.itens||'[]') : (os.itens||[]); } catch(e){ return []; } })();

  document.getElementById('os-view-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'os-view-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:580px">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">${seg.labels[lang]?.os_single||'OS'} #${os.numero}</h3>
          <span class="badge" style="background:${st.color}22;color:${st.color};border-color:${st.color}33">${st.label}</span>
        </div>
        <button class="modal-close" onclick="_closeModal('os-view-modal')">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div><div style="font-size:.72rem;color:var(--text-3)">${seg.labels[lang]?.item_field||'Item'}</div><div style="font-weight:600">${os.item||'–'}</div></div>
          ${os.extra_1?`<div><div style="font-size:.72rem;color:var(--text-3)">${seg.labels[lang]?.extra_field_1||'Info'}</div><div style="font-weight:600">${os.extra_1}</div></div>`:''}
          ${os.clientes?`<div><div style="font-size:.72rem;color:var(--text-3)">Cliente</div><div style="font-weight:600">${os.clientes.nome}</div>${os.clientes.telefone?`<div style="font-size:.78rem;color:var(--text-3)">${os.clientes.telefone}</div>`:''}</div>`:''}
          ${os.funcionarios?`<div><div style="font-size:.72rem;color:var(--text-3)">${seg.labels[lang]?.staff_field||'Técnico'}</div><div style="font-weight:600">${os.funcionarios.nome}</div></div>`:''}
        </div>
        ${os.defeito?`<div style="margin-bottom:12px"><div style="font-size:.72rem;color:var(--text-3)">${seg.labels[lang]?.defect_field||'Defeito'}</div><div style="background:var(--bg-2);border-radius:var(--radius-md);padding:10px;font-size:.86rem;line-height:1.5">${os.defeito}</div></div>`:''}
        ${os.diagnostico?`<div style="margin-bottom:12px"><div style="font-size:.72rem;color:var(--text-3)">${seg.labels[lang]?.diagnosis_field||'Diagnóstico'}</div><div style="background:var(--bg-2);border-radius:var(--radius-md);padding:10px;font-size:.86rem;line-height:1.5">${os.diagnostico}</div></div>`:''}
        ${itens.length?`
        <div style="margin-bottom:12px">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px">${seg.labels[lang]?.parts_field||'Itens'}</div>
          ${itens.map(i=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.84rem"><span>${i.descricao} × ${i.quantidade}</span><span style="font-weight:600">${fmt((i.quantidade||1)*(i.valor_unit||0))}</span></div>`).join('')}
          ${os.valor_mao_obra>0?`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.84rem;color:var(--text-2)"><span>Mão de obra</span><span>${fmt(os.valor_mao_obra)}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:800;font-size:1rem"><span>Total</span><span style="color:var(--green)">${fmt(os.valor_total||0)}</span></div>
        </div>`:`<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border);font-weight:800"><span>Total</span><span style="color:var(--green)">${fmt(os.valor_total||0)}</span></div>`}
        ${os.forma_pagamento?`<div style="font-size:.82rem;color:var(--text-2)">Pagamento: ${payLabel(os.forma_pagamento)}</div>`:''}
        ${os.observacoes?`<div style="margin-top:12px;padding:10px;background:var(--bg-2);border-radius:var(--radius-md);font-size:.82rem;color:var(--text-2)">${os.observacoes}</div>`:''}
        ${os.ordens_historico?.length?`
        <div style="margin-top:16px">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px">Histórico</div>
          ${os.ordens_historico.slice().reverse().map(h=>`
            <div style="font-size:.78rem;padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:8px">
              <span style="color:var(--text-3);white-space:nowrap">${fmtDatetime(h.criado_em)}</span>
              <span>${h.texto}</span>
            </div>`).join('')}
        </div>`:''}
      </div>
      <div class="modal-footer" style="flex-wrap:wrap;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="_closeModal('os-view-modal')">Fechar</button>
        ${os.clientes?.telefone?`<button class="btn btn-secondary btn-sm" onclick="openWhatsApp('${os.clientes.telefone}','${os.clientes.nome.replace(/'/g,"\\'")}','${os.numero}','${st.label}')"><i data-lucide="message-circle" style="width:13px;height:13px"></i> WhatsApp</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="_closeModal('os-view-modal');openGenerateDocs('${os.id}')"><i data-lucide="file-text" style="width:13px;height:13px"></i> PDF</button>
        <button class="btn btn-secondary btn-sm" onclick="_closeModal('os-view-modal');openEditOS('${os.id}')"><i data-lucide="pencil" style="width:13px;height:13px"></i> Editar</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteOS('${os.id}','${os.numero}')"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

function confirmDeleteOS(id, numero) {
  _closeModal('os-view-modal');
  UI.confirm(`Excluir OS #${numero}? Esta ação não pode ser desfeita.`, async () => {
    try {
      await API.deleteOS(id);
      APP.os = await API.getOS(STATE.empresa.id);
      renderOSList();
      App._updateOSBadge();
      UI.toast('🗑 OS excluída', 'info');
    } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
  });
}

function openWhatsApp(tel, nome, numero, status) {
  const seg  = _seg();
  const lang = _lang();
  const msg  = `Olá ${nome}! Sua ${seg.labels[lang]?.os_single||'OS'} #${numero} está com status: *${status}*.\nQualquer dúvida estamos à disposição! 😊`;
  window.open(API.buildWhatsAppLink(tel, msg), '_blank');
}

function openGenerateDocs(osId) { UI.toast('Gerador de documentos em breve!', 'info'); }
function openOSBatch()          { UI.toast('Criação em lote em breve!', 'info'); }
function openScanner(targetId)  { UI.toast('Scanner de câmera em breve!', 'info'); }
function openPIX(osId, valor)   { UI.toast('Gerando QR PIX... (em breve)', 'info'); }

function openNewClientInline() {
  const nome = prompt('Nome do novo cliente:');
  if (!nome) return;
  API.createCliente(STATE.empresa.id, { nome }).then(c => {
    APP.clientes.push(c);
    const sel = document.getElementById('os-f-cliente_id');
    if (sel) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.nome; opt.selected = true;
      sel.appendChild(opt);
    }
    UI.toast('✅ Cliente criado!', 'success');
  }).catch(e => UI.toast('❌ ' + e.message, 'error'));
}

function addOSPhotos(input) { UI.toast('Upload de fotos em breve!', 'info'); }
function clearSignature()   { const c = document.getElementById('sig-pad'); if(c){ const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); } }

// ── CLIENTES ───────────────────────────────────────────────
function renderClients() {
  const wrap = document.getElementById('clients-list');
  if (!wrap) return;
  const q = (document.getElementById('client-search')?.value||'').toLowerCase();
  let lista = [...(APP.clientes||[])];
  if (q) lista = lista.filter(c => (c.nome||'').toLowerCase().includes(q)||(c.telefone||'').includes(q)||(c.cpf||'').includes(q));

  const count = document.getElementById('clients-count');
  if (count) count.textContent = lista.length + ' cadastrado' + (lista.length!==1?'s':'');

  if (!lista.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="users" style="width:36px;height:36px"></i></div><div class="empty-title">Nenhum cliente encontrado</div><button class="btn btn-primary mt-3" onclick="openNewClient()"><i data-lucide="user-plus" style="width:14px;height:14px"></i> Novo Cliente</button></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  wrap.innerHTML = `<div style="display:grid;gap:8px">${lista.map(c => `
    <div class="card card-sm" style="cursor:pointer" onclick="openViewClient('${c.id}')">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:42px;height:42px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:.84rem;font-weight:700;color:#fff;flex-shrink:0">${initials(c.nome)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">${c.nome} ${c.nivel==='vip'?'<span class="badge badge-warning">⭐ VIP</span>':''} ${c.nivel==='premium'?'<span class="badge badge-purple">💎 Premium</span>':''}</div>
          <div style="font-size:.78rem;color:var(--text-3)">${c.telefone||'Sem telefone'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${c.total_gasto?`<div style="font-size:.82rem;font-weight:700;color:var(--green)">${fmt(c.total_gasto)}</div>`:''}
          ${c.aniversario?`<div style="font-size:.72rem;color:var(--text-3)">🎂 ${fmtDate(c.aniversario)}</div>`:''}
        </div>
      </div>
    </div>`).join('')}</div>`;
  if (window.lucide) lucide.createIcons();
}

function filterClients()              { renderClients(); }
function openNewClient()              { buildClientModal(null); }

async function openViewClient(id) {
  const c = (APP.clientes||[]).find(x => x.id === id);
  if (!c) return;
  try {
    const hist = await API.getHistoricoCliente(id);
    buildClientViewModal(c, hist);
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

function buildClientModal(client) {
  document.getElementById('client-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'client-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3 class="modal-title">${client ? 'Editar Cliente' : 'Novo Cliente'}</h3>
        <button class="modal-close" onclick="_closeModal('client-modal')"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Nome *</label><input type="text" id="cli-nome" class="form-control" value="${client?.nome||''}" placeholder="Nome completo"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Telefone</label><input type="tel" id="cli-tel" class="form-control" value="${client?.telefone||''}" placeholder="(11) 99999-9999"></div>
          <div class="form-group"><label class="form-label">CPF</label><input type="text" id="cli-cpf" class="form-control" value="${client?.cpf||''}" placeholder="000.000.000-00"></div>
        </div>
        <div class="form-group"><label class="form-label">E-mail</label><input type="email" id="cli-email" class="form-control" value="${client?.email||''}" placeholder="email@exemplo.com"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Aniversário</label><input type="date" id="cli-aniv" class="form-control" value="${client?.aniversario||''}"></div>
          <div class="form-group"><label class="form-label">Nível</label>
            <select id="cli-nivel" class="form-control">
              <option value="normal" ${!client?.nivel||client?.nivel==='normal'?'selected':''}>Normal</option>
              <option value="vip"    ${client?.nivel==='vip'?'selected':''}>⭐ VIP</option>
              <option value="premium"${client?.nivel==='premium'?'selected':''}>💎 Premium</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Endereço</label><input type="text" id="cli-end" class="form-control" value="${client?.endereco||''}" placeholder="Rua, Nº, Bairro, Cidade"></div>
        <div class="form-group"><label class="form-label">Observações</label><textarea id="cli-obs" class="form-control" rows="2">${client?.observacoes||''}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('client-modal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveClient('${client?.id||''}')"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

async function saveClient(id) {
  const nome = document.getElementById('cli-nome')?.value?.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', 'warning'); return; }
  const dados = {
    nome,
    telefone:    document.getElementById('cli-tel')?.value||null,
    cpf:         document.getElementById('cli-cpf')?.value||null,
    email:       document.getElementById('cli-email')?.value||null,
    aniversario: document.getElementById('cli-aniv')?.value||null,
    nivel:       document.getElementById('cli-nivel')?.value||'normal',
    endereco:    document.getElementById('cli-end')?.value||null,
    observacoes: document.getElementById('cli-obs')?.value||null,
  };
  try {
    if (id) {
      const up = await API.updateCliente(id, dados);
      const idx = (APP.clientes||[]).findIndex(c => c.id === id);
      if (idx >= 0) APP.clientes[idx] = up;
    } else {
      const novo = await API.createCliente(STATE.empresa.id, dados);
      APP.clientes.push(novo);
    }
    _closeModal('client-modal');
    renderClients();
    UI.toast('✅ Cliente salvo!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

function buildClientViewModal(c, historico) {
  document.getElementById('client-view-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'client-view-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700;color:#fff">${initials(c.nome)}</div>
          <div><h3 class="modal-title" style="margin:0">${c.nome}</h3><div style="font-size:.78rem;color:var(--text-3)">${c.telefone||''}</div></div>
        </div>
        <button class="modal-close" onclick="_closeModal('client-view-modal')"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        ${c.email?`<div style="font-size:.84rem;color:var(--text-2);margin-bottom:6px">✉ ${c.email}</div>`:''}
        ${c.endereco?`<div style="font-size:.84rem;color:var(--text-2);margin-bottom:6px">📍 ${c.endereco}</div>`:''}
        ${c.aniversario?`<div style="font-size:.84rem;color:var(--text-2);margin-bottom:12px">🎂 ${fmtDate(c.aniversario)}</div>`:''}
        <div style="margin-bottom:16px">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px">HISTÓRICO (${(historico||[]).length})</div>
          ${(historico||[]).length ? (historico||[]).map(o=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.82rem;cursor:pointer" onclick="_closeModal('client-view-modal');openViewOS('${o.id}')">
              <div><span style="color:var(--text-3)">#${o.numero}</span> ${o.item}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="badge" style="font-size:.68rem">${statusLabel(o.status)}</span>
                <span style="font-weight:600;color:var(--green)">${fmt(o.valor_total||0)}</span>
              </div>
            </div>`).join('') : '<div style="font-size:.82rem;color:var(--text-3);padding:8px 0">Sem histórico</div>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('client-view-modal')">Fechar</button>
        ${c.telefone?`<button class="btn btn-secondary btn-sm" onclick="window.open(API.buildWhatsAppLink('${c.telefone}','Olá ${c.nome.replace(/'/g,"\\'")}!'),'_blank')"><i data-lucide="message-circle" style="width:13px;height:13px"></i> WhatsApp</button>`:''}
        <button class="btn btn-primary" onclick="_closeModal('client-view-modal');buildClientModal(${JSON.stringify(c).replace(/"/g,'&quot;')})"><i data-lucide="pencil" style="width:13px;height:13px"></i> Editar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

// ── ESTOQUE ────────────────────────────────────────────────
function renderStock() {
  const tbody = document.getElementById('stock-tbody');
  if (!tbody) return;
  const q = (document.getElementById('stock-search')?.value||'').toLowerCase();
  let lista = [...(APP.produtos||[])];
  if (q) lista = lista.filter(p => (p.nome||'').toLowerCase().includes(q)||(p.codigo||'').toLowerCase().includes(q));

  const count = document.getElementById('stock-count');
  if (count) count.textContent = lista.length + ' produto' + (lista.length!==1?'s':'');

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--text-3)"><i data-lucide="package" style="width:32px;height:32px;display:block;margin:0 auto 12px;opacity:.3"></i>Nenhum produto</td></tr>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  tbody.innerHTML = lista.map(p => {
    const margin = p.preco_custo > 0 ? ((p.preco_venda-p.preco_custo)/p.preco_venda*100).toFixed(0) : 0;
    const baixo  = p.estoque_minimo > 0 && (p.quantidade||0) <= p.estoque_minimo;
    return `<tr ${baixo?'style="background:rgba(251,146,60,.05)"':''}>
      <td><div style="font-weight:600;font-size:.86rem">${p.nome}</div>${p.codigo?`<div style="font-size:.72rem;color:var(--text-3)">${p.codigo}</div>`:''}${baixo?'<span class="badge badge-warning" style="font-size:.68rem">⚠ Baixo</span>':''}</td>
      <td style="font-family:monospace;font-weight:600;color:${baixo?'var(--orange)':'var(--text-1)'}">${p.quantidade||0}</td>
      <td style="font-family:monospace;font-size:.82rem;color:var(--text-2)">${fmt(p.preco_custo||0)}</td>
      <td style="font-family:monospace;font-weight:600">${fmt(p.preco_venda||0)}</td>
      <td><span class="badge ${margin>=50?'badge-success':margin>=30?'badge-warning':''}" style="font-size:.72rem">${margin}%</span></td>
      <td style="font-size:.78rem;color:var(--text-3)">${p.fornecedor||'–'}</td>
      <td>
        <button class="btn btn-ghost btn-icon" onclick="openEditProduct('${p.id}')"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
        <button class="btn btn-ghost btn-icon" onclick="confirmDeleteProduct('${p.id}','${(p.nome||'').replace(/'/g,"\\'")}')"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
      </td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function filterStock()     { renderStock(); }
function filterLowStock()  { renderStock(); }
function openNewProduct()  { buildProductModal(null); }
function openEditProduct(id) {
  const p = (APP.produtos||[]).find(x => x.id === id);
  if (p) buildProductModal(p);
}

function buildProductModal(prod) {
  document.getElementById('product-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'product-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3 class="modal-title">${prod ? 'Editar Produto' : 'Novo Produto'}</h3>
        <button class="modal-close" onclick="_closeModal('product-modal')"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Nome *</label><input type="text" id="prd-nome" class="form-control" value="${prod?.nome||''}" placeholder="Nome do produto"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Código</label><input type="text" id="prd-cod" class="form-control" value="${prod?.codigo||''}" placeholder="SKU-001"></div>
          <div class="form-group"><label class="form-label">Cód. Barras</label><input type="text" id="prd-barcode" class="form-control" value="${prod?.codigo_barras||''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Preço de Custo</label><input type="number" id="prd-custo" class="form-control" value="${prod?.preco_custo||''}" placeholder="0,00" min="0" step="0.01" oninput="calcMargemProd()"></div>
          <div class="form-group"><label class="form-label">Preço de Venda</label><input type="number" id="prd-venda" class="form-control" value="${prod?.preco_venda||''}" placeholder="0,00" min="0" step="0.01" oninput="calcMargemProd()"></div>
        </div>
        <div id="prd-margin-display" style="font-size:.78rem;color:var(--text-3);margin-bottom:12px;padding:6px 10px;background:var(--bg-2);border-radius:var(--radius-sm)">Margem: –</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Quantidade</label><input type="number" id="prd-qtd" class="form-control" value="${prod?.quantidade||0}" min="0"></div>
          <div class="form-group"><label class="form-label">Estoque Mínimo</label><input type="number" id="prd-min" class="form-control" value="${prod?.estoque_minimo||''}" placeholder="Ex: 5" min="0"></div>
        </div>
        <div class="form-group"><label class="form-label">Categoria</label><input type="text" id="prd-cat" class="form-control" value="${prod?.categoria||''}" placeholder="Ex: Telas, Baterias..."></div>
        <div class="form-group"><label class="form-label">Fornecedor</label><input type="text" id="prd-forn" class="form-control" value="${prod?.fornecedor||''}" placeholder="Nome do fornecedor"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('product-modal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveProduct('${prod?.id||''}')"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => { lucide.createIcons(); calcMargemProd(); }, 60);
}

function calcMargemProd() {
  const custo = parseFloat(document.getElementById('prd-custo')?.value)||0;
  const venda = parseFloat(document.getElementById('prd-venda')?.value)||0;
  const el    = document.getElementById('prd-margin-display');
  if (!el) return;
  if (custo > 0 && venda > 0) {
    const m = ((venda-custo)/venda*100).toFixed(1);
    el.textContent = `Margem: ${m}% · Lucro: ${fmt(venda-custo)} por unidade`;
    el.style.color = m >= 40 ? 'var(--green)' : m >= 20 ? 'var(--yellow)' : 'var(--red)';
  } else { el.textContent = 'Margem: –'; el.style.color = ''; }
}

async function saveProduct(id) {
  const nome = document.getElementById('prd-nome')?.value?.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', 'warning'); return; }
  const dados = {
    nome, codigo: document.getElementById('prd-cod')?.value||null,
    codigo_barras: document.getElementById('prd-barcode')?.value||null,
    preco_custo:   parseFloat(document.getElementById('prd-custo')?.value)||0,
    preco_venda:   parseFloat(document.getElementById('prd-venda')?.value)||0,
    quantidade:    parseInt(document.getElementById('prd-qtd')?.value)||0,
    estoque_minimo:parseInt(document.getElementById('prd-min')?.value)||0,
    categoria:     document.getElementById('prd-cat')?.value||null,
    fornecedor:    document.getElementById('prd-forn')?.value||null,
  };
  try {
    if (id) {
      const up = await API.updateProduto(id, dados);
      const idx = (APP.produtos||[]).findIndex(p => p.id === id);
      if (idx >= 0) APP.produtos[idx] = up;
    } else {
      APP.produtos.push(await API.createProduto(STATE.empresa.id, dados));
    }
    _closeModal('product-modal');
    renderStock();
    UI.toast('✅ Produto salvo!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

function confirmDeleteProduct(id, nome) {
  UI.confirm(`Excluir "${nome}"?`, async () => {
    try {
      await API.deleteProduto(id);
      APP.produtos = (APP.produtos||[]).filter(p => p.id !== id);
      renderStock();
      UI.toast('🗑 Produto excluído', 'info');
    } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
  });
}

function openSuppliers() { UI.toast('Fornecedores em breve!', 'info'); }

// ── CAIXA / FINANCEIRO ─────────────────────────────────────
async function renderCash() {
  try {
    const data = await API.getCaixaSummary(STATE.empresa.id, today(), today());
    const set = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
    set('cash-entries-val', fmt(data.entradas));
    set('cash-exits-val',   fmt(data.saidas));
    set('cash-balance-val', fmt(data.saldo));
    const dateEl = document.getElementById('cash-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
    renderCashTable(data.items);
    await renderContasPagar();
    await renderContasReceber();
  } catch(e) { console.error('Erro cash:', e); }
}

function renderCashTable(items) {
  const tbody = document.getElementById('cash-tbody');
  if (!tbody) return;
  if (!(items||[]).length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Sem movimentações hoje</td></tr>'; return; }
  tbody.innerHTML = items.map(i => `
    <tr>
      <td style="font-size:.78rem;color:var(--text-3);white-space:nowrap">${fmtDatetime(i.criado_em)}</td>
      <td style="font-size:.84rem">${i.descricao||'–'}</td>
      <td style="font-family:monospace;font-weight:600;color:${i.tipo==='entrada'?'var(--green)':'var(--red)'}">${i.tipo==='entrada'?'+':'-'}${fmt(i.valor)}</td>
      <td style="font-size:.78rem;color:var(--text-2)">${payLabel(i.forma)||'–'}</td>
      <td style="font-size:.78rem;color:var(--text-3)">${i.ordem_id?'#OS':''}</td>
    </tr>`).join('');
}

async function renderContasPagar() {
  try {
    const lista = await API.getContasPagar(STATE.empresa.id);
    APP.contasPagar = lista;
    const tbody = document.getElementById('payable-tbody');
    if (!tbody) return;
    if (!lista.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Nenhuma conta cadastrada</td></tr>'; return; }
    tbody.innerHTML = lista.map(c => {
      const venc = c.vencimento < today();
      const st   = c.pago ? '<span class="badge badge-success">Pago</span>' : venc ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge">Pendente</span>';
      return `<tr>
        <td style="font-size:.86rem;font-weight:500">${c.descricao}</td>
        <td style="font-weight:600;color:var(--red)">${fmt(c.valor)}</td>
        <td style="font-size:.82rem;color:${venc&&!c.pago?'var(--red)':'var(--text-2)'}">${fmtDate(c.vencimento)}</td>
        <td>${st}</td>
        <td>${!c.pago?`<button class="btn btn-ghost btn-sm" onclick="pagarConta('${c.id}')"><i data-lucide="check" style="width:12px;height:12px"></i></button>`:''}<button class="btn btn-ghost btn-icon" onclick="deleteContaPagar('${c.id}')" style="color:var(--red)"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button></td>
      </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch(e) { console.error('Erro contas pagar:', e); }
}

async function renderContasReceber() {
  try {
    const lista = await API.getContasReceber(STATE.empresa.id);
    APP.contasReceber = lista;
    const tbody = document.getElementById('receivable-tbody');
    if (!tbody) return;
    tbody.innerHTML = lista.map(c => {
      const venc = c.vencimento < today();
      const st   = c.recebido ? '<span class="badge badge-success">Recebido</span>' : venc ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge">Pendente</span>';
      return `<tr>
        <td style="font-size:.86rem;font-weight:500">${c.clientes?.nome||'–'}</td>
        <td style="font-weight:600;color:var(--green)">${fmt(c.valor)}</td>
        <td style="font-size:.82rem;color:${venc&&!c.recebido?'var(--red)':'var(--text-2)'}">${fmtDate(c.vencimento)}</td>
        <td style="font-size:.78rem;color:var(--text-3)">${c.ordem_id?'#OS':''}</td>
        <td>${st}</td>
        <td>${!c.recebido?`<button class="btn btn-ghost btn-sm" onclick="receberConta('${c.id}')"><i data-lucide="check" style="width:12px;height:12px"></i></button>`:''}</td>
      </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch(e) { console.error('Erro contas receber:', e); }
}

function switchFinanceTab(tab, btn) {
  ['cash','payable','receivable','cashflow'].forEach(t => {
    const el = document.getElementById('finance-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.finance-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'cashflow') renderCashFlowChart();
}

function renderCashFlowChart() {
  const canvas = document.getElementById('cashflow-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  APP.charts.cashflow?.destroy();
  APP.charts.cashflow = new Chart(canvas, {
    type:'bar',
    data:{ labels:Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});}),
      datasets:[
        {label:'Entrada',data:Array.from({length:30},()=>Math.random()*500),backgroundColor:'rgba(52,211,153,.5)',borderColor:'#34D399',borderWidth:1},
        {label:'Saída',  data:Array.from({length:30},()=>Math.random()*200),backgroundColor:'rgba(248,113,113,.5)',borderColor:'#F87171',borderWidth:1},
      ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#9CA3AF',font:{size:11}}}},scales:{x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6B7280',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6B7280',font:{size:10}}}}}
  });
}

function openNewTransaction() {
  document.getElementById('transaction-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'transaction-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><h3 class="modal-title">Novo Lançamento</h3><button class="modal-close" onclick="_closeModal('transaction-modal')"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Tipo</label>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-primary" style="flex:1" id="tipo-entrada" onclick="setTipoLanc('entrada')">+ Entrada</button>
            <button type="button" class="btn btn-ghost"   style="flex:1;color:var(--red);border-color:var(--red)" id="tipo-saida" onclick="setTipoLanc('saida')">– Saída</button>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Descrição *</label><input type="text" id="lanc-desc" class="form-control" placeholder="Ex: Pagamento OS #0042"></div>
        <div class="form-group"><label class="form-label">Valor *</label><input type="number" id="lanc-valor" class="form-control" placeholder="0,00" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">Forma de Pagamento</label>
          <select id="lanc-forma" class="form-control">${Object.entries(PAY_CONFIG).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('transaction-modal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveLancamento()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  window._lancTipo = 'entrada';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

function setTipoLanc(tipo) {
  window._lancTipo = tipo;
  const e = document.getElementById('tipo-entrada');
  const s = document.getElementById('tipo-saida');
  if (e) e.className = tipo==='entrada' ? 'btn btn-primary' : 'btn btn-ghost';
  if (s) s.className = tipo==='saida'   ? 'btn btn-danger'  : 'btn btn-ghost';
}

async function saveLancamento() {
  const desc  = document.getElementById('lanc-desc')?.value?.trim();
  const valor = parseFloat(document.getElementById('lanc-valor')?.value);
  if (!desc || !valor) { UI.toast('⚠ Preencha todos os campos', 'warning'); return; }
  try {
    await API.addCaixaEntry(STATE.empresa.id, {
      tipo: window._lancTipo || 'entrada', descricao:desc, valor,
      forma: document.getElementById('lanc-forma')?.value || 'dinheiro',
    });
    _closeModal('transaction-modal');
    renderCash();
    UI.toast('✅ Lançamento registrado!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

function openCashBleed() {
  const v = prompt('Valor da sangria (R$):');
  if (!v || isNaN(parseFloat(v))) return;
  API.addCaixaEntry(STATE.empresa.id, {tipo:'saida',descricao:'Sangria de caixa',valor:parseFloat(v),forma:'dinheiro'})
    .then(() => { renderCash(); UI.toast('✅ Sangria registrada!', 'success'); })
    .catch(e => UI.toast('❌ ' + e.message, 'error'));
}

function openNewPayable() {
  const desc  = prompt('Descrição da conta:');
  if (!desc) return;
  const valor = parseFloat(prompt('Valor (R$):'));
  if (!valor || isNaN(valor)) return;
  const venc  = prompt('Vencimento (AAAA-MM-DD):') || today();
  API.createContaPagar(STATE.empresa.id, { descricao:desc, valor, vencimento:venc })
    .then(() => { renderContasPagar(); UI.toast('✅ Conta adicionada!', 'success'); })
    .catch(e => UI.toast('❌ ' + e.message, 'error'));
}

async function pagarConta(id) {
  try {
    await API.updateContaPagar(id, { pago:true, pago_em:today() });
    renderContasPagar();
    UI.toast('✅ Pago!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

async function deleteContaPagar(id) {
  try { await API.deleteContaPagar(id); renderContasPagar(); UI.toast('🗑 Removida', 'info'); }
  catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

async function receberConta(id) {
  try {
    await API.updateContaReceber(id, { recebido:true, recebido_em:today() });
    renderContasReceber();
    UI.toast('✅ Confirmado!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

// ── AGENDA ─────────────────────────────────────────────────
function renderCalendar() {
  const wrap = document.getElementById('cal-grid-wrap');
  if (!wrap) return;
  const date   = APP.calDate;
  const year   = date.getFullYear();
  const month  = date.getMonth();
  const title  = document.getElementById('cal-title');
  if (title) title.textContent = date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr    = today();
  const dayNames    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const eventosByDay = {};
  (APP.agenda||[]).forEach(e => {
    const d = e.data_inicio?.split('T')[0];
    if (d) { if (!eventosByDay[d]) eventosByDay[d]=[]; eventosByDay[d].push(e); }
  });

  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:8px">${dayNames.map(d=>`<div style="text-align:center;font-size:.72rem;font-weight:600;color:var(--text-3);padding:8px 4px">${d}</div>`).join('')}</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;

  for (let i=0; i<firstDay; i++) html += `<div style="height:60px;background:var(--bg);border-radius:6px"></div>`;

  for (let d=1; d<=daysInMonth; d++) {
    const ds  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isTd= ds === todayStr;
    const evs = eventosByDay[ds]||[];
    html += `<div onclick="selectCalDay('${ds}')" style="min-height:60px;background:${isTd?'var(--blue-dim)':'var(--bg-2)'};border:1px solid ${isTd?'var(--blue)':'var(--border)'};border-radius:6px;padding:5px;cursor:pointer">
      <div style="font-size:.78rem;font-weight:${isTd?800:500};color:${isTd?'var(--blue)':'var(--text-2)'};margin-bottom:3px">${d}</div>
      ${evs.slice(0,2).map(e=>`<div style="font-size:.66rem;padding:2px 4px;border-radius:3px;background:${e.cor||'var(--blue)'}33;color:${e.cor||'var(--blue)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px">${e.titulo}</div>`).join('')}
      ${evs.length>2?`<div style="font-size:.62rem;color:var(--text-3)">+${evs.length-2}</div>`:''}
    </div>`;
  }
  html += '</div>';
  wrap.innerHTML = html;

  const periodoEl = document.getElementById('schedule-period');
  if (periodoEl) periodoEl.textContent = date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}

async function selectCalDay(dateStr) {
  const evs = (APP.agenda||[]).filter(e => e.data_inicio?.startsWith(dateStr));
  if (!evs.length) { openNewSchedule(dateStr); return; }
  UI.toast(evs.length + ' evento(s) em ' + fmtDate(dateStr), 'info');
}

function calPrev() { const d=APP.calDate; APP.calDate=new Date(d.getFullYear(),d.getMonth()-1,1); renderCalendar(); }
function calNext() { const d=APP.calDate; APP.calDate=new Date(d.getFullYear(),d.getMonth()+1,1); renderCalendar(); }

function openNewSchedule(data) {
  document.getElementById('schedule-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'schedule-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h3 class="modal-title">Novo Evento</h3><button class="modal-close" onclick="_closeModal('schedule-modal')"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Título *</label><input type="text" id="sched-titulo" class="form-control" placeholder="Ex: Visita técnica - João"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Tipo</label>
            <select id="sched-tipo" class="form-control"><option value="os">OS Agendada</option><option value="visita">Visita Técnica</option><option value="cobranca">Cobrança</option><option value="geral">Geral</option></select>
          </div>
          <div class="form-group"><label class="form-label">Cor</label><input type="color" id="sched-cor" class="form-control" value="#38BDF8" style="height:42px;padding:4px"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Data *</label><input type="date" id="sched-data" class="form-control" value="${data||today()}"></div>
          <div class="form-group"><label class="form-label">Hora</label><input type="time" id="sched-hora" class="form-control" value="09:00"></div>
        </div>
        <div class="form-group"><label class="form-label">Cliente</label>
          <select id="sched-cliente" class="form-control"><option value="">Sem cliente</option>${(APP.clientes||[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Técnico</label>
          <select id="sched-tecnico" class="form-control"><option value="">Sem atribuição</option>${(APP.funcionarios||[]).map(f=>`<option value="${f.id}">${f.nome}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Observações</label><textarea id="sched-obs" class="form-control" rows="2" placeholder="Observações..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('schedule-modal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveSchedule()"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

async function saveSchedule() {
  const titulo = document.getElementById('sched-titulo')?.value?.trim();
  const data   = document.getElementById('sched-data')?.value;
  if (!titulo || !data) { UI.toast('⚠ Preencha título e data', 'warning'); return; }
  const hora = document.getElementById('sched-hora')?.value || '00:00';
  try {
    const novo = await API.createEvento(STATE.empresa.id, {
      titulo, tipo: document.getElementById('sched-tipo')?.value||'geral',
      cor:  document.getElementById('sched-cor')?.value||'#38BDF8',
      data_inicio: data + 'T' + hora + ':00',
      cliente_id:  document.getElementById('sched-cliente')?.value||null,
      tecnico_id:  document.getElementById('sched-tecnico')?.value||null,
      descricao:   document.getElementById('sched-obs')?.value||null,
    });
    APP.agenda.push(novo);
    _closeModal('schedule-modal');
    renderCalendar();
    UI.toast('✅ Evento criado!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

// ── ANALYTICS ──────────────────────────────────────────────
async function renderAnalytics() {
  try {
    const periodos = {
      month:      { from: today().slice(0,7)+'-01', to: today() },
      last_month: (() => { const d=new Date(); d.setMonth(d.getMonth()-1); return { from:d.toISOString().slice(0,7)+'-01', to:new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().split('T')[0] }; })(),
      quarter:    (() => { const d=new Date(); d.setMonth(d.getMonth()-2); return { from:d.toISOString().slice(0,7)+'-01', to:today() }; })(),
      year:       { from: today().slice(0,4)+'-01-01', to: today() },
    };
    const { from, to } = periodos[APP.anPeriodo]||periodos.month;
    const data = await API.getAnalytics(STATE.empresa.id, from, to);

    const set = (id, val) => { const e=document.getElementById(id); if(e) e.textContent=val; };
    set('an-revenue', fmt(data.faturamento));
    set('an-profit',  fmt(data.lucro));
    set('an-ticket',  fmt(data.ticket_medio));

    const metas = await API.getMetas(STATE.empresa.id);
    const metaFat = metas.find(m=>m.tipo==='faturamento')?.valor_meta||0;
    const pct = metaFat > 0 ? Math.min(100,(data.faturamento/metaFat*100)).toFixed(0) : 0;
    set('an-goal-pct', pct + '%');

    renderPaymentChart(data.by_payment);

    const tsWrap = document.getElementById('top-services-list');
    if (tsWrap) {
      tsWrap.innerHTML = (data.top_services||[]).map(([nome, count]) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.84rem"><span>${nome}</span><span class="badge">${count}x</span></div>`
      ).join('') || '<div style="color:var(--text-3);font-size:.82rem;padding:12px 0">Sem dados</div>';
    }
  } catch(e) { console.error('Erro analytics:', e); }
}

function setAnalyticsPeriod(periodo, btn) {
  APP.anPeriodo = periodo;
  document.querySelectorAll('#page-analytics .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAnalytics();
}

function renderPaymentChart(byPayment) {
  const canvas = document.getElementById('payment-chart');
  if (!canvas || !Object.keys(byPayment||{}).length || typeof Chart === 'undefined') return;
  APP.charts.payment?.destroy();
  APP.charts.payment = new Chart(canvas, {
    type:'doughnut',
    data:{ labels:Object.keys(byPayment).map(payLabel), datasets:[{data:Object.values(byPayment),backgroundColor:['#38BDF8','#34D399','#A78BFA','#FB923C','#F472B6','#FBBF24','#60A5FA'],borderWidth:0}] },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#9CA3AF',font:{size:10},padding:8,boxWidth:10}}}}
  });
}

// ── IA ─────────────────────────────────────────────────────
function renderAI() {
  const wrap = document.getElementById('ai-cards');
  if (!wrap) return;
  const cards = [
    { icon:'trending-up',   color:'var(--blue)',   title:'Análise do Negócio',    desc:'Visão geral e pontos de melhoria com base nos seus dados',   fn:'askAI_business' },
    { icon:'lightbulb',     color:'var(--yellow)', title:'Sugestões de Preço',    desc:'IA analisa sua margem e sugere ajustes nos preços',           fn:'askAI_pricing' },
    { icon:'target',        color:'var(--green)',  title:'Meta do Próximo Mês',   desc:'Projeção inteligente baseada no histórico',                   fn:'askAI_goal' },
    { icon:'message-circle',color:'var(--purple)', title:'Mensagem para Cliente', desc:'Gera mensagem personalizada de cobrança ou follow-up',        fn:'askAI_message' },
    { icon:'package',       color:'var(--orange)', title:'Previsão de Estoque',   desc:'Quando reabastecer e quanto comprar de cada produto',         fn:'askAI_stock' },
    { icon:'wrench',        color:'var(--text-2)', title:'Diagnóstico Técnico',   desc:'Descreva o defeito e a IA sugere o diagnóstico provável',     fn:'askAI_diagnosis' },
  ];
  wrap.innerHTML = cards.map(c => `
    <div class="card" style="cursor:pointer;transition:all .2s" onclick="${c.fn}()">
      <div style="width:44px;height:44px;border-radius:12px;background:${c.color}22;display:flex;align-items:center;justify-content:center;margin-bottom:14px">
        <i data-lucide="${c.icon}" style="width:22px;height:22px;color:${c.color}"></i>
      </div>
      <div style="font-size:.92rem;font-weight:700;margin-bottom:6px">${c.title}</div>
      <div style="font-size:.78rem;color:var(--text-2);line-height:1.5">${c.desc}</div>
      <div style="margin-top:14px"><span class="btn btn-secondary btn-sm" style="font-size:.74rem"><i data-lucide="sparkles" style="width:12px;height:12px"></i> Gerar com IA</span></div>
    </div>`).join('');
  if (window.lucide) lucide.createIcons();
}

function showAIResponse(titulo, conteudo) {
  const modal = document.createElement('div');
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:540px">
      <div class="modal-header">
        <h3 class="modal-title"><i data-lucide="sparkles" style="width:16px;height:16px;color:var(--purple);margin-right:6px"></i>${titulo}</h3>
        <button class="modal-close" onclick="this.closest('.modal-wrap').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body"><div style="font-size:.88rem;line-height:1.7;color:var(--text-1);white-space:pre-wrap">${conteudo}</div></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-wrap').remove();document.body.style.overflow=''">Fechar</button>
        <button class="btn btn-secondary" onclick="navigator.clipboard?.writeText(this.dataset.c).then(()=>UI.toast('✅ Copiado!','success'))" data-c="${String(conteudo).replace(/"/g,'&quot;')}"><i data-lucide="copy" style="width:14px;height:14px"></i> Copiar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

async function askAI_business() {
  UI.toast('Analisando seu negócio...', 'info');
  try {
    const data = await API.getDashboardData(STATE.empresa.id);
    const resp = await API.askAI(`Analise estes dados do meu negócio e dê 3 sugestões práticas:\n${JSON.stringify(data)}`, { empresa:STATE.empresa?.nome });
    showAIResponse('Análise do Negócio', resp);
  } catch(e) { UI.toast('❌ IA indisponível no momento', 'error'); }
}
async function askAI_diagnosis() {
  const def = prompt('Descreva o defeito ou problema:');
  if (!def) return;
  UI.toast('Consultando IA...', 'info');
  try {
    const resp = await API.askAI(`Sou técnico. O cliente relatou: "${def}". Quais diagnósticos são mais prováveis?`);
    showAIResponse('Diagnóstico Técnico', resp);
  } catch(e) { UI.toast('❌ IA indisponível no momento', 'error'); }
}
async function askAI_goal() {
  UI.toast('Calculando meta...', 'info');
  try {
    const data = await API.getAnalytics(STATE.empresa.id, today().slice(0,7)+'-01', today());
    const resp = await API.askAI(`Faturamento atual: ${fmt(data.faturamento)}. Sugira uma meta para o próximo mês e estratégias.`);
    showAIResponse('Meta Sugerida', resp);
  } catch(e) { UI.toast('❌ IA indisponível no momento', 'error'); }
}
async function askAI_pricing()  { UI.toast('Em desenvolvimento...', 'info'); }
async function askAI_message()  { UI.toast('Em desenvolvimento...', 'info'); }
async function askAI_stock()    { UI.toast('Em desenvolvimento...', 'info'); }

// ── NOTIFICAÇÕES ───────────────────────────────────────────
function renderNotifications() {
  const wrap = document.getElementById('notif-list');
  if (!wrap) return;
  if (!(APP.notifs||[]).length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="bell-off" style="width:32px;height:32px"></i></div><div class="empty-title">Sem notificações</div></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  const icons = { os_ready:'package-check', payment:'dollar-sign', low_stock:'alert-triangle', birthday:'cake', overdue:'clock', new_client:'user-plus' };
  wrap.innerHTML = (APP.notifs||[]).map(n => `
    <div onclick="markNotifRead('${n.id}',this)" style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);cursor:pointer;opacity:${n.lida?.6:1}">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--blue-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i data-lucide="${icons[n.tipo]||'bell'}" style="width:16px;height:16px;color:var(--blue)"></i>
      </div>
      <div style="flex:1">
        <div style="font-size:.86rem;font-weight:${n.lida?400:600}">${n.titulo||n.mensagem||'Notificação'}</div>
        <div style="font-size:.76rem;color:var(--text-3);margin-top:2px">${fmtDatetime(n.criado_em)}</div>
      </div>
      ${!n.lida?'<div style="width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:4px"></div>':''}
    </div>`).join('');
  if (window.lucide) lucide.createIcons();
}

async function markNotifRead(id, el) {
  try {
    await API.marcarNotifLida(id);
    const n = (APP.notifs||[]).find(x => x.id === id);
    if (n) n.lida = true;
    if (el) el.style.opacity = '.6';
    App._updateNotifBadge();
  } catch(e) {}
}

async function markAllNotifRead() {
  try {
    await API.marcarTodasLidas(STATE.empresa.id);
    (APP.notifs||[]).forEach(n => n.lida = true);
    renderNotifications();
    App._updateNotifBadge();
    UI.toast('✅ Todas lidas!', 'success');
  } catch(e) {}
}

// ── CONFIGURAÇÕES ──────────────────────────────────────────
function renderSettings(tab) {
  APP.settingsTab = tab || 'company';
  document.querySelectorAll('#settings-nav .nav-item').forEach(i => i.classList.remove('active'));
  const active = document.querySelector(`#settings-nav .nav-item[onclick*="${APP.settingsTab}"]`);
  if (active) active.classList.add('active');

  const content = document.getElementById('settings-content');
  if (!content) return;

  const emp   = STATE.empresa || {};
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('nexos_prefs')||'{}'); } catch(e){ return {}; } })();
  const seg   = _seg();
  const lang  = _lang();

  const tabs = {
    company: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">Dados da Empresa</h4>
        <div class="form-group"><label class="form-label">Nome da Empresa</label><input type="text" id="cfg-nome" class="form-control" value="${emp.nome||''}"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Telefone</label><input type="tel" id="cfg-tel" class="form-control" value="${emp.telefone||''}"></div>
          <div class="form-group"><label class="form-label">CNPJ</label><input type="text" id="cfg-cnpj" class="form-control" value="${emp.cnpj||''}"></div>
        </div>
        <div class="form-group"><label class="form-label">Endereço</label><input type="text" id="cfg-end" class="form-control" value="${emp.endereco||''}" placeholder="Endereço completo"></div>
        <div class="form-group"><label class="form-label">Chave PIX</label><input type="text" id="cfg-pix" class="form-control" value="${emp.pix||emp.chave_pix||''}" placeholder="Chave PIX"></div>
        <div class="form-group"><label class="form-label">Texto de Garantia</label><textarea id="cfg-garantia" class="form-control" rows="3">${emp.texto_garantia||emp.termos_nota||''}</textarea></div>
        <button class="btn btn-primary" onclick="saveEmpresaConfig()"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>`,

    appearance: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">Aparência & Preferências</h4>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Idioma</div></div>
          <select class="form-control" style="width:140px" onchange="I18N.set(this.value)">
            <option value="pt" ${_lang()==='pt'?'selected':''}>🇧🇷 PT-BR</option>
            <option value="en" ${_lang()==='en'?'selected':''}>🇺🇸 EN</option>
            <option value="es" ${_lang()==='es'?'selected':''}>🇪🇸 ES</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Moeda</div></div>
          <select class="form-control" style="width:140px" onchange="STATE.currency=this.value">
            <option value="BRL" ${STATE.currency==='BRL'?'selected':''}>R$ Real</option>
            <option value="USD" ${STATE.currency==='USD'?'selected':''}>$ Dólar</option>
            <option value="EUR" ${STATE.currency==='EUR'?'selected':''}>€ Euro</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Assinatura do Cliente</div><div class="setting-desc">Coleta assinatura nas OS</div></div>
          <label class="toggle"><input type="checkbox" ${prefs.signature_enabled?'checked':''} onchange="togglePref('signature_enabled',this.checked)"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Fotos nas OS</div><div class="setting-desc">Permite upload de fotos</div></div>
          <label class="toggle"><input type="checkbox" ${prefs.photos_enabled?'checked':''} onchange="togglePref('photos_enabled',this.checked)"><span class="toggle-slider"></span></label>
        </div>
      </div>`,

    employees: `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h4 style="font-size:.92rem;font-weight:700;margin:0">Funcionários</h4>
          <button class="btn btn-primary btn-sm" onclick="openNewEmployee()"><i data-lucide="user-plus" style="width:13px;height:13px"></i> Novo</button>
        </div>
        <div id="employees-list">${renderEmployeesList()}</div>
      </div>`,

    segment: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">Segmento do Negócio</h4>
        <p style="font-size:.84rem;color:var(--text-2);margin-bottom:20px">Alterar adapta toda a interface do sistema.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${SEGMENTS.list.map(s => `
            <div class="segment-card ${emp.segmento===s.id?'selected':''}" onclick="changeSegment('${s.id}',this)">
              <div class="segment-card-icon" style="background:${s.color}22"><i data-lucide="${s.icon}" style="width:22px;height:22px;color:${s.color}"></i></div>
              <div class="segment-card-name">${s.labels[lang]?.name||s.labels.pt.name}</div>
              <div class="segment-card-desc">${s.labels[lang]?.desc||s.labels.pt.desc}</div>
            </div>`).join('')}
        </div>
      </div>`,

    goals: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">Metas do Mês</h4>
        <div class="form-group"><label class="form-label">Meta de Faturamento (R$)</label><input type="number" id="meta-fat" class="form-control" placeholder="Ex: 10000" min="0" step="100"></div>
        <div class="form-group"><label class="form-label">Meta de OS / Atendimentos</label><input type="number" id="meta-os" class="form-control" placeholder="Ex: 50" min="0"></div>
        <button class="btn btn-primary" onclick="saveMetas()"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar Metas</button>
      </div>`,

    about: `
      <div class="card" style="text-align:center;padding:32px">
        <img src="NexOS.png" alt="NexOS" style="width:64px;height:64px;border-radius:14px;margin-bottom:16px;box-shadow:0 8px 32px rgba(56,189,248,.2)">
        <div style="font-size:1.4rem;font-weight:800;background:var(--grad-logo);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">NexOS</div>
        <div style="font-size:.82rem;color:var(--text-3);margin-top:4px">Versão 3.5 · Gestão inteligente</div>
        <div style="font-size:.78rem;color:var(--text-3);margin-top:20px;line-height:1.8">
          Empresa: <strong style="color:var(--text-1)">${emp.nome||'–'}</strong><br>
          Plano: <strong style="color:var(--blue)">${emp.plano||'Básico'}</strong><br>
          ID: <code style="font-size:.72rem">${emp.id?.slice(0,8)||'–'}</code>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:20px" onclick="Auth.logout()"><i data-lucide="log-out" style="width:13px;height:13px"></i> Sair</button>
      </div>`,
  };

  content.innerHTML = tabs[APP.settingsTab] || '<div class="card"><div style="color:var(--text-3);padding:20px">Em breve...</div></div>';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

function showSettingsTab(tab) {
  APP.settingsTab = tab;
  renderSettings(tab);
}

function renderEmployeesList() {
  if (!(APP.funcionarios||[]).length)
    return '<div style="font-size:.84rem;color:var(--text-3);padding:12px 0">Nenhum funcionário cadastrado</div>';
  return (APP.funcionarios||[]).map(f => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:50%;background:${avatarColor(f.nome)};display:flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:700;color:#fff;flex-shrink:0">${initials(f.nome)}</div>
      <div style="flex:1"><div style="font-size:.88rem;font-weight:600">${f.nome}</div><div style="font-size:.74rem;color:var(--text-3)">${f.funcao||'Funcionário'}</div></div>
      <button class="btn btn-ghost btn-icon" onclick="openEditEmployee('${f.id}')"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
      <button class="btn btn-ghost btn-icon" onclick="confirmDeleteEmployee('${f.id}','${(f.nome||'').replace(/'/g,"\\'")}')"><i data-lucide="user-x" style="width:13px;height:13px"></i></button>
    </div>`).join('');
}

function togglePref(key, value) {
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('nexos_prefs')||'{}'); } catch(e){ return {}; } })();
  prefs[key] = value;
  localStorage.setItem('nexos_prefs', JSON.stringify(prefs));
  UI.toast('✅ Preferência salva!', 'success');
}

async function saveEmpresaConfig() {
  const updates = {
    nome:     document.getElementById('cfg-nome')?.value?.trim()||undefined,
    telefone: document.getElementById('cfg-tel')?.value||null,
    cnpj:     document.getElementById('cfg-cnpj')?.value||null,
    endereco: document.getElementById('cfg-end')?.value||null,
    pix:      document.getElementById('cfg-pix')?.value||null,
    texto_garantia: document.getElementById('cfg-garantia')?.value||null,
  };
  try {
    await API.updateEmpresa(STATE.empresa.id, updates);
    Object.assign(STATE.empresa, updates);
    UI.toast('✅ Dados salvos!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

function changeSegment(id, el) {
  if (window.SEGMENTS) SEGMENTS.set(id);
  API.updateEmpresa(STATE.empresa.id, { segmento:id }).catch(()=>{});
  document.querySelectorAll('#settings-content .segment-card').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');
  if (STATE.empresa) STATE.empresa.segmento = id;
  UI.toast('✅ Segmento alterado!', 'success');
}

async function saveMetas() {
  const fat = parseFloat(document.getElementById('meta-fat')?.value);
  const os  = parseFloat(document.getElementById('meta-os')?.value);
  try {
    if (fat) await API.setMeta(STATE.empresa.id, 'faturamento', fat);
    if (os)  await API.setMeta(STATE.empresa.id, 'os', os);
    UI.toast('✅ Metas salvas!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

function openNewEmployee()     { buildEmployeeModal(null); }
function openEditEmployee(id)  {
  const f = (APP.funcionarios||[]).find(x => x.id === id);
  if (f) buildEmployeeModal(f);
}

function buildEmployeeModal(func) {
  document.getElementById('employee-modal')?.remove();
  const PERMS = ['criar_os','ver_todas_os','deletar_os','ver_caixa','ver_analytics','gerenciar_estoque','ver_clientes','editar_config','ver_valores'];
  const perms = func?.permissoes||{};
  const PERM_LABELS = { criar_os:'Criar OS', ver_todas_os:'Ver Todas OS', deletar_os:'Deletar OS', ver_caixa:'Ver Caixa', ver_analytics:'Ver Relatórios', gerenciar_estoque:'Gerenciar Estoque', ver_clientes:'Ver Clientes', editar_config:'Editar Configurações', ver_valores:'Ver Valores' };
  const modal = document.createElement('div');
  modal.id = 'employee-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h3 class="modal-title">${func?'Editar Funcionário':'Novo Funcionário'}</h3><button class="modal-close" onclick="_closeModal('employee-modal')"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Nome *</label><input type="text" id="emp-nome" class="form-control" value="${func?.nome||''}"></div>
          <div class="form-group"><label class="form-label">Função</label><input type="text" id="emp-funcao" class="form-control" value="${func?.funcao||''}" placeholder="Ex: Técnico"></div>
        </div>
        <div class="form-group">
          <label class="form-label">PIN de Acesso (4 dígitos) ${func?'— deixe vazio para não alterar':''}</label>
          <div class="pin-inputs"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"></div>
        </div>
        <div style="font-size:.8rem;font-weight:600;color:var(--text-2);margin-bottom:10px">Permissões</div>
        <div style="display:grid;gap:6px">
          ${PERMS.map(p=>`<div class="setting-row" style="padding:8px 0"><div class="setting-label" style="font-size:.82rem">${PERM_LABELS[p]||p}</div><label class="toggle"><input type="checkbox" id="perm-${p}" ${perms[p]?'checked':''}><span class="toggle-slider"></span></label></div>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeModal('employee-modal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveEmployee('${func?.id||''}')"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  const pins = modal.querySelectorAll('.pin-input');
  pins.forEach((inp,i) => {
    inp.oninput = e => { e.target.value=e.target.value.replace(/\D/g,''); if(e.target.value&&pins[i+1]) pins[i+1].focus(); };
    inp.onkeydown = e => { if(e.key==='Backspace'&&!e.target.value&&pins[i-1]) pins[i-1].focus(); };
  });
  if (window.lucide) setTimeout(() => lucide.createIcons(), 60);
}

async function saveEmployee(id) {
  const nome = document.getElementById('emp-nome')?.value?.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', 'warning'); return; }
  const pins = document.querySelectorAll('#employee-modal .pin-input');
  const pin  = Array.from(pins).map(i=>i.value).join('');
  const PERMS = ['criar_os','ver_todas_os','deletar_os','ver_caixa','ver_analytics','gerenciar_estoque','ver_clientes','editar_config','ver_valores'];
  const permissoes = {};
  PERMS.forEach(p => { permissoes[p] = document.getElementById('perm-'+p)?.checked||false; });
  const dados = { nome, funcao:document.getElementById('emp-funcao')?.value||null, permissoes, ...(pin.length===4?{pin}:{}) };
  try {
    if (id) {
      const up  = await API.updateFuncionario(id, dados);
      const idx = (APP.funcionarios||[]).findIndex(f=>f.id===id);
      if (idx>=0) APP.funcionarios[idx]=up;
    } else {
      if (pin.length!==4) { UI.toast('⚠ PIN de 4 dígitos obrigatório', 'warning'); return; }
      APP.funcionarios.push(await API.createFuncionario(STATE.empresa.id, dados));
    }
    _closeModal('employee-modal');
    renderSettings('employees');
    UI.toast('✅ Funcionário salvo!', 'success');
  } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
}

function confirmDeleteEmployee(id, nome) {
  UI.confirm(`Desativar "${nome}"?`, async () => {
    try {
      await API.deleteFuncionario(id);
      APP.funcionarios = (APP.funcionarios||[]).filter(f=>f.id!==id);
      renderSettings('employees');
      UI.toast('✅ Desativado', 'info');
    } catch(e) { UI.toast('❌ ' + e.message, 'error'); }
  });
}

// ── MASTER ADMIN ───────────────────────────────────────────
async function renderMaster() {
  if (!STATE.isMaster) return;
  const content = document.getElementById('master-content');
  if (!content) return;
  try {
    const { data: empresas } = await window.sb.from('empresas').select('*').order('criado_em', { ascending:false });
    content.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:20px">
        <div class="kpi-card blue"><div class="kpi-value">${empresas?.length||0}</div><div class="kpi-label">Empresas</div></div>
      </div>
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:16px">Todas as Empresas</h4>
        <div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Segmento</th><th>Plano</th><th>Cadastro</th><th>Status</th></tr></thead>
        <tbody>${(empresas||[]).map(e=>`<tr>
          <td><div style="font-weight:600;font-size:.86rem">${e.nome}</div><div style="font-size:.74rem;color:var(--text-3)">${e.id.slice(0,8)}</div></td>
          <td style="font-size:.82rem">${e.segmento||'tech'}</td>
          <td><span class="badge badge-${e.plano==='pro'?'success':'warning'}">${e.plano||'basico'}</span></td>
          <td style="font-size:.78rem;color:var(--text-3)">${fmtDate(e.criado_em)}</td>
          <td><span class="badge ${e.ativo||e.ativa?'badge-success':'badge-danger'}">${e.ativo||e.ativa?'Ativo':'Inativo'}</span></td>
        </tr>`).join('')}</tbody></table></div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  } catch(e) { content.innerHTML = '<div class="card"><p style="color:var(--red)">Erro: ' + e.message + '</p></div>'; }
}

// ── FUNÇÕES EXTRAS CHAMADAS PELO INDEX.HTML ────────────────
function filterLowStock()     { renderStock(); }
function filterClientLevel()  { renderClients(); }
function sortClients()        { renderClients(); }
function exportAnalytics()    { UI.toast('Exportando relatório...', 'info'); }
function generateCashFlowAI() { UI.toast('Gerando projeção com IA...', 'info'); }
function openDashCustomize()  { UI.toast('Personalização em breve!', 'info'); }
function selectSegment(id)    { if(window.SEGMENTS) SEGMENTS.set(id); }
function setCalView(view, btn) {
  APP.calView = view;
  document.querySelectorAll('.page-header .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCalendar();
}
// Auth shortcuts
function login()         { if(window.Auth) Auth.login(); }
function loginGoogle()   { if(window.Auth) Auth.loginGoogle(); }
function logout()        { if(window.Auth) Auth.logout(); }
function register()      { if(window.Auth) Auth.register(); }
function showRegister()  { if(typeof showRegisterView === 'function') showRegisterView(); }
function showForgotPass(email) { if(window.Auth) Auth.forgotPassword(email || document.getElementById('auth-email')?.value); }
