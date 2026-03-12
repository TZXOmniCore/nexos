/* ============================================================
   NexOS v3.0 — app.js
   ============================================================ */

// ── APP STATE LOCAL ────────────────────────────────────────
const APP = {
  os:           [],
  clientes:     [],
  produtos:     [],
  notifs:       [],
  funcionarios: [],
  agenda:       [],
  contasPagar:  [],
  contasReceber:[],
  charts:       {},
  calDate:      new Date(),
  calView:      'month',
  osFiltro:     'all',
  osSearch:     '',
  anPeriodo:    'month',
  settingsTab:  'company',
  realtimeSubs: [],
};

// ── BOOT ───────────────────────────────────────────────────
const App = {

  async init() {
    const emp = STATE.empresa;
    if (!emp) return;

    UI.loading(true, 'Carregando...');
    try {
      await App._loadInitialData();
      App._setupRealtime();
      App._setupCalendar();
      App._setGreeting();
      Auth.enforcePermissions();
      goPage(localStorage.getItem('nexos_page') || 'dashboard');
    } catch(e) {
      console.error('Erro ao inicializar app:', e);
      UI.toast('Erro ao carregar dados', 'error');
    } finally {
      UI.loading(false);
    }
  },

  async bootAsFuncionario(func) {
    STATE.empresa = await API.getEmpresa(func.empresa_id);
    await App.init();
  },

  async _loadInitialData() {
    const empId = STATE.empresa.id;
    const [os, clientes, produtos, notifs, funcs] = await Promise.all([
      API.getOS(empId),
      API.getClientes(empId),
      API.getProdutos(empId),
      API.getNotificacoes(empId),
      API.getFuncionarios(empId),
    ]);
    APP.os           = os;
    APP.clientes     = clientes;
    APP.produtos     = produtos;
    APP.notifs       = notifs;
    APP.funcionarios = funcs;

    App._updateNotifBadge();
    App._updateOSBadge();
  },

  _setupRealtime() {
    const empId = STATE.empresa.id;
    APP.realtimeSubs.forEach(s => s.unsubscribe?.());
    APP.realtimeSubs = [
      API.subscribeOS(empId, async () => {
        APP.os = await API.getOS(empId);
        App._updateOSBadge();
        if (document.getElementById('page-os')?.classList.contains('active')) renderOSList();
        if (document.getElementById('page-dashboard')?.classList.contains('active')) renderDashOS();
      }),
      API.subscribeNotifs(empId, async (payload) => {
        APP.notifs = await API.getNotificacoes(empId);
        App._updateNotifBadge();
        if (payload.new) UI.toast('🔔 ' + payload.new.titulo, 'info');
      }),
    ];
  },

  _updateNotifBadge() {
    const unread = APP.notifs.filter(n => !n.lida).length;
    UI.badge('notif-badge', unread);
    UI.badge('mobile-notif-badge', unread);
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
    const countEl = document.getElementById('notif-count');
    if (countEl) countEl.textContent = unread + ' não lidas';
  },

  _updateOSBadge() {
    const abertas = APP.os.filter(o => ['aguardando','andamento'].includes(o.status)).length;
    UI.badge('nav-os-badge', abertas);
  },

  _setGreeting() {
    const h = new Date().getHours();
    const nome = STATE.funcionario?.nome?.split(' ')[0] || STATE.perfil?.nome?.split(' ')[0] || '';
    const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const el = document.getElementById('dash-greeting');
    if (el) el.textContent = saudacao + (nome ? ', ' + nome + '!' : '!');
  },

  _setupCalendar() {
    renderCalendar();
    const el = document.getElementById('schedule-period');
    if (el) el.textContent = APP.calDate.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
  },

  globalSearch(q) {
    if (!q) return;
    const lower = q.toLowerCase();
    const osMatch = APP.os.filter(o =>
      o.numero?.includes(q) ||
      o.item?.toLowerCase().includes(lower) ||
      o.clientes?.nome?.toLowerCase().includes(lower)
    );
    if (osMatch.length > 0) {
      goPage('os');
      document.getElementById('os-search').value = q;
      filterOS();
    }
  },
};

// ── NAVEGAÇÃO ──────────────────────────────────────────────
function goPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-nav], .mobile-nav-item[data-nav]').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) return;
  pageEl.classList.add('active');

  document.querySelectorAll(`[data-nav="${page}"]`).forEach(n => n.classList.add('active'));
  localStorage.setItem('nexos_page', page);

  UI.setPageTitle({
    dashboard:     'Dashboard',
    os:            SEGMENTS.t('os_module'),
    clients:       I18N.t('nav_clients'),
    stock:         I18N.t('nav_stock'),
    cash:          I18N.t('nav_cash'),
    schedule:      I18N.t('nav_schedule'),
    analytics:     I18N.t('nav_analytics'),
    ai:            I18N.t('nav_ai'),
    notifications: I18N.t('nav_notifications'),
    settings:      I18N.t('nav_settings'),
  }[page] || page);

  // Fechar mobile more se aberto
  if (typeof moreOpen !== 'undefined' && moreOpen) toggleMobileMore();

  // Renderiza página
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
  renders[page]?.();

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── DASHBOARD ──────────────────────────────────────────────
async function renderDashboard() {
  if (!STATE.empresa) return;
  try {
    const data = await API.getDashboardData(STATE.empresa.id);

    // KPIs
    document.getElementById('kpi-revenue').textContent  = fmt(data.faturamento_mes);
    document.getElementById('kpi-os').textContent       = data.os_abertas;
    document.getElementById('kpi-done').textContent     = data.os_concluidas_mes;
    document.getElementById('kpi-profit').textContent   = fmt(data.faturamento_mes * 0.35); // estimativa

    if (data.delta_pct !== null) {
      const deltaEl = document.getElementById('kpi-revenue-delta');
      if (deltaEl) {
        const up = parseFloat(data.delta_pct) >= 0;
        deltaEl.textContent = (up?'+':'') + data.delta_pct + '%';
        deltaEl.className = 'kpi-delta ' + (up ? 'up' : 'down');
      }
    }

    // Alertas
    renderDashAlerts(data);

    // Ranking clientes
    renderDashRanking(data.top_clientes);

    // Agenda hoje
    renderDashAgenda(data.agenda_hoje);

    // OS recentes
    renderDashOS();

    // Gráfico
    await renderDashChart(7);

  } catch(e) {
    console.error('Erro dashboard:', e);
  }
}

function renderDashAlerts(data) {
  const wrap = document.getElementById('dash-alerts');
  if (!wrap) return;
  const alerts = [];

  if (data.estoques_baixos > 0)
    alerts.push({ icon:'alert-triangle', color:'var(--orange)', text: data.estoques_baixos + ' produto(s) com estoque baixo', page:'stock' });
  if (data.parcelas_vencidas > 0)
    alerts.push({ icon:'clock', color:'var(--red)', text: data.parcelas_vencidas + ' parcela(s) vencida(s)', page:'cash' });
  if (data.aniversarios?.length > 0)
    alerts.push({ icon:'cake', color:'var(--purple)', text: data.aniversarios.map(a=>a.nome.split(' ')[0]).join(', ') + ' fazem aniversário hoje!', page:'clients' });

  wrap.innerHTML = alerts.map(a => `
    <div onclick="goPage('${a.page}')" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-2);border:1px solid var(--border);border-left:3px solid ${a.color};border-radius:var(--radius-md);cursor:pointer;font-size:.8rem;color:var(--text-1);flex:1;min-width:200px;transition:all .15s">
      <i data-lucide="${a.icon}" style="width:14px;height:14px;color:${a.color};flex-shrink:0"></i>
      ${a.text}
    </div>
  `).join('');
  if (alerts.length && window.lucide) lucide.createIcons();
}

function renderDashRanking(clientes) {
  const wrap = document.getElementById('dash-ranking');
  if (!wrap) return;
  if (!clientes?.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px 0"><div class="empty-text">Sem dados ainda</div></div>';
    return;
  }
  wrap.innerHTML = clientes.map((c, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i < clientes.length-1?'border-bottom:1px solid var(--border)':''}">
      <div style="width:22px;height:22px;border-radius:50%;background:${['var(--yellow)','var(--text-2)','var(--orange)'][i]||'var(--bg-3)'};display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:800;color:var(--bg);flex-shrink:0">${i+1}</div>
      <div style="width:32px;height:32px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#fff;flex-shrink:0">${initials(c.nome)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome}</div>
        <div style="font-size:.72rem;color:var(--text-3)">${c.count} serviço(s)</div>
      </div>
      <div style="font-size:.82rem;font-weight:700;color:var(--green);flex-shrink:0">${fmt(c.total)}</div>
    </div>
  `).join('');
}

function renderDashAgenda(eventos) {
  const wrap = document.getElementById('dash-agenda');
  if (!wrap) return;
  if (!eventos?.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px 0"><div class="empty-text">Sem compromissos hoje</div></div>';
    return;
  }
  wrap.innerHTML = eventos.map(e => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:4px;height:36px;border-radius:2px;background:${e.cor||'var(--blue)'};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:.84rem;font-weight:600">${e.titulo}</div>
        <div style="font-size:.74rem;color:var(--text-3)">${e.data_inicio ? new Date(e.data_inicio).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''} · ${e.clientes?.nome||''}</div>
      </div>
    </div>
  `).join('');
}

function renderDashOS() {
  const wrap = document.getElementById('dash-os-list');
  if (!wrap) return;
  const recentes = APP.os.slice(0, 5);
  if (!recentes.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-text">Nenhuma OS ainda</div></div>';
    return;
  }
  wrap.innerHTML = recentes.map(os => osCard(os, true)).join('');
  if (window.lucide) lucide.createIcons();
}

async function renderDashChart(days) {
  const data = await API.getFaturamentoDiario(STATE.empresa.id, days);
  const canvas = document.getElementById('dash-chart');
  if (!canvas) return;

  APP.charts.dash?.destroy();
  APP.charts.dash = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map(d => {
        const dt = new Date(d.date + 'T12:00:00');
        return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
      }),
      datasets: [{
        data: data.map(d => d.value),
        borderColor: '#38BDF8',
        backgroundColor: 'rgba(56,189,248,.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#38BDF8',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color:'rgba(255,255,255,.04)' }, ticks: { color:'#6B7280', font:{ size:10 } } },
        y: { grid: { color:'rgba(255,255,255,.04)' }, ticks: { color:'#6B7280', font:{ size:10 }, callback: v => 'R$'+v.toLocaleString('pt-BR') } }
      }
    }
  });
}

function setChartPeriod(days, btn) {
  document.querySelectorAll('.chart-header .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderDashChart(days);
}

function openDashCustomize() {
  UI.toast('Personalização de widgets em breve!', 'info');
}

// ── OS — LISTA ─────────────────────────────────────────────
function renderOSList() {
  const list = document.getElementById('os-list');
  if (!list) return;

  let filtrado = APP.os;

  if (APP.osFiltro !== 'all')
    filtrado = filtrado.filter(o => o.status === APP.osFiltro);

  if (APP.osSearch) {
    const q = APP.osSearch.toLowerCase();
    filtrado = filtrado.filter(o =>
      o.numero?.includes(APP.osSearch) ||
      o.item?.toLowerCase().includes(q) ||
      o.extra_1?.toLowerCase().includes(q) ||
      o.clientes?.nome?.toLowerCase().includes(q)
    );
  }

  const count = document.getElementById('os-page-count');
  if (count) count.textContent = filtrado.length + ' registro' + (filtrado.length!==1?'s':'');

  if (!filtrado.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="clipboard-list" style="width:36px;height:36px"></i></div>
        <div class="empty-title">${APP.osFiltro==='all' ? 'Nenhuma OS ainda' : 'Sem OS com este status'}</div>
        <div class="empty-text">${APP.osFiltro==='all' ? 'Toque em "Nova OS" para começar' : 'Tente outro filtro'}</div>
        ${APP.osFiltro==='all'?`<button class="btn btn-primary mt-3" onclick="openNewOS()"><i data-lucide="plus" style="width:14px;height:14px"></i> Nova OS</button>`:''}
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  list.innerHTML = filtrado.map(o => osCard(o)).join('');
  if (window.lucide) lucide.createIcons();
}

function osCard(os, compact = false) {
  const st   = STATUS_CONFIG[os.status] || {};
  const cli  = os.clientes?.nome || 'Sem cadastro';
  const data = fmtDate(os.created_at);
  const seg  = SEGMENTS.current;
  const itemLabel = seg?.labels?.[I18N.lang]?.item_field || 'Equipamento';

  return `
    <div class="os-card" data-status="${os.status}" onclick="openViewOS('${os.id}')">
      <div class="os-card-left">
        <div class="os-card-num">#${os.numero||'?'}</div>
        <div class="os-card-info">
          <div class="os-card-title">${os.item||'–'}</div>
          ${os.extra_1 ? `<div class="os-card-sub">${os.extra_1}</div>` : ''}
          <div class="os-card-meta">
            <i data-lucide="user" style="width:11px;height:11px"></i> ${cli}
            ${os.funcionarios ? `<span style="margin-left:8px"><i data-lucide="wrench" style="width:11px;height:11px"></i> ${os.funcionarios.nome}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="os-card-right">
        <span class="badge" style="background:${st.color}22;color:${st.color};border-color:${st.color}33;white-space:nowrap">
          ${st.label||os.status}
        </span>
        <div class="os-card-value">${fmt(os.valor_total)}</div>
        <div class="os-card-date">${data}</div>
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
  btn.classList.add('active');
  renderOSList();
}

// ── OS — MODAL NOVA/EDITAR ─────────────────────────────────
let _osModalId = null;

function openNewOS() {
  _osModalId = null;
  buildOSModal(null);
}

async function openViewOS(id) {
  const os = await API.getOSById(id);
  if (!os) return;
  buildOSViewModal(os);
}

async function openEditOS(id) {
  const os = await API.getOSById(id);
  _osModalId = id;
  buildOSModal(os);
}

function buildOSModal(os) {
  const seg    = SEGMENTS.current;
  const fields = seg.os_form_fields;
  const lang   = I18N.lang;
  const prefs  = JSON.parse(localStorage.getItem('nexos_prefs')||'{}');
  const title  = os ? 'Editar ' + seg.labels[lang].os_single : seg.labels[lang].os_new;

  const funcsOpts = APP.funcionarios.map(f =>
    `<option value="${f.id}" ${os?.tecnico_id===f.id?'selected':''}>${f.nome}</option>`
  ).join('');

  const clientesOpts = APP.clientes.map(c =>
    `<option value="${c.id}" ${os?.cliente_id===c.id?'selected':''}>${c.nome}</option>`
  ).join('');

  const renderField = (f) => {
    if (!f || !f.type) return '';
    const label = (f.label_key ? (seg.labels[lang]?.[f.label_key] || I18N.t(f.label_key)) : null) || f.label || f.id || '';
    const ph    = (f.placeholder_key ? (seg.labels[lang]?.[f.placeholder_key] || I18N.t(f.placeholder_key)) : null) || f.placeholder || '';
    const val   = os?.[f.id] || '';

    if (!label && f.type === 'text') return '';

    switch(f.type) {
      case 'client_select': return `
        <div class="form-group">
          <label class="form-label">${I18N.t('os_client')}</label>
          <div style="display:flex;gap:8px">
            <select id="os-f-cliente_id" class="form-control" style="flex:1">
              <option value="">Sem cadastro (venda rápida)</option>
              ${clientesOpts}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openNewClientInline()" title="Novo cliente">
              <i data-lucide="user-plus" style="width:14px;height:14px"></i>
            </button>
          </div>
        </div>`;

      case 'text': return `
        <div class="form-group">
          <label class="form-label">${label}${f.required?'<span style="color:var(--red)"> *</span>':''}</label>
          <div style="position:relative">
            <input type="text" id="os-f-${f.id}" class="form-control" value="${val}" placeholder="${ph}" ${f.required?'required':''}>
            ${f.id==='extra_1' ? `<button type="button" class="scanner-btn" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);padding:4px 8px;font-size:.72rem" onclick="openScanner('os-f-${f.id}')"><i data-lucide="scan-barcode" style="width:12px;height:12px"></i></button>` : ''}
          </div>
        </div>`;

      case 'textarea': return `
        <div class="form-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <label class="form-label" style="margin:0">${label}</label>
            ${f.minimizable ? `<button type="button" onclick="toggleFieldMin('os-f-${f.id}-wrap')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:.72rem;display:flex;align-items:center;gap:4px"><i data-lucide="minimize-2" style="width:12px;height:12px"></i> Minimizar</button>` : ''}
          </div>
          <div id="os-f-${f.id}-wrap">
            <textarea id="os-f-${f.id}" class="form-control" rows="3" placeholder="${ph}">${val}</textarea>
          </div>
        </div>`;

      case 'number': return `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <input type="number" id="os-f-${f.id}" class="form-control" value="${val||f.default||''}" min="0">
        </div>`;

      case 'date': return `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <input type="date" id="os-f-${f.id}" class="form-control" value="${val}">
        </div>`;

      case 'staff_select': return `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <select id="os-f-tecnico_id" class="form-control">
            <option value="">Sem atribuição</option>
            ${funcsOpts}
          </select>
        </div>`;

      case 'priority_select': return `
        <div class="form-group">
          <label class="form-label">${I18N.t('os_priority')}</label>
          <select id="os-f-prioridade" class="form-control">
            <option value="normal" ${os?.prioridade==='normal'||!os?'selected':''}>Normal</option>
            <option value="alta" ${os?.prioridade==='alta'?'selected':''}>Alta</option>
            <option value="urgente" ${os?.prioridade==='urgente'?'selected':''}>Urgente</option>
          </select>
        </div>`;

      case 'payment_select': return `
        <div class="form-group">
          <label class="form-label">${I18N.t('os_payment')}</label>
          <select id="os-f-forma_pagamento" class="form-control" onchange="onPaymentChange(this.value)">
            <option value="">Selecionar...</option>
            ${Object.entries(PAY_CONFIG).map(([k,v])=>`<option value="${k}" ${os?.forma_pagamento===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
          <div id="parcelas-wrap" style="display:none;margin-top:8px">
            <label class="form-label">Nº de Parcelas</label>
            <select id="os-f-n_parcelas" class="form-control">
              ${[2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}">${n}x</option>`).join('')}
            </select>
          </div>
        </div>`;

      case 'parts_list': return `
        <div class="form-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="form-label" style="margin:0">${seg.labels[lang].parts_field||'Itens'}</label>
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
              <div style="font-size:.74rem;color:var(--text-3)">Total</div>
              <div style="font-size:1.1rem;font-weight:800;color:var(--green)" id="os-total-display">${fmt(os?.valor_total||0)}</div>
            </div>
          </div>
        </div>`;

      case 'photo_upload':
        if (!prefs.photos_enabled && !os) return '';
        return `
          <div class="form-group">
            <label class="form-label">${I18N.t('photos')}</label>
            <div class="photo-grid" id="os-photos-grid">
              <label class="photo-add-btn" for="os-photo-input">
                <i data-lucide="camera" style="width:20px;height:20px"></i>
                <span>Adicionar foto</span>
                <input type="file" id="os-photo-input" accept="image/*" multiple style="display:none" onchange="addOSPhotos(this)">
              </label>
            </div>
          </div>`;

      case 'signature_pad':
        if (!prefs.signature_enabled && !os) return '';
        return `
          <div class="form-group">
            <label class="form-label">${I18N.t('signature')}</label>
            <canvas id="sig-pad" style="width:100%;height:120px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-md);touch-action:none"></canvas>
            <button type="button" onclick="clearSignature()" class="btn btn-ghost btn-sm" style="margin-top:4px">Limpar</button>
          </div>`;

      default: return '';
    }
  };

  const modal = document.createElement('div');
  modal.id = 'os-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="UI.closeModal('os-modal');document.getElementById('os-modal').remove()">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>
      <div class="modal-body">
        <!-- Status (só na edição) -->
        ${os ? `
        <div class="form-group">
          <label class="form-label">${I18N.t('os_status')}</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="os-status-btns">
            ${Object.entries(STATUS_CONFIG).map(([k,v])=>`
              <button type="button" class="filter-btn ${os.status===k?'active':''}" onclick="setOSStatus('${k}',this)"
                style="border-color:${os.status===k?v.color:'var(--border)'};${os.status===k?'color:'+v.color+';background:'+v.color+'22':''}">
                ${v.label}
              </button>`).join('')}
          </div>
        </div>` : ''}

        ${fields.map(f => renderField(f)).join('')}

        <!-- Notas -->
        <div class="form-group">
          <label class="form-label">${I18N.t('notes')}</label>
          <textarea id="os-f-observacoes" class="form-control" rows="2" placeholder="Observações internas...">${os?.observacoes||''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('os-modal').remove();document.body.style.overflow=''">
          ${I18N.t('cancel')}
        </button>
        ${os ? `
        <button class="btn btn-secondary" onclick="openGenerateDocs('${os.id}')">
          <i data-lucide="file-text" style="width:14px;height:14px"></i> Documentos
        </button>` : ''}
        <button class="btn btn-primary" onclick="saveOS()">
          <i data-lucide="save" style="width:14px;height:14px"></i>
          ${I18N.t('save')}
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Popula itens se editando
  if (os?.itens) {
    try {
      const itens = JSON.parse(os.itens);
      _osItems = itens;
      renderOSItems();
    } catch {}
  } else {
    _osItems = [];
  }

  _osStatus = os?.status || 'aguardando';

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  if (typeof initSignaturePad === 'function') initSignaturePad();
}

// Itens da OS
let _osItems = [];
let _osStatus = 'aguardando';

function setOSStatus(status, btn) {
  _osStatus = status;
  document.querySelectorAll('#os-status-btns .filter-btn').forEach(b => {
    b.classList.remove('active');
    b.style.borderColor = 'var(--border)';
    b.style.color = '';
    b.style.background = '';
  });
  const st = STATUS_CONFIG[status];
  btn.classList.add('active');
  btn.style.borderColor = st.color;
  btn.style.color = st.color;
  btn.style.background = st.color + '22';
}

function addOSItem() {
  _osItems.push({ descricao: '', quantidade: 1, valor_unit: 0 });
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
  wrap.innerHTML = _osItems.map((item, i) => `
    <div style="display:grid;grid-template-columns:1fr 60px 90px 28px;gap:6px;align-items:center;margin-bottom:6px">
      <input type="text" class="form-control" style="font-size:.82rem" placeholder="Descrição" value="${item.descricao||''}"
        oninput="_osItems[${i}].descricao=this.value">
      <input type="number" class="form-control" style="font-size:.82rem;text-align:center" placeholder="Qtd" value="${item.quantidade||1}" min="1"
        oninput="_osItems[${i}].quantidade=+this.value;recalcTotal()">
      <input type="number" class="form-control" style="font-size:.82rem;text-align:right" placeholder="0,00" value="${item.valor_unit||''}" min="0" step="0.01"
        oninput="_osItems[${i}].valor_unit=+this.value;recalcTotal()">
      <button type="button" onclick="_osItems.splice(${i},1);renderOSItems()" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px">
        <i data-lucide="x" style="width:14px;height:14px"></i>
      </button>
    </div>
  `).join('');
  recalcTotal();
  if (window.lucide) lucide.createIcons();
}

function recalcTotal() {
  const itensTotal = _osItems.reduce((s, i) => s + ((i.quantidade||1) * (i.valor_unit||0)), 0);
  const maoObra    = parseFloat(document.getElementById('os-f-valor_mao_obra')?.value) || 0;
  const total      = itensTotal + maoObra;
  const el = document.getElementById('os-total-display');
  if (el) el.textContent = fmt(total);
}

function onPaymentChange(val) {
  const wrap = document.getElementById('parcelas-wrap');
  if (wrap) wrap.style.display = val === 'parcelado' ? 'block' : 'none';

  // Orçamento → status automático
  if (val === 'orcamento') {
    _osStatus = 'orcamento';
    document.querySelectorAll('#os-status-btns .filter-btn').forEach(b => b.classList.remove('active'));
    const orcBtn = document.querySelector('#os-status-btns .filter-btn[onclick*="orcamento"]');
    if (orcBtn) orcBtn.click();
  }
}

function toggleFieldMin(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const hidden = wrap.style.display === 'none';
  wrap.style.display = hidden ? '' : 'none';
}

async function saveOS() {
  const seg = SEGMENTS.current;
  const lang = I18N.lang;

  const item = document.getElementById('os-f-item')?.value?.trim();
  if (!item) {
    UI.toast('⚠ Preencha o campo ' + (seg.labels[lang].item_field||'equipamento'), 'warning');
    return;
  }

  const itensTotal = _osItems.reduce((s, i) => s + ((i.quantidade||1) * (i.valor_unit||0)), 0);
  const maoObra    = parseFloat(document.getElementById('os-f-valor_mao_obra')?.value) || 0;
  const total      = itensTotal + maoObra;

  const osData = {
    status:           _osStatus || 'aguardando',
    cliente_id:       document.getElementById('os-f-cliente_id')?.value || null,
    item:             item,
    extra_1:          document.getElementById('os-f-extra_1')?.value || null,
    extra_2:          document.getElementById('os-f-extra_2')?.value || null,
    extra_3:          document.getElementById('os-f-extra_3')?.value || null,
    defeito:          document.getElementById('os-f-defect')?.value || null,
    diagnostico:      document.getElementById('os-f-diagnosis')?.value || null,
    tecnico_id:       document.getElementById('os-f-tecnico_id')?.value || null,
    garantia_dias:    parseInt(document.getElementById('os-f-warranty')?.value) || null,
    prioridade:       document.getElementById('os-f-prioridade')?.value || 'normal',
    data_entrega:     document.getElementById('os-f-delivery')?.value || null,
    forma_pagamento:  document.getElementById('os-f-forma_pagamento')?.value || null,
    n_parcelas:       parseInt(document.getElementById('os-f-n_parcelas')?.value) || null,
    valor_mao_obra:   maoObra,
    valor_total:      total,
    itens:            JSON.stringify(_osItems),
    observacoes:      document.getElementById('os-f-observacoes')?.value || null,
  };

  const btn = document.querySelector('#os-modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    let saved;
    if (_osModalId) {
      saved = await API.updateOS(_osModalId, osData);
      await API.addHistoricoOS(_osModalId, `Status alterado para: ${statusLabel(osData.status)}`);
    } else {
      saved = await API.createOS(STATE.empresa.id, osData);

      // Cria parcelas se parcelado
      if (osData.forma_pagamento === 'parcelado' && osData.n_parcelas > 1) {
        await API.createParcelas(STATE.empresa.id, saved.id, total, osData.n_parcelas, today());
      }

      // Registra no caixa se pago
      if (!['orcamento','fiado','parcelado'].includes(osData.forma_pagamento) && total > 0) {
        await API.addCaixaEntry(STATE.empresa.id, {
          tipo:      'entrada',
          descricao: `OS #${saved.numero} - ${item}`,
          valor:     total,
          forma:     osData.forma_pagamento,
          ordem_id:  saved.id,
        });
      }
    }

    // Notificação ao cliente via WhatsApp (se concluído/pronto)
    if (['concluido','retirada'].includes(osData.status)) {
      const cli = APP.clientes.find(c => c.id === osData.cliente_id);
      if (cli?.telefone) {
        const msg = `Olá ${cli.nome}, sua ${seg.labels[lang].os_single} #${saved.numero} está ${statusLabel(osData.status)}! 🎉`;
        const link = API.buildWhatsAppLink(cli.telefone, msg);
        UI.toast('✅ OS salva! <a href="' + link + '" target="_blank" style="color:var(--green)">Avisar cliente</a>', 'success');
      } else {
        UI.toast('✅ OS salva com sucesso!', 'success');
      }
    } else {
      UI.toast('✅ OS salva!', 'success');
    }

    document.getElementById('os-modal')?.remove();
    document.body.style.overflow = '';
    APP.os = await API.getOS(STATE.empresa.id);
    renderOSList();
    App._updateOSBadge();

  } catch(e) {
    console.error('Erro ao salvar OS:', e);
    UI.toast('❌ Erro ao salvar: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px"></i> Salvar'; lucide.createIcons(); }
  }
}

function buildOSViewModal(os) {
  const seg  = SEGMENTS.current;
  const lang = I18N.lang;
  const st   = STATUS_CONFIG[os.status] || {};
  const itens = (() => { try { return JSON.parse(os.itens||'[]'); } catch { return []; } })();

  const modal = document.createElement('div');
  modal.id = 'os-view-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:580px">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">${seg.labels[lang].os_single} #${os.numero}</h3>
          <span class="badge" style="background:${st.color}22;color:${st.color};border-color:${st.color}33">${st.label}</span>
        </div>
        <button class="modal-close" onclick="document.getElementById('os-view-modal').remove();document.body.style.overflow=''">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <div style="font-size:.72rem;color:var(--text-3);margin-bottom:2px">${seg.labels[lang].item_field}</div>
            <div style="font-weight:600">${os.item||'–'}</div>
          </div>
          ${os.extra_1 ? `<div><div style="font-size:.72rem;color:var(--text-3);margin-bottom:2px">${seg.labels[lang].extra_field_1||'Info'}</div><div style="font-weight:600">${os.extra_1}</div></div>` : ''}
          ${os.clientes ? `<div><div style="font-size:.72rem;color:var(--text-3);margin-bottom:2px">Cliente</div><div style="font-weight:600">${os.clientes.nome}</div>${os.clientes.telefone?`<div style="font-size:.78rem;color:var(--text-3)">${os.clientes.telefone}</div>`:''}</div>` : ''}
          ${os.funcionarios ? `<div><div style="font-size:.72rem;color:var(--text-3);margin-bottom:2px">${seg.labels[lang].staff_field}</div><div style="font-weight:600">${os.funcionarios.nome}</div></div>` : ''}
        </div>

        ${os.defeito ? `<div style="margin-bottom:12px"><div style="font-size:.72rem;color:var(--text-3);margin-bottom:4px">${seg.labels[lang].defect_field}</div><div style="background:var(--bg-2);border-radius:var(--radius-md);padding:10px;font-size:.86rem;line-height:1.5">${os.defeito}</div></div>` : ''}
        ${os.diagnostico ? `<div style="margin-bottom:12px"><div style="font-size:.72rem;color:var(--text-3);margin-bottom:4px">${seg.labels[lang].diagnosis_field}</div><div style="background:var(--bg-2);border-radius:var(--radius-md);padding:10px;font-size:.86rem;line-height:1.5">${os.diagnostico}</div></div>` : ''}

        ${itens.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px">${seg.labels[lang].parts_field}</div>
          ${itens.map(i=>`
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.84rem">
              <span>${i.descricao} × ${i.quantidade}</span>
              <span style="font-weight:600">${fmt(i.quantidade*i.valor_unit)}</span>
            </div>`).join('')}
          ${os.valor_mao_obra>0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.84rem;color:var(--text-2)"><span>Mão de obra</span><span>${fmt(os.valor_mao_obra)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:800;font-size:1rem">
            <span>Total</span><span style="color:var(--green)">${fmt(os.valor_total)}</span>
          </div>
        </div>` : `<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border);font-weight:800"><span>Total</span><span style="color:var(--green)">${fmt(os.valor_total)}</span></div>`}

        ${os.forma_pagamento ? `<div style="font-size:.82rem;color:var(--text-2)">Pagamento: ${payLabel(os.forma_pagamento)}</div>` : ''}
        ${os.observacoes ? `<div style="margin-top:12px;padding:10px;background:var(--bg-2);border-radius:var(--radius-md);font-size:.82rem;color:var(--text-2)">${os.observacoes}</div>` : ''}

        <!-- Histórico -->
        ${os.ordens_historico?.length ? `
        <div style="margin-top:16px">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px">${I18N.t('os_history')}</div>
          ${os.ordens_historico.slice().reverse().map(h=>`
            <div style="font-size:.78rem;padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:8px">
              <span style="color:var(--text-3);white-space:nowrap">${fmtDatetime(h.created_at)}</span>
              <span>${h.texto}</span>
            </div>`).join('')}
        </div>` : ''}
      </div>
      <div class="modal-footer" style="flex-wrap:wrap;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('os-view-modal').remove();document.body.style.overflow=''">Fechar</button>
        ${os.clientes?.telefone ? `
        <button class="btn btn-secondary btn-sm" onclick="openWhatsApp('${os.clientes.telefone}','${os.clientes.nome}','${os.numero}','${st.label}')">
          <i data-lucide="message-circle" style="width:13px;height:13px"></i> WhatsApp
        </button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('os-view-modal').remove();openGenerateDocs('${os.id}')">
          <i data-lucide="file-text" style="width:13px;height:13px"></i> PDF
        </button>
        ${os.empresa?.pix||STATE.empresa?.pix ? `
        <button class="btn btn-secondary btn-sm" onclick="openPIX('${os.id}','${os.valor_total}')">
          <i data-lucide="zap" style="width:13px;height:13px"></i> PIX
        </button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('os-view-modal').remove();openEditOS('${os.id}')">
          <i data-lucide="pencil" style="width:13px;height:13px"></i> Editar
        </button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteOS('${os.id}','${os.numero}')">
          <i data-lucide="trash-2" style="width:13px;height:13px"></i>
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function confirmDeleteOS(id, numero) {
  document.getElementById('os-view-modal')?.remove();
  UI.confirm(`Excluir OS #${numero}? Esta ação não pode ser desfeita.`, async () => {
    try {
      await API.deleteOS(id);
      APP.os = await API.getOS(STATE.empresa.id);
      renderOSList();
      App._updateOSBadge();
      UI.toast('🗑 OS excluída', 'info');
    } catch(e) {
      UI.toast('❌ Erro ao excluir: ' + e.message, 'error');
    }
  });
}

function openWhatsApp(tel, nome, numero, status) {
  const seg = SEGMENTS.current;
  const lang = I18N.lang;
  const msg = `Olá ${nome}! Sua ${seg.labels[lang].os_single} #${numero} está com status: *${status}*.\nQualquer dúvida, estamos à disposição! 😊`;
  window.open(API.buildWhatsAppLink(tel, msg), '_blank');
}

function openPIX(osId, valor) {
  UI.toast('Gerando QR PIX... (em breve)', 'info');
}

function openGenerateDocs(osId) {
  UI.toast('Gerador de documentos em breve!', 'info');
}

function openOSBatch() {
  UI.toast('Criação em lote em breve!', 'info');
}

function openNewClientInline() {
  const nome = prompt('Nome do novo cliente:');
  if (!nome) return;
  API.createCliente(STATE.empresa.id, { nome }).then(c => {
    APP.clientes.push(c);
    const sel = document.getElementById('os-f-cliente_id');
    if (sel) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      opt.selected = true;
      sel.appendChild(opt);
    }
    UI.toast('✅ Cliente criado!', 'success');
  });
}

function openScanner(targetId) {
  UI.toast('Scanner de câmera em breve!', 'info');
}

// ── CLIENTES ───────────────────────────────────────────────
function renderClients() {
  const wrap = document.getElementById('clients-list');
  if (!wrap) return;

  const q = (document.getElementById('client-search')?.value || '').toLowerCase();
  let lista = APP.clientes;
  if (q) lista = lista.filter(c => c.nome?.toLowerCase().includes(q) || c.telefone?.includes(q) || c.cpf?.includes(q));

  const count = document.getElementById('clients-count');
  if (count) count.textContent = lista.length + ' cadastrado' + (lista.length!==1?'s':'');

  if (!lista.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="users" style="width:36px;height:36px"></i></div><div class="empty-title">Nenhum cliente encontrado</div><button class="btn btn-primary mt-3" onclick="openNewClient()"><i data-lucide="user-plus" style="width:14px;height:14px"></i> Novo Cliente</button></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  wrap.innerHTML = `<div style="display:grid;gap:8px">${lista.map(c => `
    <div class="card card-sm" style="cursor:pointer;transition:border-color .15s" onclick="openViewClient('${c.id}')" onmouseover="this.style.borderColor='var(--border-md)'" onmouseout="this.style.borderColor=''">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:42px;height:42px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:.84rem;font-weight:700;color:#fff;flex-shrink:0">${initials(c.nome)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:6px">
            ${c.nome}
            ${c.nivel==='vip'?'<span class="badge badge-warning">⭐ VIP</span>':''}
            ${c.nivel==='premium'?'<span class="badge badge-purple">💎 Premium</span>':''}
          </div>
          <div style="font-size:.78rem;color:var(--text-3)">${c.telefone||'Sem telefone'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${c.total_gasto ? `<div style="font-size:.82rem;font-weight:700;color:var(--green)">${fmt(c.total_gasto)}</div>` : ''}
          <div style="font-size:.72rem;color:var(--text-3)">${c.aniversario ? '🎂 ' + fmtDate(c.aniversario) : ''}</div>
        </div>
      </div>
    </div>
  `).join('')}</div>`;
  if (window.lucide) lucide.createIcons();
}

function filterClients() { renderClients(); }
function filterClientLevel(nivel) { /* TODO */ }
function sortClients(by) { /* TODO */ }

function openNewClient() { buildClientModal(null); }

async function openViewClient(id) {
  const c = APP.clientes.find(x => x.id === id);
  if (!c) return;
  const historico = await API.getHistoricoCliente(id);
  buildClientViewModal(c, historico);
}

function buildClientModal(client) {
  const modal = document.createElement('div');
  modal.id = 'client-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3 class="modal-title">${client ? 'Editar Cliente' : I18N.t('client_new')}</h3>
        <button class="modal-close" onclick="document.getElementById('client-modal').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">${I18N.t('client_name')} *</label><input type="text" id="cli-nome" class="form-control" value="${client?.nome||''}" placeholder="Nome completo"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('client_phone')}</label><input type="tel" id="cli-tel" class="form-control" value="${client?.telefone||''}" placeholder="(11) 99999-9999"></div>
          <div class="form-group"><label class="form-label">${I18N.t('client_cpf')}</label><input type="text" id="cli-cpf" class="form-control" value="${client?.cpf||''}" placeholder="000.000.000-00"></div>
        </div>
        <div class="form-group"><label class="form-label">${I18N.t('client_email')}</label><input type="email" id="cli-email" class="form-control" value="${client?.email||''}" placeholder="email@exemplo.com"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('client_birthday')}</label><input type="date" id="cli-aniv" class="form-control" value="${client?.aniversario||''}"></div>
          <div class="form-group"><label class="form-label">${I18N.t('client_level')}</label><select id="cli-nivel" class="form-control"><option value="normal" ${!client?.nivel||client?.nivel==='normal'?'selected':''}>Normal</option><option value="vip" ${client?.nivel==='vip'?'selected':''}>⭐ VIP</option><option value="premium" ${client?.nivel==='premium'?'selected':''}>💎 Premium</option></select></div>
        </div>
        <div class="form-group"><label class="form-label">${I18N.t('client_address')}</label><input type="text" id="cli-end" class="form-control" value="${client?.endereco||''}" placeholder="Rua, Nº, Bairro, Cidade"></div>
        <div class="form-group"><label class="form-label">${I18N.t('client_credit_limit')}</label><input type="number" id="cli-limite" class="form-control" value="${client?.limite_credito||''}" placeholder="0,00" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">${I18N.t('notes')}</label><textarea id="cli-obs" class="form-control" rows="2" placeholder="Observações...">${client?.observacoes||''}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('client-modal').remove();document.body.style.overflow=''">Cancelar</button>
        <button class="btn btn-primary" onclick="saveClient('${client?.id||''}')"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function saveClient(id) {
  const nome = document.getElementById('cli-nome')?.value?.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', 'warning'); return; }

  const dados = {
    nome, telefone: document.getElementById('cli-tel')?.value||null,
    cpf: document.getElementById('cli-cpf')?.value||null,
    email: document.getElementById('cli-email')?.value||null,
    aniversario: document.getElementById('cli-aniv')?.value||null,
    nivel: document.getElementById('cli-nivel')?.value||'normal',
    endereco: document.getElementById('cli-end')?.value||null,
    limite_credito: parseFloat(document.getElementById('cli-limite')?.value)||null,
    observacoes: document.getElementById('cli-obs')?.value||null,
  };

  try {
    if (id) {
      const updated = await API.updateCliente(id, dados);
      const idx = APP.clientes.findIndex(c => c.id === id);
      if (idx >= 0) APP.clientes[idx] = updated;
    } else {
      const novo = await API.createCliente(STATE.empresa.id, dados);
      APP.clientes.push(novo);
    }
    document.getElementById('client-modal').remove();
    document.body.style.overflow = '';
    renderClients();
    UI.toast('✅ Cliente salvo!', 'success');
  } catch(e) {
    UI.toast('❌ ' + e.message, 'error');
  }
}

function buildClientViewModal(c, historico) {
  const modal = document.createElement('div');
  modal.id = 'client-view-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700;color:#fff">${initials(c.nome)}</div>
          <div>
            <h3 class="modal-title" style="margin:0">${c.nome} ${c.nivel!=='normal'?`<span class="badge badge-warning">${c.nivel==='vip'?'⭐ VIP':'💎 Premium'}</span>`:''}</h3>
            <div style="font-size:.78rem;color:var(--text-3)">${c.telefone||''}</div>
          </div>
        </div>
        <button class="modal-close" onclick="document.getElementById('client-view-modal').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        ${c.email ? `<div style="font-size:.84rem;color:var(--text-2);margin-bottom:6px"><i data-lucide="mail" style="width:12px;height:12px;margin-right:4px"></i>${c.email}</div>` : ''}
        ${c.endereco ? `<div style="font-size:.84rem;color:var(--text-2);margin-bottom:6px"><i data-lucide="map-pin" style="width:12px;height:12px;margin-right:4px"></i>${c.endereco}</div>` : ''}
        ${c.aniversario ? `<div style="font-size:.84rem;color:var(--text-2);margin-bottom:12px"><i data-lucide="cake" style="width:12px;height:12px;margin-right:4px"></i>Aniversário: ${fmtDate(c.aniversario)}</div>` : ''}

        <div style="margin-bottom:16px">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px">HISTÓRICO (${historico.length})</div>
          ${historico.length ? historico.map(o=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.82rem;cursor:pointer" onclick="document.getElementById('client-view-modal').remove();openViewOS('${o.id}')">
              <div><span style="color:var(--text-3)">#${o.numero}</span> ${o.item}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="badge" style="font-size:.68rem">${statusLabel(o.status)}</span>
                <span style="font-weight:600;color:var(--green)">${fmt(o.valor_total)}</span>
              </div>
            </div>`).join('') : '<div style="font-size:.82rem;color:var(--text-3);padding:8px 0">Sem histórico</div>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('client-view-modal').remove();document.body.style.overflow=''">Fechar</button>
        ${c.telefone ? `<button class="btn btn-secondary btn-sm" onclick="window.open('${API.buildWhatsAppLink(c.telefone,'Olá '+c.nome+'!')}','_blank')"><i data-lucide="message-circle" style="width:13px;height:13px"></i> WhatsApp</button>` : ''}
        <button class="btn btn-primary" onclick="document.getElementById('client-view-modal').remove();buildClientModal(${JSON.stringify(c).replace(/"/g,'&quot;')})"><i data-lucide="pencil" style="width:13px;height:13px"></i> Editar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

// ── ESTOQUE ────────────────────────────────────────────────
function renderStock() {
  const tbody = document.getElementById('stock-tbody');
  if (!tbody) return;

  const q = (document.getElementById('stock-search')?.value || '').toLowerCase();
  let lista = APP.produtos;
  if (q) lista = lista.filter(p => p.nome?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q) || p.codigo_barras?.includes(q));

  const count = document.getElementById('stock-count');
  if (count) count.textContent = lista.length + ' produto' + (lista.length!==1?'s':'');

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--text-3)"><i data-lucide="package" style="width:32px;height:32px;display:block;margin:0 auto 12px;opacity:.3"></i>Nenhum produto encontrado</td></tr>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = lista.map(p => {
    const margin = p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_venda * 100).toFixed(0) : 0;
    const baixo  = p.estoque_minimo > 0 && (p.quantidade||0) <= p.estoque_minimo;
    return `
      <tr ${baixo?'style="background:rgba(251,146,60,.05)"':''}>
        <td>
          <div style="font-weight:600;font-size:.86rem">${p.nome}</div>
          ${p.codigo?`<div style="font-size:.72rem;color:var(--text-3)">${p.codigo}</div>`:''}
          ${baixo?'<span class="badge badge-warning" style="font-size:.68rem">⚠ Baixo</span>':''}
        </td>
        <td style="font-family:'JetBrains Mono',monospace;font-weight:600;color:${baixo?'var(--orange)':'var(--text-1)'}">${p.quantidade||0}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;color:var(--text-2)">${fmt(p.preco_custo)}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-weight:600">${fmt(p.preco_venda)}</td>
        <td><span class="badge ${margin>=50?'badge-success':margin>=30?'badge-warning':''}" style="font-size:.72rem">${margin}%</span></td>
        <td style="font-size:.78rem;color:var(--text-3)">${p.fornecedor||'–'}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-icon" onclick="openEditProduct('${p.id}')" title="Editar"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
            <button class="btn btn-ghost btn-icon" onclick="confirmDeleteProduct('${p.id}','${p.nome}')" title="Excluir" style="color:var(--red)"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function filterStock() { renderStock(); }
function filterLowStock() { /* TODO toggle */ renderStock(); }

function openNewProduct() { buildProductModal(null); }
async function openEditProduct(id) {
  const p = APP.produtos.find(x => x.id === id);
  if (p) buildProductModal(p);
}

function buildProductModal(prod) {
  const modal = document.createElement('div');
  modal.id = 'product-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3 class="modal-title">${prod ? 'Editar Produto' : I18N.t('stock_new')}</h3>
        <button class="modal-close" onclick="document.getElementById('product-modal').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">${I18N.t('stock_name')} *</label><input type="text" id="prd-nome" class="form-control" value="${prod?.nome||''}" placeholder="Nome do produto"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('stock_code')}</label><input type="text" id="prd-cod" class="form-control" value="${prod?.codigo||''}" placeholder="SKU-001"></div>
          <div class="form-group"><label class="form-label">${I18N.t('stock_barcode')}</label>
            <div style="position:relative">
              <input type="text" id="prd-barcode" class="form-control" value="${prod?.codigo_barras||''}" placeholder="0000000000000" style="padding-right:36px">
              <button type="button" onclick="openScanner('prd-barcode')" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-3)"><i data-lucide="scan-barcode" style="width:14px;height:14px"></i></button>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('stock_cost')}</label><input type="number" id="prd-custo" class="form-control" value="${prod?.preco_custo||''}" placeholder="0,00" min="0" step="0.01" oninput="calcMargemProd()"></div>
          <div class="form-group"><label class="form-label">${I18N.t('stock_price')}</label><input type="number" id="prd-venda" class="form-control" value="${prod?.preco_venda||''}" placeholder="0,00" min="0" step="0.01" oninput="calcMargemProd()"></div>
        </div>
        <div id="prd-margin-display" style="font-size:.78rem;color:var(--text-3);margin-bottom:12px;padding:6px 10px;background:var(--bg-2);border-radius:var(--radius-sm)">Margem: –</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('stock_quantity')}</label><input type="number" id="prd-qtd" class="form-control" value="${prod?.quantidade||0}" min="0"></div>
          <div class="form-group"><label class="form-label">${I18N.t('stock_min')}</label><input type="number" id="prd-min" class="form-control" value="${prod?.estoque_minimo||''}" placeholder="Ex: 5" min="0"></div>
        </div>
        <div class="form-group"><label class="form-label">${I18N.t('stock_category')}</label><input type="text" id="prd-cat" class="form-control" value="${prod?.categoria||''}" placeholder="Ex: Telas, Baterias..."></div>
        <div class="form-group"><label class="form-label">${I18N.t('stock_supplier')}</label><input type="text" id="prd-forn" class="form-control" value="${prod?.fornecedor||''}" placeholder="Nome do fornecedor"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('product-modal').remove();document.body.style.overflow=''">Cancelar</button>
        <button class="btn btn-primary" onclick="saveProduct('${prod?.id||''}')"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => { lucide.createIcons(); calcMargemProd(); }, 50);
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
  } else {
    el.textContent = 'Margem: –';
  }
}

async function saveProduct(id) {
  const nome = document.getElementById('prd-nome')?.value?.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', 'warning'); return; }

  const dados = {
    nome, codigo: document.getElementById('prd-cod')?.value||null,
    codigo_barras: document.getElementById('prd-barcode')?.value||null,
    preco_custo: parseFloat(document.getElementById('prd-custo')?.value)||0,
    preco_venda: parseFloat(document.getElementById('prd-venda')?.value)||0,
    quantidade: parseInt(document.getElementById('prd-qtd')?.value)||0,
    estoque_minimo: parseInt(document.getElementById('prd-min')?.value)||0,
    categoria: document.getElementById('prd-cat')?.value||null,
    fornecedor: document.getElementById('prd-forn')?.value||null,
  };

  try {
    if (id) {
      const up = await API.updateProduto(id, dados);
      const idx = APP.produtos.findIndex(p => p.id === id);
      if (idx >= 0) APP.produtos[idx] = up;
    } else {
      const novo = await API.createProduto(STATE.empresa.id, dados);
      APP.produtos.push(novo);
    }
    document.getElementById('product-modal').remove();
    document.body.style.overflow = '';
    renderStock();
    UI.toast('✅ Produto salvo!', 'success');
  } catch(e) {
    UI.toast('❌ ' + e.message, 'error');
  }
}

function confirmDeleteProduct(id, nome) {
  UI.confirm(`Excluir "${nome}"?`, async () => {
    await API.deleteProduto(id);
    APP.produtos = APP.produtos.filter(p => p.id !== id);
    renderStock();
    UI.toast('🗑 Produto excluído', 'info');
  });
}

function openSuppliers() { UI.toast('Fornecedores em breve!', 'info'); }

// ── CAIXA ──────────────────────────────────────────────────
async function renderCash() {
  const from = today();
  const data = await API.getCaixaSummary(STATE.empresa.id, from, from);

  document.getElementById('cash-entries-val').textContent = fmt(data.entradas);
  document.getElementById('cash-exits-val').textContent   = fmt(data.saidas);
  document.getElementById('cash-balance-val').textContent = fmt(data.saldo);

  const dateEl = document.getElementById('cash-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });

  renderCashTable(data.items);
  renderContasPagar();
  renderContasReceber();
}

function renderCashTable(items) {
  const tbody = document.getElementById('cash-tbody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Sem movimentações hoje</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(i => `
    <tr>
      <td style="font-size:.78rem;color:var(--text-3);white-space:nowrap">${fmtDatetime(i.created_at)}</td>
      <td style="font-size:.84rem">${i.descricao||'–'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:600;color:${i.tipo==='entrada'?'var(--green)':'var(--red)'}">${i.tipo==='entrada'?'+':'-'}${fmt(i.valor)}</td>
      <td style="font-size:.78rem;color:var(--text-2)">${payLabel(i.forma)||'–'}</td>
      <td style="font-size:.78rem;color:var(--text-3)">${i.ordem_id?'#OS':''}</td>
    </tr>`).join('');
}

async function renderContasPagar() {
  const lista = await API.getContasPagar(STATE.empresa.id);
  APP.contasPagar = lista;
  const tbody = document.getElementById('payable-tbody');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Nenhuma conta cadastrada</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(c => {
    const venc   = c.vencimento < today();
    const status = c.pago ? '<span class="badge badge-success">Pago</span>' : venc ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge">Pendente</span>';
    return `
      <tr>
        <td style="font-size:.86rem;font-weight:500">${c.descricao}</td>
        <td style="font-weight:600;color:var(--red)">${fmt(c.valor)}</td>
        <td style="font-size:.82rem;color:${venc&&!c.pago?'var(--red)':'var(--text-2)'}">${fmtDate(c.vencimento)}</td>
        <td>${status}</td>
        <td>
          ${!c.pago ? `<button class="btn btn-ghost btn-sm" onclick="pagarConta('${c.id}','pagar')"><i data-lucide="check" style="width:12px;height:12px"></i></button>` : ''}
          <button class="btn btn-ghost btn-icon" onclick="deleteContaPagar('${c.id}')" style="color:var(--red)"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>
        </td>
      </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

async function renderContasReceber() {
  const lista = await API.getContasReceber(STATE.empresa.id);
  APP.contasReceber = lista;
  const tbody = document.getElementById('receivable-tbody');
  if (!tbody) return;
  tbody.innerHTML = lista.map(c => {
    const venc   = c.vencimento < today();
    const status = c.recebido ? '<span class="badge badge-success">Recebido</span>' : venc ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge">Pendente</span>';
    return `
      <tr>
        <td style="font-size:.86rem;font-weight:500">${c.clientes?.nome||'–'}</td>
        <td style="font-weight:600;color:var(--green)">${fmt(c.valor)}</td>
        <td style="font-size:.82rem;color:${venc&&!c.recebido?'var(--red)':'var(--text-2)'}">${fmtDate(c.vencimento)}</td>
        <td style="font-size:.78rem;color:var(--text-3)">${c.ordem_id?'#OS':''}</td>
        <td>${status}</td>
        <td>${!c.recebido ? `<button class="btn btn-ghost btn-sm" onclick="receberConta('${c.id}')"><i data-lucide="check" style="width:12px;height:12px"></i></button>` : ''}</td>
      </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function switchFinanceTab(tab, btn) {
  ['cash','payable','receivable','cashflow'].forEach(t => {
    const el = document.getElementById('finance-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.finance-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'cashflow') renderCashFlowChart();
}

async function renderCashFlowChart() {
  const canvas = document.getElementById('cashflow-chart');
  if (!canvas) return;
  UI.toast('Carregando projeção...', 'info');
  // Chart placeholder
  APP.charts.cashflow?.destroy();
  APP.charts.cashflow = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});}),
      datasets: [
        { label:'Entrada', data: Array.from({length:30},()=>Math.random()*500), backgroundColor:'rgba(52,211,153,.5)', borderColor:'#34D399', borderWidth:1 },
        { label:'Saída',   data: Array.from({length:30},()=>Math.random()*200), backgroundColor:'rgba(248,113,113,.5)', borderColor:'#F87171', borderWidth:1 },
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#9CA3AF', font:{size:11} } } }, scales:{ x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6B7280',font:{size:9}}}, y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6B7280',font:{size:10}}} } }
  });
}

function openNewTransaction() {
  const modal = document.createElement('div');
  modal.id = 'transaction-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><h3 class="modal-title">Novo Lançamento</h3><button class="modal-close" onclick="document.getElementById('transaction-modal').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Tipo</label>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-primary flex-1" id="tipo-entrada" onclick="setTipoLanc('entrada')">+ Entrada</button>
            <button type="button" class="btn btn-ghost flex-1" id="tipo-saida" onclick="setTipoLanc('saida')" style="color:var(--red);border-color:var(--red)">- Saída</button>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Descrição *</label><input type="text" id="lanc-desc" class="form-control" placeholder="Ex: Pagamento OS #0042"></div>
        <div class="form-group"><label class="form-label">Valor *</label><input type="number" id="lanc-valor" class="form-control" placeholder="0,00" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">Forma de Pagamento</label><select id="lanc-forma" class="form-control">${Object.entries(PAY_CONFIG).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('transaction-modal').remove();document.body.style.overflow=''">Cancelar</button>
        <button class="btn btn-primary" onclick="saveLancamento()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  window._lancTipo = 'entrada';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function setTipoLanc(tipo) {
  window._lancTipo = tipo;
  document.getElementById('tipo-entrada').className = tipo==='entrada'?'btn btn-primary flex-1':'btn btn-ghost flex-1';
  document.getElementById('tipo-saida').className   = tipo==='saida'  ?'btn btn-danger flex-1' :'btn btn-ghost flex-1';
  if (tipo==='saida') { document.getElementById('tipo-saida').style.cssText='color:var(--red);border-color:var(--red)'; }
}

async function saveLancamento() {
  const desc  = document.getElementById('lanc-desc')?.value?.trim();
  const valor = parseFloat(document.getElementById('lanc-valor')?.value);
  if (!desc || !valor) { UI.toast('⚠ Preencha todos os campos', 'warning'); return; }

  await API.addCaixaEntry(STATE.empresa.id, {
    tipo: window._lancTipo || 'entrada',
    descricao: desc,
    valor,
    forma: document.getElementById('lanc-forma')?.value || 'dinheiro',
  });
  document.getElementById('transaction-modal').remove();
  document.body.style.overflow = '';
  renderCash();
  UI.toast('✅ Lançamento registrado!', 'success');
}

function openCashBleed() {
  const v = prompt('Valor da sangria (R$):');
  if (!v || isNaN(parseFloat(v))) return;
  API.addCaixaEntry(STATE.empresa.id, { tipo:'saida', descricao:'Sangria de caixa', valor:parseFloat(v), forma:'dinheiro' })
    .then(() => { renderCash(); UI.toast('✅ Sangria registrada!', 'success'); });
}

function openNewPayable() {
  const desc  = prompt('Descrição da conta:');
  if (!desc) return;
  const valor = prompt('Valor (R$):');
  if (!valor || isNaN(parseFloat(valor))) return;
  const venc  = prompt('Vencimento (AAAA-MM-DD):') || today();
  API.createContaPagar(STATE.empresa.id, { descricao: desc, valor: parseFloat(valor), vencimento: venc })
    .then(() => { renderContasPagar(); UI.toast('✅ Conta adicionada!', 'success'); });
}

async function pagarConta(id) {
  await API.updateContaPagar(id, { pago: true, pago_em: today() });
  renderContasPagar();
  UI.toast('✅ Conta marcada como paga!', 'success');
}

async function deleteContaPagar(id) {
  await API.deleteContaPagar(id);
  renderContasPagar();
  UI.toast('🗑 Conta removida', 'info');
}

async function receberConta(id) {
  await API.updateContaReceber(id, { recebido: true, recebido_em: today() });
  renderContasReceber();
  UI.toast('✅ Recebimento confirmado!', 'success');
}

function generateCashFlowAI() { UI.toast('Gerando projeção com IA...', 'info'); }

// ── AGENDA / CALENDÁRIO ────────────────────────────────────
function renderCalendar() {
  const wrap = document.getElementById('cal-grid-wrap');
  const title = document.getElementById('cal-title');
  if (!wrap) return;

  const date = APP.calDate;
  const year = date.getFullYear();
  const month = date.getMonth();

  if (title) title.textContent = date.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr = today();
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const eventos = APP.agenda || [];
  const eventosByDay = {};
  eventos.forEach(e => {
    const d = e.data_inicio?.split('T')[0];
    if (d) { if (!eventosByDay[d]) eventosByDay[d] = []; eventosByDay[d].push(e); }
  });

  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:8px">
    ${dayNames.map(d=>`<div style="text-align:center;font-size:.72rem;font-weight:600;color:var(--text-3);padding:8px 4px">${d}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;

  // Células vazias antes do dia 1
  for (let i=0; i<firstDay; i++) html += `<div style="height:60px;background:var(--bg);border-radius:6px"></div>`;

  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const evs     = eventosByDay[dateStr] || [];
    html += `
      <div onclick="selectCalDay('${dateStr}')" style="min-height:60px;background:${isToday?'var(--blue-dim)':'var(--bg-2)'};border:1px solid ${isToday?'var(--blue)':'var(--border)'};border-radius:6px;padding:5px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--border-md)'" onmouseout="this.style.borderColor='${isToday?'var(--blue)':'var(--border)'}'">
        <div style="font-size:.78rem;font-weight:${isToday?'800':'500'};color:${isToday?'var(--blue)':'var(--text-2)'};margin-bottom:3px">${d}</div>
        ${evs.slice(0,2).map(e=>`<div style="font-size:.66rem;padding:2px 4px;border-radius:3px;background:${e.cor||'var(--blue)'}33;color:${e.cor||'var(--blue)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px">${e.titulo}</div>`).join('')}
        ${evs.length>2?`<div style="font-size:.62rem;color:var(--text-3)">+${evs.length-2}</div>`:''}
      </div>`;
  }

  html += '</div>';
  wrap.innerHTML = html;

  const periodoEl = document.getElementById('schedule-period');
  if (periodoEl) periodoEl.textContent = date.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
}

async function selectCalDay(dateStr) {
  const evs = APP.agenda.filter(e => e.data_inicio?.startsWith(dateStr));
  if (evs.length === 0) {
    openNewSchedule(dateStr);
    return;
  }
  UI.toast(evs.length + ' evento(s) em ' + fmtDate(dateStr), 'info');
}

function calPrev() {
  const d = APP.calDate;
  APP.calDate = new Date(d.getFullYear(), d.getMonth()-1, 1);
  renderCalendar();
}

function calNext() {
  const d = APP.calDate;
  APP.calDate = new Date(d.getFullYear(), d.getMonth()+1, 1);
  renderCalendar();
}

function setCalView(view, btn) {
  APP.calView = view;
  document.querySelectorAll('.page-header .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCalendar();
}

function openNewSchedule(data) {
  const modal = document.createElement('div');
  modal.id = 'schedule-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h3 class="modal-title">${I18N.t('schedule_new')}</h3><button class="modal-close" onclick="document.getElementById('schedule-modal').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">${I18N.t('schedule_title')} *</label><input type="text" id="sched-titulo" class="form-control" placeholder="Ex: Visita técnica - João"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('schedule_type')}</label><select id="sched-tipo" class="form-control"><option value="os">OS Agendada</option><option value="visita">Visita Técnica</option><option value="cobranca">Cobrança</option><option value="geral">Geral</option></select></div>
          <div class="form-group"><label class="form-label">Cor</label><input type="color" id="sched-cor" class="form-control" value="#38BDF8" style="height:42px;padding:4px"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('schedule_date')} *</label><input type="date" id="sched-data" class="form-control" value="${data||today()}"></div>
          <div class="form-group"><label class="form-label">${I18N.t('schedule_time')}</label><input type="time" id="sched-hora" class="form-control" value="09:00"></div>
        </div>
        <div class="form-group"><label class="form-label">${I18N.t('schedule_client')}</label><select id="sched-cliente" class="form-control"><option value="">Sem cliente</option>${APP.clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">${I18N.t('schedule_technician')}</label><select id="sched-tecnico" class="form-control"><option value="">Sem atribuição</option>${APP.funcionarios.map(f=>`<option value="${f.id}">${f.nome}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">${I18N.t('schedule_notes')}</label><textarea id="sched-obs" class="form-control" rows="2" placeholder="Observações..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('schedule-modal').remove();document.body.style.overflow=''">Cancelar</button>
        <button class="btn btn-primary" onclick="saveSchedule()"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function saveSchedule() {
  const titulo = document.getElementById('sched-titulo')?.value?.trim();
  const data   = document.getElementById('sched-data')?.value;
  if (!titulo || !data) { UI.toast('⚠ Preencha título e data', 'warning'); return; }
  const hora = document.getElementById('sched-hora')?.value || '00:00';
  const evento = {
    titulo,
    tipo:        document.getElementById('sched-tipo')?.value || 'geral',
    cor:         document.getElementById('sched-cor')?.value || '#38BDF8',
    data_inicio: data + 'T' + hora + ':00',
    cliente_id:  document.getElementById('sched-cliente')?.value || null,
    tecnico_id:  document.getElementById('sched-tecnico')?.value || null,
    descricao:   document.getElementById('sched-obs')?.value || null,
  };
  const novo = await API.createEvento(STATE.empresa.id, evento);
  APP.agenda.push(novo);
  document.getElementById('schedule-modal').remove();
  document.body.style.overflow = '';
  renderCalendar();
  UI.toast('✅ Evento criado!', 'success');
}

// ── ANALYTICS ──────────────────────────────────────────────
async function renderAnalytics() {
  const periodos = {
    month:      { from: today().slice(0,7)+'-01', to: today() },
    last_month: { from: (() => { const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7)+'-01'; })(), to: (() => { const d=new Date(); d.setMonth(d.getMonth()-1); return new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().split('T')[0]; })() },
    quarter:    { from: (() => { const d=new Date(); d.setMonth(d.getMonth()-2); return d.toISOString().slice(0,7)+'-01'; })(), to: today() },
    year:       { from: today().slice(0,4)+'-01-01', to: today() },
  };
  const { from, to } = periodos[APP.anPeriodo] || periodos.month;
  const data = await API.getAnalytics(STATE.empresa.id, from, to);

  document.getElementById('an-revenue').textContent = fmt(data.faturamento);
  document.getElementById('an-profit').textContent  = fmt(data.lucro);
  document.getElementById('an-ticket').textContent  = fmt(data.ticket_medio);

  // Meta progress
  const metas = await API.getMetas(STATE.empresa.id);
  const metaFat = metas.find(m => m.tipo === 'faturamento')?.valor_meta || 0;
  const pct = metaFat > 0 ? Math.min(100, (data.faturamento / metaFat * 100)).toFixed(0) : 0;
  document.getElementById('an-goal-pct').textContent = pct + '%';

  // Gráfico por forma de pagamento
  renderPaymentChart(data.by_payment);

  // Top services
  const tsWrap = document.getElementById('top-services-list');
  if (tsWrap) {
    tsWrap.innerHTML = data.top_services.map(([nome, count]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.84rem">
        <span>${nome}</span>
        <span class="badge">${count}x</span>
      </div>`).join('') || '<div style="color:var(--text-3);font-size:.82rem;padding:12px 0">Sem dados</div>';
  }
}

function setAnalyticsPeriod(periodo, btn) {
  APP.anPeriodo = periodo;
  document.querySelectorAll('#page-analytics .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAnalytics();
}

function renderPaymentChart(byPayment) {
  const canvas = document.getElementById('payment-chart');
  if (!canvas || !Object.keys(byPayment).length) return;
  APP.charts.payment?.destroy();
  APP.charts.payment = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(byPayment).map(payLabel),
      datasets: [{ data: Object.values(byPayment), backgroundColor: ['#38BDF8','#34D399','#A78BFA','#FB923C','#F472B6','#FBBF24','#60A5FA'], borderWidth:0 }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#9CA3AF', font:{size:10}, padding:8, boxWidth:10 } } } }
  });
}

function exportAnalytics() { UI.toast('Exportando relatório...', 'info'); }

// ── IA ─────────────────────────────────────────────────────
function renderAI() {
  const wrap = document.getElementById('ai-cards');
  if (!wrap) return;

  const cards = [
    { icon:'trending-up', color:'var(--blue)',   title:'Análise do Negócio',     desc:'Visão geral e pontos de melhoria com base nos seus dados',   action: () => askAI_business() },
    { icon:'lightbulb',   color:'var(--yellow)', title:'Sugestões de Preço',     desc:'IA analisa sua margem e sugere ajustes nos preços',           action: () => askAI_pricing() },
    { icon:'target',      color:'var(--green)',  title:'Meta do Próximo Mês',    desc:'Projeção inteligente baseada no histórico',                   action: () => askAI_goal() },
    { icon:'message-circle',color:'var(--purple)','title':'Mensagem para Cliente', desc:'Gera mensagem personalizada de cobrança ou follow-up',       action: () => askAI_message() },
    { icon:'package',     color:'var(--orange)', title:'Previsão de Estoque',    desc:'Quando reabastecer e quanto comprar de cada produto',         action: () => askAI_stock() },
    { icon:'wrench',      color:'var(--text-2)', title:'Diagnóstico Técnico',    desc:'Descreva o defeito e a IA sugere o diagnóstico provável',     action: () => askAI_diagnosis() },
  ];

  wrap.innerHTML = cards.map((c, i) => `
    <div class="card" style="cursor:pointer;transition:all .2s" onclick="ai_cards_run(${i})" onmouseover="this.style.borderColor='var(--border-md)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='';this.style.transform=''">
      <div style="width:44px;height:44px;border-radius:12px;background:${c.color}22;display:flex;align-items:center;justify-content:center;margin-bottom:14px">
        <i data-lucide="${c.icon}" style="width:22px;height:22px;color:${c.color}"></i>
      </div>
      <div style="font-size:.92rem;font-weight:700;margin-bottom:6px">${c.title}</div>
      <div style="font-size:.78rem;color:var(--text-2);line-height:1.5">${c.desc}</div>
      <div style="margin-top:14px">
        <span class="btn btn-secondary btn-sm" style="font-size:.74rem">
          <i data-lucide="sparkles" style="width:12px;height:12px"></i> Gerar com IA
        </span>
      </div>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

const _ai_actions = [
  () => askAI_business(),
  () => askAI_pricing(),
  () => askAI_goal(),
  () => askAI_message(),
  () => askAI_stock(),
  () => askAI_diagnosis(),
];
function ai_cards_run(i) { _ai_actions[i]?.(); }

async function askAI_business() {
  UI.toast('Analisando seu negócio...', 'info');
  try {
    const data = await API.getDashboardData(STATE.empresa.id);
    const resp = await API.askAI(
      `Analise estes dados do meu negócio e dê 3 sugestões práticas de melhoria:\n${JSON.stringify(data)}`,
      { empresa: STATE.empresa?.nome, segmento: STATE.empresa?.segmento }
    );
    showAIResponse('Análise do Negócio', resp);
  } catch(e) { UI.toast('❌ Erro ao consultar IA', 'error'); }
}

async function askAI_diagnosis() {
  const defeito = prompt('Descreva o defeito ou problema:');
  if (!defeito) return;
  UI.toast('Consultando IA...', 'info');
  try {
    const resp = await API.askAI(
      `Sou técnico de assistência. O cliente relatou: "${defeito}". Quais são os diagnósticos mais prováveis e como proceder?`,
      { segmento: STATE.empresa?.segmento }
    );
    showAIResponse('Diagnóstico Técnico', resp);
  } catch(e) { UI.toast('❌ Erro ao consultar IA', 'error'); }
}

async function askAI_goal() {
  UI.toast('Calculando meta ideal...', 'info');
  try {
    const data = await API.getAnalytics(STATE.empresa.id, today().slice(0,7)+'-01', today());
    const resp = await API.askAI(
      `Com base no faturamento atual de ${fmt(data.faturamento)}, sugira uma meta realista para o próximo mês e estratégias para atingi-la.`
    );
    showAIResponse('Meta Sugerida', resp);
  } catch(e) { UI.toast('❌ Erro ao consultar IA', 'error'); }
}

async function askAI_pricing()  { UI.toast('Analisando preços...', 'info'); setTimeout(() => UI.toast('Em desenvolvimento', 'info'), 800); }
async function askAI_message()  { UI.toast('Gerando mensagem...', 'info'); setTimeout(() => UI.toast('Em desenvolvimento', 'info'), 800); }
async function askAI_stock()    { UI.toast('Analisando estoque...', 'info'); setTimeout(() => UI.toast('Em desenvolvimento', 'info'), 800); }

function showAIResponse(titulo, conteudo) {
  const modal = document.createElement('div');
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:540px">
      <div class="modal-header">
        <h3 class="modal-title"><i data-lucide="sparkles" style="width:16px;height:16px;color:var(--purple);margin-right:6px"></i>${titulo}</h3>
        <button class="modal-close" onclick="this.closest('.modal-wrap').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="modal-body">
        <div style="font-size:.88rem;line-height:1.7;color:var(--text-1);white-space:pre-wrap">${conteudo}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-wrap').remove();document.body.style.overflow=''">Fechar</button>
        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${conteudo.replace(/'/g,"\\'")}');UI.toast('✅ Copiado!','success')"><i data-lucide="copy" style="width:14px;height:14px"></i> Copiar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

// ── NOTIFICAÇÕES ───────────────────────────────────────────
function renderNotifications() {
  const wrap = document.getElementById('notif-list');
  if (!wrap) return;

  if (!APP.notifs.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="bell-off" style="width:32px;height:32px"></i></div><div class="empty-title">${I18N.t('notif_empty')}</div></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const icons = { os_ready:'package-check', payment:'dollar-sign', low_stock:'alert-triangle', birthday:'cake', overdue:'clock', new_client:'user-plus' };

  wrap.innerHTML = APP.notifs.map(n => `
    <div onclick="markNotifRead('${n.id}',this)" style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);cursor:pointer;opacity:${n.lida?'.6':'1'};transition:opacity .15s">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--blue-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i data-lucide="${icons[n.tipo]||'bell'}" style="width:16px;height:16px;color:var(--blue)"></i>
      </div>
      <div style="flex:1">
        <div style="font-size:.86rem;font-weight:${n.lida?'400':'600'}">${n.titulo||n.mensagem}</div>
        <div style="font-size:.76rem;color:var(--text-3);margin-top:2px">${fmtDatetime(n.created_at)}</div>
      </div>
      ${!n.lida ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:4px"></div>' : ''}
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

async function markNotifRead(id, el) {
  await API.marcarNotifLida(id);
  const n = APP.notifs.find(x => x.id === id);
  if (n) n.lida = true;
  if (el) el.style.opacity = '.6';
  App._updateNotifBadge();
}

async function markAllNotifRead() {
  await API.marcarTodasLidas(STATE.empresa.id);
  APP.notifs.forEach(n => n.lida = true);
  renderNotifications();
  App._updateNotifBadge();
  UI.toast('✅ Todas marcadas como lidas', 'success');
}

// ── CONFIGURAÇÕES ──────────────────────────────────────────
function renderSettings(tab) {
  APP.settingsTab = tab || 'company';

  // Ativa item no nav
  document.querySelectorAll('#settings-nav .nav-item').forEach(i => i.classList.remove('active'));
  const active = document.querySelector(`#settings-nav .nav-item[onclick*="${APP.settingsTab}"]`);
  if (active) active.classList.add('active');

  const content = document.getElementById('settings-content');
  if (!content) return;

  const emp = STATE.empresa || {};
  const prefs = JSON.parse(localStorage.getItem('nexos_prefs')||'{}');

  const tabs = {
    company: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">${I18N.t('settings_company')}</h4>
        <div class="form-group"><label class="form-label">${I18N.t('settings_company_name')}</label><input type="text" id="cfg-nome" class="form-control" value="${emp.nome||''}"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('settings_phone')}</label><input type="tel" id="cfg-tel" class="form-control" value="${emp.telefone||''}"></div>
          <div class="form-group"><label class="form-label">${I18N.t('settings_cnpj')}</label><input type="text" id="cfg-cnpj" class="form-control" value="${emp.cnpj||''}"></div>
        </div>
        <div class="form-group"><label class="form-label">${I18N.t('settings_address')}</label><input type="text" id="cfg-end" class="form-control" value="${emp.endereco||''}" placeholder="Endereço completo"></div>
        <div class="form-group"><label class="form-label">${I18N.t('settings_pix')}</label><input type="text" id="cfg-pix" class="form-control" value="${emp.pix||''}" placeholder="Chave PIX"></div>
        <div class="form-group"><label class="form-label">${I18N.t('settings_warranty_text')}</label><textarea id="cfg-garantia" class="form-control" rows="3" placeholder="Texto padrão da garantia...">${emp.texto_garantia||''}</textarea></div>
        <button class="btn btn-primary" onclick="saveEmpresaConfig()"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>`,

    appearance: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">Aparência</h4>
        <div class="setting-row"><div class="setting-info"><div class="setting-label">${I18N.t('settings_language')}</div></div>
          <select class="form-control" style="width:140px" onchange="I18N.set(this.value)">
            <option value="pt" ${I18N.lang==='pt'?'selected':''}>🇧🇷 PT-BR</option>
            <option value="en" ${I18N.lang==='en'?'selected':''}>🇺🇸 EN</option>
            <option value="es" ${I18N.lang==='es'?'selected':''}>🇪🇸 ES</option>
          </select>
        </div>
        <div class="setting-row"><div class="setting-info"><div class="setting-label">${I18N.t('settings_currency')}</div></div>
          <select class="form-control" style="width:140px" onchange="STATE.currency=this.value">
            <option value="BRL" ${STATE.currency==='BRL'?'selected':''}>R$ Real</option>
            <option value="USD" ${STATE.currency==='USD'?'selected':''}>$ Dollar</option>
            <option value="EUR" ${STATE.currency==='EUR'?'selected':''}>€ Euro</option>
          </select>
        </div>
        <div class="setting-row"><div class="setting-info"><div class="setting-label">${I18N.t('settings_signature')}</div><div class="setting-desc">Coleta assinatura do cliente nas OS</div></div>
          <label class="toggle"><input type="checkbox" ${prefs.signature_enabled?'checked':''} onchange="togglePref('signature_enabled',this.checked)"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row"><div class="setting-info"><div class="setting-label">${I18N.t('settings_photos')}</div><div class="setting-desc">Permite fotos nas OS</div></div>
          <label class="toggle"><input type="checkbox" ${prefs.photos_enabled?'checked':''} onchange="togglePref('photos_enabled',this.checked)"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row"><div class="setting-info"><div class="setting-label">${I18N.t('settings_camera')}</div><div class="setting-desc">Scanner de câmera para código de barras</div></div>
          <label class="toggle"><input type="checkbox" ${prefs.camera_enabled?'checked':''} onchange="togglePref('camera_enabled',this.checked)"><span class="toggle-slider"></span></label>
        </div>
      </div>`,

    employees: `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h4 style="font-size:.92rem;font-weight:700;margin:0">${I18N.t('settings_employees')}</h4>
          <button class="btn btn-primary btn-sm" onclick="openNewEmployee()"><i data-lucide="user-plus" style="width:13px;height:13px"></i> ${I18N.t('employee_new')}</button>
        </div>
        <div id="employees-list">${renderEmployeesList()}</div>
      </div>`,

    segment: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">${I18N.t('settings_segment')}</h4>
        <p style="font-size:.84rem;color:var(--text-2);margin-bottom:20px">Alterar o segmento adapta toda a interface do sistema.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${SEGMENTS.list.map(seg => `
            <div class="segment-card ${STATE.empresa?.segmento===seg.id?'selected':''}" onclick="changeSegment('${seg.id}',this)">
              <div class="segment-card-icon" style="background:${seg.color}22"><i data-lucide="${seg.icon}" style="width:22px;height:22px;color:${seg.color}"></i></div>
              <div class="segment-card-name">${seg.labels[I18N.lang]?.name||seg.labels.pt.name}</div>
              <div class="segment-card-desc">${seg.labels[I18N.lang]?.desc||seg.labels.pt.desc}</div>
            </div>`).join('')}
        </div>
      </div>`,

    goals: `
      <div class="card">
        <h4 style="font-size:.92rem;font-weight:700;margin-bottom:20px">${I18N.t('settings_goals')}</h4>
        <div class="form-group"><label class="form-label">Meta de Faturamento Mensal</label><input type="number" id="meta-fat" class="form-control" placeholder="Ex: 10000" min="0" step="100"></div>
        <div class="form-group"><label class="form-label">Meta de OS / Atendimentos</label><input type="number" id="meta-os" class="form-control" placeholder="Ex: 50" min="0"></div>
        <button class="btn btn-primary" onclick="saveMetas()"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar Metas</button>
      </div>`,

    about: `
      <div class="card" style="text-align:center;padding:32px">
        <img src="NexOS.png" alt="NexOS" style="width:64px;height:64px;border-radius:14px;margin-bottom:16px;box-shadow:0 8px 32px rgba(56,189,248,.2)">
        <div style="font-size:1.4rem;font-weight:800;background:var(--grad-logo);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">NexOS</div>
        <div style="font-size:.82rem;color:var(--text-3);margin-top:4px">Versão 3.0 · Gestão inteligente</div>
        <div style="font-size:.78rem;color:var(--text-3);margin-top:20px;line-height:1.8">
          Empresa: <strong style="color:var(--text-1)">${STATE.empresa?.nome||'–'}</strong><br>
          Plano: <strong style="color:var(--blue)">${STATE.empresa?.plano||'Básico'}</strong><br>
          ID: <code style="font-size:.72rem;color:var(--text-3)">${STATE.empresa?.id?.slice(0,8)||'–'}</code>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:20px" onclick="Auth.logout()"><i data-lucide="log-out" style="width:13px;height:13px"></i> Sair</button>
      </div>`,
  };

  content.innerHTML = tabs[APP.settingsTab] || '<div class="card"><div style="color:var(--text-3);padding:20px">Em breve...</div></div>';
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function showSettingsTab(tab) {
  APP.settingsTab = tab;
  renderSettings(tab);
  // Atualiza nav
  document.querySelectorAll('#settings-nav .nav-item').forEach(i => i.classList.remove('active'));
  const active = document.querySelector(`#settings-nav .nav-item[onclick*="${tab}"]`);
  if (active) active.classList.add('active');
}

function renderEmployeesList() {
  if (!APP.funcionarios.length)
    return '<div style="font-size:.84rem;color:var(--text-3);padding:12px 0">Nenhum funcionário cadastrado</div>';

  return APP.funcionarios.map(f => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:50%;background:${avatarColor(f.nome)};display:flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:700;color:#fff;flex-shrink:0">${initials(f.nome)}</div>
      <div style="flex:1">
        <div style="font-size:.88rem;font-weight:600">${f.nome}</div>
        <div style="font-size:.74rem;color:var(--text-3)">${f.funcao||'Funcionário'}</div>
      </div>
      <button class="btn btn-ghost btn-icon" onclick="openEditEmployee('${f.id}')" title="Editar"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
      <button class="btn btn-ghost btn-icon" onclick="confirmDeleteEmployee('${f.id}','${f.nome}')" style="color:var(--red)" title="Remover"><i data-lucide="user-x" style="width:13px;height:13px"></i></button>
    </div>`).join('');
}

function togglePref(key, value) {
  const prefs = JSON.parse(localStorage.getItem('nexos_prefs')||'{}');
  prefs[key] = value;
  localStorage.setItem('nexos_prefs', JSON.stringify(prefs));
  UI.toast('✅ Preferência salva!', 'success');
}

async function saveEmpresaConfig() {
  const updates = {
    nome:          document.getElementById('cfg-nome')?.value?.trim(),
    telefone:      document.getElementById('cfg-tel')?.value||null,
    cnpj:          document.getElementById('cfg-cnpj')?.value||null,
    endereco:      document.getElementById('cfg-end')?.value||null,
    pix:           document.getElementById('cfg-pix')?.value||null,
    texto_garantia:document.getElementById('cfg-garantia')?.value||null,
  };
  try {
    await API.updateEmpresa(STATE.empresa.id, updates);
    Object.assign(STATE.empresa, updates);
    UI.toast('✅ Dados da empresa salvos!', 'success');
  } catch(e) {
    UI.toast('❌ ' + e.message, 'error');
  }
}

function changeSegment(id, el) {
  SEGMENTS.set(id);
  API.updateEmpresa(STATE.empresa.id, { segmento: id });
  document.querySelectorAll('#settings-content .segment-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  Auth._updateSegmentLabels();
  UI.toast('✅ Segmento alterado!', 'success');
}

async function saveMetas() {
  const fat = parseFloat(document.getElementById('meta-fat')?.value);
  const os  = parseFloat(document.getElementById('meta-os')?.value);
  if (fat) await API.setMeta(STATE.empresa.id, 'faturamento', fat);
  if (os)  await API.setMeta(STATE.empresa.id, 'os', os);
  UI.toast('✅ Metas salvas!', 'success');
}

function openNewEmployee() { buildEmployeeModal(null); }
async function openEditEmployee(id) {
  const f = APP.funcionarios.find(x => x.id === id);
  if (f) buildEmployeeModal(f);
}

function buildEmployeeModal(func) {
  const PERMS = ['criar_os','ver_todas_os','deletar_os','ver_caixa','ver_analytics','gerenciar_estoque','ver_clientes','editar_config','ver_valores'];
  const perms = func?.permissoes || {};
  const modal = document.createElement('div');
  modal.id = 'employee-modal';
  modal.className = 'modal-wrap open';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h3 class="modal-title">${func ? 'Editar Funcionário' : I18N.t('employee_new')}</h3><button class="modal-close" onclick="document.getElementById('employee-modal').remove();document.body.style.overflow=''"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">${I18N.t('employee_name')} *</label><input type="text" id="emp-nome" class="form-control" value="${func?.nome||''}"></div>
          <div class="form-group"><label class="form-label">${I18N.t('employee_role')}</label><input type="text" id="emp-funcao" class="form-control" value="${func?.funcao||''}" placeholder="Ex: Técnico"></div>
        </div>
        <div class="form-group"><label class="form-label">${I18N.t('employee_pin')} ${func?'(deixe vazio para não alterar)':''}</label>
          <div class="pin-inputs"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"><input class="pin-input" type="password" maxlength="1" inputmode="numeric"></div>
        </div>
        <div style="font-size:.8rem;font-weight:600;color:var(--text-2);margin-bottom:10px">${I18N.t('employee_permissions')}</div>
        <div style="display:grid;gap:6px">
          ${PERMS.map(p => `
            <div class="setting-row" style="padding:8px 0">
              <div class="setting-label" style="font-size:.82rem">${I18N.t('perm_'+p.replace(/___/g,'_').replace('criar_os','create_os').replace('ver_todas_os','view_all_os').replace('deletar_os','delete_os').replace('ver_caixa','view_cash').replace('ver_analytics','view_analytics').replace('gerenciar_estoque','manage_stock').replace('ver_clientes','view_clients').replace('editar_config','edit_settings').replace('ver_valores','view_values'))||p}</div>
              <label class="toggle"><input type="checkbox" id="perm-${p}" ${perms[p]?'checked':''}><span class="toggle-slider"></span></label>
            </div>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('employee-modal').remove();document.body.style.overflow=''">Cancelar</button>
        <button class="btn btn-primary" onclick="saveEmployee('${func?.id||''}')"><i data-lucide="save" style="width:14px;height:14px"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // PIN inputs behavior
  const pinInputs = modal.querySelectorAll('.pin-input');
  pinInputs.forEach((inp, i) => {
    inp.oninput = e => { e.target.value = e.target.value.replace(/\D/g,''); if (e.target.value && pinInputs[i+1]) pinInputs[i+1].focus(); };
    inp.onkeydown = e => { if (e.key==='Backspace' && !e.target.value && pinInputs[i-1]) pinInputs[i-1].focus(); };
  });

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function saveEmployee(id) {
  const nome = document.getElementById('emp-nome')?.value?.trim();
  if (!nome) { UI.toast('⚠ Nome obrigatório', 'warning'); return; }

  const pinInputs = document.querySelectorAll('#employee-modal .pin-input');
  const pin = Array.from(pinInputs).map(i => i.value).join('');

  const PERMS = ['criar_os','ver_todas_os','deletar_os','ver_caixa','ver_analytics','gerenciar_estoque','ver_clientes','editar_config','ver_valores'];
  const permissoes = {};
  PERMS.forEach(p => { permissoes[p] = document.getElementById('perm-'+p)?.checked || false; });

  const dados = {
    nome, funcao: document.getElementById('emp-funcao')?.value||null,
    permissoes,
    ...(pin.length === 4 ? { pin } : {}),
  };

  try {
    if (id) {
      const up = await API.updateFuncionario(id, dados);
      const idx = APP.funcionarios.findIndex(f => f.id === id);
      if (idx >= 0) APP.funcionarios[idx] = up;
    } else {
      if (pin.length !== 4) { UI.toast('⚠ PIN de 4 dígitos obrigatório', 'warning'); return; }
      const novo = await API.createFuncionario(STATE.empresa.id, dados);
      APP.funcionarios.push(novo);
    }
    document.getElementById('employee-modal').remove();
    document.body.style.overflow = '';
    renderSettings('employees');
    UI.toast('✅ Funcionário salvo!', 'success');
  } catch(e) {
    UI.toast('❌ ' + e.message, 'error');
  }
}

function confirmDeleteEmployee(id, nome) {
  UI.confirm(`Desativar "${nome}"?`, async () => {
    await API.deleteFuncionario(id);
    APP.funcionarios = APP.funcionarios.filter(f => f.id !== id);
    renderSettings('employees');
    UI.toast('✅ Funcionário desativado', 'info');
  });
}

// ── MASTER ADMIN ───────────────────────────────────────────
async function renderMaster() {
  if (!STATE.isMaster) return;
  const content = document.getElementById('master-content');
  if (!content) return;

  const { data: empresas } = await window.sb.from('empresas').select('*').order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card blue"><div class="kpi-value">${empresas?.length||0}</div><div class="kpi-label">Empresas</div></div>
    </div>
    <div class="card">
      <h4 style="font-size:.92rem;font-weight:700;margin-bottom:16px">Todas as Empresas</h4>
      <div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Segmento</th><th>Plano</th><th>Cadastro</th><th>Status</th></tr></thead>
      <tbody>${(empresas||[]).map(e=>`
        <tr>
          <td><div style="font-weight:600;font-size:.86rem">${e.nome}</div><div style="font-size:.74rem;color:var(--text-3)">${e.id.slice(0,8)}</div></td>
          <td style="font-size:.82rem">${e.segmento||'tech'}</td>
          <td><span class="badge badge-${e.plano==='pro'?'success':'warning'}">${e.plano||'basico'}</span></td>
          <td style="font-size:.78rem;color:var(--text-3)">${fmtDate(e.created_at)}</td>
          <td><span class="badge ${e.ativo?'badge-success':'badge-danger'}">${e.ativo?'Ativo':'Inativo'}</span></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}
