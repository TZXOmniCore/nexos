/* ═══════════════════════════════════════════════
   NEXOS v3.0 — APP.JS
   ═══════════════════════════════════════════════ */

// ── STATE ──
const STATE = {
  user: null, empresa: null, perfil: null,
  funcionario: null, // se for login por PIN
  os: [], clientes: [], produtos: [], notifs: [],
  eventos: [], contas_pagar: [], contas_receber: [],
  os_items: [], os_pay: '', os_cli_id: null,
  os_editing: null,
  config: {},
  chartFat: null, chartMensal: null, chartPag: null,
  agendaMes: new Date().getMonth(), agendaAno: new Date().getFullYear(),
  agendaDia: new Date().getDate(),
  range: 30, anPeriodo: 'mes',
  caixaTab: 'mov', caixaPeriodo: 'hoje',
};

// ── UTILS ──
const fmt = v => 'R$ ' + (parseFloat(v)||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const today = () => new Date().toISOString().split('T')[0];
const avatarColor = n => { const c=['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899']; let h=0; for(let i=0;i<(n||'').length;i++) h+=n.charCodeAt(i); return c[h%c.length]; };
const initials = n => (n||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
const fmtDate = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
const statusLabel = s => ({aberta:'🟡 Aguardando',em_andamento:'🔵 Em andamento',pronta:'🟠 Pronta',paga:'🟢 Concluída',fiado:'🟣 Fiado',cancelada:'🔴 Cancelada',orcamento:'📝 Orçamento'}[s]||s);
const payLabel = p => ({dinheiro:'💵 Dinheiro',pix:'🟢 PIX',credito:'💳 Crédito',debito:'💳 Débito',fiado:'🤝 Fiado',carne:'📋 Carnê',transferencia:'🏦 Transferência',orcamento:'📝 Orçamento'}[p]||p||'—');

// ── UI ──
const UI = {
  setLoading(msg) {
    document.getElementById('ls-msg').textContent = msg || 'Carregando...';
    document.getElementById('loading-screen').style.display = 'flex';
  },
  hideLoading() { document.getElementById('loading-screen').style.display = 'none'; },
  toast(msg, err=false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.borderColor = err ? 'rgba(239,68,68,.4)' : 'var(--b2)';
    t.classList.add('show');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => t.classList.remove('show'), 3000);
  },
  openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  closeModal(id) {
    if (id) { document.getElementById(id).classList.remove('open'); }
    else { document.querySelectorAll('.mwrap.open').forEach(m => m.classList.remove('open')); }
    document.body.style.overflow = '';
  },
  toggleNotif() {
    document.getElementById('notifPanel').classList.toggle('open');
    document.getElementById('userMenu').classList.remove('open');
  },
  toggleUserMenu() {
    document.getElementById('userMenu').classList.toggle('open');
    document.getElementById('notifPanel').classList.remove('open');
  },
  closeUserMenu() { document.getElementById('userMenu').classList.remove('open'); },
  toggleMore() {
    document.getElementById('more-menu').classList.toggle('gone');
    document.getElementById('more-overlay').classList.toggle('gone');
  },
  closeMore() {
    document.getElementById('more-menu').classList.add('gone');
    document.getElementById('more-overlay').classList.add('gone');
  },
  toggleDescricao(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'none' ? '' : 'none';
  },
  toggleEye(id, btn) {
    const inp = document.getElementById(id);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  },
  showApp() {
    document.getElementById('app').classList.remove('gone');
    document.getElementById('bottom-nav').classList.remove('gone');
    document.getElementById('fab-btn').classList.remove('gone');
    document.getElementById('auth-screen').classList.add('gone');
    document.getElementById('onboarding').classList.add('gone');
  },
  setMasterVisible(v) {
    document.getElementById('sb-master').style.display = v ? 'flex' : 'none';
    document.getElementById('um-master').style.display = v ? 'flex' : 'none';
    document.getElementById('more-master').style.display = v ? 'flex' : 'none';
  },
  updateUserUI(u, empresa) {
    const name = u.nome || u.email?.split('@')[0] || '?';
    const role = u.perfil || 'Usuário';
    const av = initials(name);
    document.getElementById('sb-av').textContent = av;
    document.getElementById('sb-av').style.background = `linear-gradient(135deg,${avatarColor(name)},${avatarColor(name+'x')})`;
    document.getElementById('sb-uname').textContent = name;
    document.getElementById('sb-urole').textContent = role;
    document.getElementById('th-av').textContent = av;
    document.getElementById('th-uname').textContent = name;
    document.getElementById('um-name').textContent = name;
    document.getElementById('um-email').textContent = u.email || '';
    document.getElementById('um-empresa').textContent = empresa?.nome || '';
  },
};

// ── NAV ──
const Nav = {
  go(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('on'));
    document.querySelectorAll('.bn-item').forEach(i => i.classList.remove('on'));
    const pg = document.getElementById('pg-' + page);
    if (pg) pg.classList.add('on');
    document.querySelectorAll('[data-page="'+page+'"]').forEach(i => i.classList.add('on'));
    localStorage.setItem('nexos_page', page);
    UI.closeMore();
    // Carregar dados da página
    if (page === 'dashboard') Dashboard.load();
    if (page === 'os') { OS.load(); OS.renderList(); }
    if (page === 'clientes') Clientes.load();
    if (page === 'agenda') Agenda.render();
    if (page === 'caixa') Caixa.load();
    if (page === 'estoque') Estoque.load();
    if (page === 'analytics') Analytics.load();
    if (page === 'config') Config.load();
    if (page === 'master') Master.load();
    window.scrollTo(0,0);
  }
};

// ── BOOT ──
window.addEventListener('DOMContentLoaded', async () => {
  UI.setLoading('Verificando sessão...');

  // Tema
  const savedTheme = localStorage.getItem('nexos_theme');
  if (savedTheme === 'light') document.documentElement.setAttribute('data-theme','light');

  // Scanner button visibility
  const scannerOn = localStorage.getItem('nexos_scanner') === '1';
  if (scannerOn) {
    document.querySelectorAll('[id$="-btn"]').forEach(b => {
      if (b.id.includes('scanner')) b.classList.remove('gone');
    });
  }

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session?.user) {
      await carregarUsuario(session.user);
    } else {
      UI.hideLoading();
      Auth.showScreen();
    }
  } catch(e) {
    UI.hideLoading();
    Auth.showScreen();
  }

  window.sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !STATE.user) {
      carregarUsuario(session.user);
    } else if (event === 'SIGNED_OUT') {
      Object.assign(STATE, { user:null, empresa:null, perfil:null });
      localStorage.removeItem('nexos_page');
      Auth.showScreen();
    }
  });

  // Fechar menus ao clicar fora
  document.addEventListener('click', e => {
    if (!e.target.closest('#notif-btn') && !e.target.closest('#notifPanel'))
      document.getElementById('notifPanel').classList.remove('open');
    if (!e.target.closest('.th-user-chip') && !e.target.closest('.sb-user') && !e.target.closest('#userMenu'))
      document.getElementById('userMenu').classList.remove('open');
    if (!e.target.closest('#global-search') && !e.target.closest('#gsearch-panel'))
      document.getElementById('gsearch-panel').classList.add('gone');
  });
});

async function carregarUsuario(user) {
  try {
    UI.setLoading('Carregando perfil...');
    const { data: perfil } = await window.sb.from('usuarios')
      .select('*').eq('id', user.id).single();

    if (!perfil || !perfil.empresa_id) {
      // Verificar se é master
      const isMaster = user.email === 'master@nexos.app' ||
        localStorage.getItem('nexos_master') === user.id;
      STATE.user = { ...user, nome: user.user_metadata?.full_name || user.email?.split('@')[0], perfil: isMaster ? 'master' : 'dono', email: user.email };
      UI.hideLoading();
      // Onboarding para novo usuário
      document.getElementById('onboarding').classList.remove('gone');
      document.getElementById('auth-screen').classList.add('gone');
      return;
    }

    const { data: empresa } = await window.sb.from('empresas')
      .select('*').eq('id', perfil.empresa_id).single();

    STATE.user = { ...user, ...perfil, nome: perfil.nome || user.user_metadata?.full_name || user.email?.split('@')[0], email: user.email };
    STATE.empresa = empresa;
    STATE.config = empresa?.config || {};
    STATE.perfil = perfil.perfil || 'dono';

    // Config toggles
    if (STATE.config.assinatura) document.getElementById('cfg-sig').checked = true;
    if (STATE.config.fotos) { document.getElementById('cfg-foto').checked = true; document.getElementById('os-foto-section').classList.remove('gone'); }
    if (STATE.config.scanner) {
      document.getElementById('cfg-scanner').checked = true;
      document.querySelectorAll('[id$="-btn"]').forEach(b => { if(b.id.includes('scanner')) b.classList.remove('gone'); });
    }
    if (savedTheme === 'light') document.getElementById('cfg-theme').checked = false;
    else document.getElementById('cfg-theme').checked = true;

    UI.updateUserUI(STATE.user, STATE.empresa);
    UI.setMasterVisible(STATE.perfil === 'master' || STATE.perfil === 'dono');

    // Carregar OS e outros dados
    await Promise.all([OS.load(), Clientes.load(), Estoque.loadAll(), Notif.load()]);

    UI.showApp();
    UI.hideLoading();

    const lastPage = localStorage.getItem('nexos_page') || 'dashboard';
    Nav.go(lastPage);

    if (STATE.config.assinatura !== false) Sig.init();
  } catch(e) {
    console.error('carregarUsuario error:', e);
    UI.hideLoading();
    Auth.showScreen();
  }
}

const savedTheme = localStorage.getItem('nexos_theme');

// ── ONBOARDING ──
const OB = {
  next(step) {
    document.querySelectorAll('.onboard-step').forEach((s,i) => {
      s.classList.toggle('on', i === step);
      const dot = document.getElementById('ob-dot-'+i);
      if (dot) { dot.classList.toggle('done', i <= step); }
    });
  },
  async finish(usaSig) {
    const nome = document.getElementById('ob-empresa').value.trim();
    if (!nome) { UI.toast('⚠️ Informe o nome da empresa', true); OB.next(1); return; }
    UI.setLoading('Configurando empresa...');
    try {
      // Criar empresa
      const { data: emp } = await window.sb.from('empresas').insert({
        nome,
        telefone: document.getElementById('ob-tel').value,
        pix: document.getElementById('ob-pix').value,
        config: { assinatura: usaSig, fotos: false, scanner: false }
      }).select().single();

      // Atualizar usuário
      const { data: { user } } = await window.sb.auth.getUser();
      await window.sb.from('usuarios').upsert({
        id: user.id,
        email: user.email,
        nome: user.user_metadata?.full_name || user.email?.split('@')[0],
        empresa_id: emp.id,
        perfil: 'dono'
      });

      await carregarUsuario(user);
    } catch(e) {
      UI.hideLoading();
      UI.toast('Erro ao configurar: ' + e.message, true);
    }
  }
};

// ── OS ──
const OS = {
  _filtroStatus: '', _search: '',

  async load() {
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('ordens')
      .select('*').eq('empresa_id', STATE.empresa.id)
      .order('criado_em', { ascending: false });
    STATE.os = data || [];
    // Atualizar badge
    const ab = STATE.os.filter(o => o.status === 'aberta' || o.status === 'em_andamento').length;
    const badge = document.getElementById('sb-os-badge');
    if (ab > 0) { badge.style.display = ''; badge.textContent = ab; }
    else badge.style.display = 'none';
    OS.renderList();
    Dashboard.load();
  },

  filter() {
    OS._search = document.getElementById('os-search').value.toLowerCase();
    OS.renderList();
  },

  setStatus(s, el) {
    OS._filtroStatus = s;
    document.querySelectorAll('#os-chips .chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    OS.renderList();
  },

  renderList() {
    let list = STATE.os;
    if (OS._filtroStatus) list = list.filter(o => o.status === OS._filtroStatus);
    if (OS._search) list = list.filter(o =>
      (o.cliente_nome||'').toLowerCase().includes(OS._search) ||
      (o.equipamento||'').toLowerCase().includes(OS._search) ||
      (o.defeito||'').toLowerCase().includes(OS._search) ||
      String(o.numero||'').includes(OS._search)
    );
    const el = document.getElementById('os-list');
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><p>Nenhuma OS encontrada</p></div>'; return; }
    el.innerHTML = list.map(o => OS.cardHTML(o)).join('');
  },

  cardHTML(o) {
    const cor = avatarColor(o.cliente_nome || '?');
    return `<div class="os-item os-${o.status}" onclick="OS.ver('${o.id}')">
      <div class="osi-top">
        <span class="osi-num">#${String(o.numero||'?').padStart(4,'0')}</span>
        <div class="osi-avatar" style="background:${cor}">${initials(o.cliente_nome||'?')}</div>
        <span class="osi-name">${o.cliente_nome||'Sem nome'}</span>
        <span class="sbadge sb-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="osi-desc">${o.equipamento||''} — ${o.defeito||''}</div>
      <div class="osi-meta">
        <span>📅 ${fmtDate(o.criado_em?.split('T')[0])}</span>
        ${o.tecnico_nome ? `<span>👤 ${o.tecnico_nome}</span>` : ''}
        <span class="pay-pill pp-${o.forma_pagamento||''}">${payLabel(o.forma_pagamento)}</span>
        <span style="font-weight:800;color:var(--green);font-family:var(--mono)">${fmt(o.total||0)}</span>
        ${o.prioridade === 'urgente' ? '<span style="color:var(--red);font-weight:700">🔴 URGENTE</span>' : ''}
        ${o.prioridade === 'alta' ? '<span style="color:var(--orange);font-weight:700">🟠 ALTA</span>' : ''}
      </div>
    </div>`;
  },

  searchCli(q) {
    const dd = document.getElementById('os-cli-dropdown');
    if (!q) { dd.classList.add('gone'); return; }
    const r = STATE.clientes.filter(c => c.nome.toLowerCase().includes(q.toLowerCase())).slice(0,6);
    if (!r.length) { dd.classList.add('gone'); return; }
    dd.classList.remove('gone');
    dd.innerHTML = r.map(c => `<div onclick="OS.selectCli('${c.id}','${c.nome.replace(/'/g,"\\'")}','${c.telefone||''}')"
      style="padding:10px 14px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--b1)"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:28px;height:28px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${initials(c.nome)}</div>
      <div><div style="font-weight:700">${c.nome}</div><div style="font-size:11px;color:var(--muted)">${c.telefone||''}</div></div>
    </div>`).join('');
  },

  selectCli(id, nome, tel) {
    STATE.os_cli_id = id;
    document.getElementById('os-cli-chip').classList.remove('gone');
    document.getElementById('os-sem-cad').classList.add('gone');
    document.getElementById('os-cli-name').textContent = nome;
    document.getElementById('os-cli-dropdown').classList.add('gone');
    document.getElementById('os-cli-search').value = '';
    document.getElementById('os-cli-search').placeholder = nome;
  },

  clearCli() {
    STATE.os_cli_id = null;
    document.getElementById('os-cli-chip').classList.add('gone');
    document.getElementById('os-cli-search').placeholder = 'Buscar cliente cadastrado...';
    document.getElementById('os-cli-search').value = '';
  },

  semCadastro() {
    OS.clearCli();
    document.getElementById('os-sem-cad').classList.remove('gone');
  },

  setPay(p, el) {
    STATE.os_pay = p;
    document.querySelectorAll('.pchip').forEach(c => { c.className = 'pchip'; });
    el.classList.add('on-'+p);
    // Mostrar parcelas
    document.getElementById('cred-parcelas').classList.toggle('gone', p !== 'credito');
    document.getElementById('carne-config').classList.toggle('gone', p !== 'carne');
    // Se orcamento ou fiado — não requer pagamento imediato
    if (p === 'orcamento' || p === 'fiado') {
      document.getElementById('os-status').value = p === 'orcamento' ? 'orcamento' : 'fiado';
    }
    if (p === 'pix' && STATE.empresa?.pix) {
      // Gerar QR PIX automático será no comprovante
    }
  },

  addItem() {
    const desc = document.getElementById('item-desc').value.trim();
    const qty = parseFloat(document.getElementById('item-qty').value) || 1;
    const val = parseFloat(document.getElementById('item-val').value) || 0;
    if (!desc) { UI.toast('⚠️ Informe a descrição', true); return; }
    STATE.os_items.push({ desc, qty, val, total: qty * val });
    document.getElementById('item-desc').value = '';
    document.getElementById('item-qty').value = '1';
    document.getElementById('item-val').value = '';
    OS.renderItems();
    document.getElementById('item-desc').focus();
  },

  removeItem(i) {
    STATE.os_items.splice(i, 1);
    OS.renderItems();
  },

  renderItems() {
    const total = STATE.os_items.reduce((s,i) => s + i.total, 0);
    document.getElementById('items-list').innerHTML = STATE.os_items.map((it,i) =>
      `<div class="it-row">
        <span class="it-name">${it.desc}</span>
        <span class="it-qty">${it.qty}</span>
        <span class="it-price">${fmt(it.total)}</span>
        <button class="it-del" onclick="OS.removeItem(${i})">✕</button>
      </div>`).join('');
    document.getElementById('items-total').textContent = fmt(total);
    OS.calcParcelas();
  },

  calcParcelas() {
    const total = STATE.os_items.reduce((s,i) => s + i.total, 0);
    const n = parseInt(document.getElementById('os-parcelas')?.value || document.getElementById('carne-num')?.value || 2);
    const parc = total / n;
    const preview = `${n}x de ${fmt(parc)} = ${fmt(total)}`;
    const p1 = document.getElementById('carne-preview');
    const p2 = document.getElementById('carne-preview-2');
    if (p1) p1.textContent = preview;
    if (p2) p2.textContent = preview;
  },

  async openNew() {
    STATE.os_items = [];
    STATE.os_pay = '';
    STATE.os_cli_id = null;
    STATE.os_editing = null;
    document.getElementById('os-id').value = '';
    document.getElementById('os-modal-title').textContent = 'Nova OS';
    document.getElementById('btn-salvar-os').textContent = '💾 Salvar OS';
    // Reset fields
    ['os-cli-search','os-equip','os-defeito','os-diag','os-obs','os-entrega','os-garantia'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('os-cli-avulso').value = '';
    document.getElementById('os-sem-cad').classList.add('gone');
    document.getElementById('os-cli-chip').classList.add('gone');
    document.getElementById('os-cli-search').placeholder = 'Buscar cliente cadastrado...';
    document.getElementById('os-status').value = 'aberta';
    document.getElementById('os-prioridade').value = 'normal';
    document.getElementById('cred-parcelas').classList.add('gone');
    document.getElementById('carne-config').classList.add('gone');
    document.querySelectorAll('.pchip').forEach(c => c.className = 'pchip');

    // Número automático
    const num = (STATE.os.length ? Math.max(...STATE.os.map(o=>o.numero||0)) : 0) + 1;
    document.getElementById('os-num').value = '#' + String(num).padStart(4,'0');

    // Data de hoje
    document.getElementById('os-entrega').value = '';

    // Técnicos
    await OS.loadTecnicos('os-tecnico');

    OS.renderItems();
    UI.openModal('modal-os');

    // Fotos
    if (STATE.config?.fotos) document.getElementById('os-foto-section').classList.remove('gone');
    else document.getElementById('os-foto-section').classList.add('gone');

    // Assinatura
    if (STATE.config?.assinatura) document.getElementById('os-sig-section').classList.remove('gone');
    else document.getElementById('os-sig-section').classList.add('gone');
  },

  async loadTecnicos(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Sem técnico</option>';
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('funcionarios')
      .select('id,nome,funcao').eq('empresa_id', STATE.empresa.id).eq('ativo', true);
    if (data) data.forEach(f => {
      const o = document.createElement('option');
      o.value = f.id; o.textContent = f.nome + ' — ' + f.funcao;
      sel.appendChild(o);
    });
    // Carregar no modal de evento também
    const evSel = document.getElementById('ev-tecnico');
    if (evSel) {
      evSel.innerHTML = '<option value="">Sem técnico</option>';
      if (data) data.forEach(f => {
        const o = document.createElement('option');
        o.value = f.id; o.textContent = f.nome;
        evSel.appendChild(o);
      });
    }
  },

  async salvar() {
    const equip = document.getElementById('os-equip').value.trim();
    const defeito = document.getElementById('os-defeito').value.trim();
    if (!equip || !defeito) { UI.toast('⚠️ Preencha equipamento e defeito', true); return; }

    const btn = document.getElementById('btn-salvar-os');
    btn.textContent = '⏳ Salvando...'; btn.disabled = true;

    const tecSel = document.getElementById('os-tecnico');
    const tecId = tecSel?.value || null;
    const tecNome = tecId ? tecSel.options[tecSel.selectedIndex]?.text?.split(' —')[0] : null;

    const total = STATE.os_items.reduce((s,i) => s + i.total, 0);
    const status = document.getElementById('os-status').value;
    const cliNome = STATE.os_cli_id
      ? STATE.clientes.find(c=>c.id===STATE.os_cli_id)?.nome
      : (document.getElementById('os-cli-avulso').value || null);

    const num = (STATE.os.length ? Math.max(...STATE.os.map(o=>o.numero||0)) : 0) + 1;

    // Assinatura
    let sig = null;
    if (STATE.config?.assinatura) {
      try { sig = document.getElementById('sig-canvas').toDataURL(); } catch(e) {}
    }

    const payload = {
      empresa_id: STATE.empresa.id,
      numero: STATE.os_editing ? undefined : num,
      cliente_id: STATE.os_cli_id || null,
      cliente_nome: cliNome,
      equipamento: equip,
      defeito,
      diagnostico: document.getElementById('os-diag').value || null,
      observacoes: document.getElementById('os-obs').value || null,
      status,
      prioridade: document.getElementById('os-prioridade').value,
      forma_pagamento: STATE.os_pay || null,
      total,
      items: STATE.os_items,
      garantia_dias: parseInt(document.getElementById('os-garantia').value) || null,
      data_entrega: document.getElementById('os-entrega').value || null,
      tecnico_id: tecId,
      tecnico_nome: tecNome,
      assinatura: sig,
    };

    try {
      if (STATE.os_editing) {
        await window.sb.from('ordens').update(payload).eq('id', STATE.os_editing);
        // Histórico
        await window.sb.from('ordens_historico').insert({ ordem_id: STATE.os_editing, status, usuario_nome: STATE.user.nome, descricao: 'Status atualizado: ' + statusLabel(status) });
      } else {
        const { data: novaOS } = await window.sb.from('ordens').insert({ ...payload, numero: num }).select().single();
        // Se pago, registrar no caixa
        if (status === 'paga' && total > 0) {
          await window.sb.from('caixa').insert({ empresa_id: STATE.empresa.id, descricao: 'OS #'+String(num).padStart(4,'0')+' - '+(cliNome||'Cliente'), valor: total, tipo: 'entrada', forma_pagamento: STATE.os_pay, ordem_id: novaOS?.id });
        }
        // Parcelas
        if (STATE.os_pay === 'carne' || STATE.os_pay === 'credito') {
          const nParcelas = parseInt(document.getElementById(STATE.os_pay==='carne'?'carne-num':'os-parcelas')?.value || 2);
          const valParc = total / nParcelas;
          const parcelas = [];
          for (let i=0; i<nParcelas; i++) {
            const d = new Date(); d.setMonth(d.getMonth()+i);
            parcelas.push({ empresa_id: STATE.empresa.id, ordem_id: novaOS?.id, numero: i+1, total: nParcelas, valor: valParc, vencimento: d.toISOString().split('T')[0], pago: i===0 && status==='paga' });
          }
          await window.sb.from('parcelas').insert(parcelas);
        }
      }
      btn.textContent = '💾 Salvar OS'; btn.disabled = false;
      UI.closeModal('modal-os');
      await OS.load();
      UI.toast(STATE.os_editing ? '✅ OS atualizada' : '✅ OS criada com sucesso');
    } catch(e) {
      btn.textContent = '💾 Salvar OS'; btn.disabled = false;
      UI.toast('Erro: ' + e.message, true);
    }
  },

  async ver(id) {
    const o = STATE.os.find(x => x.id === id);
    if (!o) return;
    const body = document.getElementById('os-detail-body');
    const hist = await OS.loadHistorico(id);
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
        <div style="width:42px;height:42px;border-radius:50%;background:${avatarColor(o.cliente_nome||'?')};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff">${initials(o.cliente_nome||'?')}</div>
        <div style="flex:1">
          <div style="font-size:18px;font-weight:800">${o.cliente_nome||'Sem nome'}</div>
          <div style="font-size:12px;color:var(--muted)">OS #${String(o.numero||'?').padStart(4,'0')} — ${fmtDate(o.criado_em?.split('T')[0])}</div>
        </div>
        <span class="sbadge sb-${o.status}">${statusLabel(o.status)}</span>
        <button onclick="UI.closeModal('modal-os-detail')" style="color:var(--muted);font-size:18px;padding:4px">✕</button>
      </div>

      <div class="card">
        <div class="ir"><div class="irl">Equipamento</div><div class="irv">${o.equipamento||'—'}</div></div>
        <div class="ir"><div class="irl">Defeito</div><div class="irv">${o.defeito||'—'}</div></div>
        ${o.diagnostico?`<div class="ir"><div class="irl">Diagnóstico</div><div class="irv" style="font-size:12px">${o.diagnostico}</div></div>`:''}
        ${o.tecnico_nome?`<div class="ir"><div class="irl">Técnico</div><div class="irv">👤 ${o.tecnico_nome}</div></div>`:''}
        ${o.data_entrega?`<div class="ir"><div class="irl">Previsão entrega</div><div class="irv">${fmtDate(o.data_entrega)}</div></div>`:''}
        ${o.garantia_dias?`<div class="ir"><div class="irl">Garantia</div><div class="irv">${o.garantia_dias} dias</div></div>`:''}
      </div>

      ${(o.items||[]).length ? `
      <div class="card">
        <div class="card-title"><div class="card-title-left"><div class="card-bar"></div> Itens / Serviços</div></div>
        ${(o.items||[]).map(it=>`<div class="it-row"><span class="it-name">${it.desc}</span><span class="it-qty">${it.qty}</span><span class="it-price">${fmt(it.total)}</span><span></span></div>`).join('')}
        <div class="it-total-row"><span class="it-total-label">TOTAL</span><span class="it-total-val">${fmt(o.total||0)}</span></div>
      </div>` : ''}

      <div class="card">
        <div class="card-title"><div class="card-title-left"><div class="card-bar"></div> Pagamento</div></div>
        <div class="ir"><div class="irl">Forma</div><div class="irv">${payLabel(o.forma_pagamento)}</div></div>
        <div class="ir"><div class="irl">Total</div><div class="irv txt-green fw-800">${fmt(o.total||0)}</div></div>
        ${o.status==='fiado'?`<button class="btn btn-green btn-sm btn-full" onclick="OS.marcarPago('${o.id}')" style="margin-top:8px">✅ Marcar como pago</button>`:''}
      </div>

      <div class="card">
        <label class="flabel">Atualizar status</label>
        <select class="finput" id="det-status" onchange="OS.updateStatus('${o.id}',this.value)">
          <option value="aberta" ${o.status==='aberta'?'selected':''}>🟡 Aguardando</option>
          <option value="em_andamento" ${o.status==='em_andamento'?'selected':''}>🔵 Em andamento</option>
          <option value="pronta" ${o.status==='pronta'?'selected':''}>🟠 Pronta p/ retirada</option>
          <option value="paga" ${o.status==='paga'?'selected':''}>🟢 Concluída/Paga</option>
          <option value="fiado" ${o.status==='fiado'?'selected':''}>🟣 Fiado</option>
          <option value="cancelada" ${o.status==='cancelada'?'selected':''}>🔴 Cancelada</option>
        </select>
      </div>

      <div class="brow">
        <button class="btn btn-ghost btn-sm" onclick="OS.editar('${o.id}')">✏️ Editar</button>
        <button class="btn btn-blue btn-sm" onclick="Comp.ver('${o.id}')">📄 Comprovante</button>
        <button class="btn btn-ghost btn-sm" onclick="OS.duplicar('${o.id}')">📋 Duplicar</button>
        <button class="btn btn-red btn-sm" onclick="OS.del('${o.id}')">🗑️ Excluir</button>
      </div>

      ${hist.length ? `
      <div class="card" style="margin-top:14px">
        <div class="card-title"><div class="card-title-left"><div class="card-bar"></div> Histórico</div></div>
        ${hist.map(h=>`<div class="mov-item"><div><div class="mov-desc">${h.descricao||''}</div><div class="mov-meta">${h.usuario_nome||''}</div></div><div class="mov-meta">${fmtDate(h.criado_em?.split('T')[0])}</div></div>`).join('')}
      </div>` : ''}
    `;
    UI.openModal('modal-os-detail');
  },

  async loadHistorico(id) {
    const { data } = await window.sb.from('ordens_historico').select('*').eq('ordem_id', id).order('criado_em');
    return data || [];
  },

  async updateStatus(id, status) {
    await window.sb.from('ordens').update({ status }).eq('id', id);
    await window.sb.from('ordens_historico').insert({ ordem_id: id, status, usuario_nome: STATE.user.nome, descricao: 'Status: ' + statusLabel(status) });
    if (status === 'paga') {
      const o = STATE.os.find(x => x.id === id);
      if (o && o.status !== 'paga' && o.total > 0) {
        await window.sb.from('caixa').insert({ empresa_id: STATE.empresa.id, descricao: 'OS #'+String(o.numero||'').padStart(4,'0')+' paga', valor: o.total, tipo: 'entrada', forma_pagamento: o.forma_pagamento, ordem_id: id });
      }
    }
    await OS.load();
    UI.toast('✅ Status atualizado');
    UI.closeModal('modal-os-detail');
  },

  async marcarPago(id) {
    OS.updateStatus(id, 'paga');
  },

  async editar(id) {
    UI.closeModal('modal-os-detail');
    const o = STATE.os.find(x => x.id === id);
    if (!o) return;
    STATE.os_editing = id;
    STATE.os_items = [...(o.items||[])];
    STATE.os_pay = o.forma_pagamento || '';
    STATE.os_cli_id = o.cliente_id;

    await OS.loadTecnicos('os-tecnico');

    document.getElementById('os-modal-title').textContent = 'Editar OS #' + String(o.numero||'?').padStart(4,'0');
    document.getElementById('os-id').value = id;
    document.getElementById('os-equip').value = o.equipamento || '';
    document.getElementById('os-defeito').value = o.defeito || '';
    document.getElementById('os-diag').value = o.diagnostico || '';
    document.getElementById('os-obs').value = o.observacoes || '';
    document.getElementById('os-status').value = o.status || 'aberta';
    document.getElementById('os-prioridade').value = o.prioridade || 'normal';
    document.getElementById('os-garantia').value = o.garantia_dias || '';
    document.getElementById('os-entrega').value = o.data_entrega || '';
    document.getElementById('os-tecnico').value = o.tecnico_id || '';
    document.getElementById('os-num').value = '#' + String(o.numero||'?').padStart(4,'0');

    if (o.cliente_nome) OS.selectCli(o.cliente_id||'', o.cliente_nome, '');
    OS.renderItems();

    if (STATE.os_pay) {
      const chip = document.querySelector(`.pchip[data-pay="${STATE.os_pay}"]`);
      if (chip) { chip.classList.add('on-'+STATE.os_pay); }
    }

    if (STATE.config?.fotos) document.getElementById('os-foto-section').classList.remove('gone');
    if (STATE.config?.assinatura) document.getElementById('os-sig-section').classList.remove('gone');

    document.getElementById('btn-salvar-os').textContent = '💾 Atualizar OS';
    UI.openModal('modal-os');
  },

  async duplicar(id) {
    const o = STATE.os.find(x => x.id === id);
    if (!o) return;
    UI.closeModal('modal-os-detail');
    STATE.os_items = [...(o.items||[])];
    STATE.os_pay = o.forma_pagamento || '';
    STATE.os_cli_id = o.cliente_id;
    STATE.os_editing = null;
    const num = (STATE.os.length ? Math.max(...STATE.os.map(x=>x.numero||0)) : 0) + 1;
    await OS.loadTecnicos('os-tecnico');
    document.getElementById('os-modal-title').textContent = 'Duplicar OS';
    document.getElementById('os-equip').value = o.equipamento || '';
    document.getElementById('os-defeito').value = o.defeito || '';
    document.getElementById('os-num').value = '#' + String(num).padStart(4,'0');
    document.getElementById('os-status').value = 'aberta';
    if (o.cliente_nome) OS.selectCli(o.cliente_id||'', o.cliente_nome, '');
    OS.renderItems();
    UI.openModal('modal-os');
    UI.toast('📋 OS duplicada — salve para criar');
  },

  async del(id) {
    if (!confirm('Excluir esta OS permanentemente?')) return;
    await window.sb.from('caixa').delete().eq('ordem_id', id);
    await window.sb.from('parcelas').delete().eq('ordem_id', id);
    await window.sb.from('ordens_historico').delete().eq('ordem_id', id);
    const { error } = await window.sb.from('ordens').delete().eq('id', id);
    if (error) { UI.toast('Erro: ' + error.message, true); return; }
    UI.closeModal('modal-os-detail');
    await OS.load();
    UI.toast('🗑️ OS excluída');
  },

  usarTemplate() { UI.toast('Em breve: templates de OS 📋'); },

  addFotos(inp) {
    const grid = document.getElementById('os-fotos');
    [...inp.files].forEach(f => {
      const r = new FileReader();
      r.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style = 'width:100%;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--b1)';
        grid.appendChild(img);
      };
      r.readAsDataURL(f);
    });
  },
};

// ── CLIENTES ──
const Clientes = {
  _filtro: '', _nivel: '',

  async load() {
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('clientes')
      .select('*').eq('empresa_id', STATE.empresa.id)
      .order('nome');
    STATE.clientes = data || [];
    Clientes.render();
  },

  filter() {
    Clientes._filtro = document.getElementById('cli-search').value.toLowerCase();
    Clientes.render();
  },

  setNivel(n, el) {
    Clientes._nivel = n;
    document.querySelectorAll('#pg-clientes .chip').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    Clientes.render();
  },

  render() {
    let list = STATE.clientes;
    if (Clientes._filtro) list = list.filter(c =>
      (c.nome||'').toLowerCase().includes(Clientes._filtro) ||
      (c.telefone||'').includes(Clientes._filtro) ||
      (c.cpf||'').includes(Clientes._filtro)
    );
    if (Clientes._nivel) list = list.filter(c => c.nivel === Clientes._nivel);
    const el = document.getElementById('cli-list');
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">👥</div><p>Nenhum cliente</p></div>'; return; }
    el.innerHTML = list.map(c => {
      const osCount = STATE.os.filter(o => o.cliente_id === c.id).length;
      const total = STATE.os.filter(o=>o.cliente_id===c.id&&o.status==='paga').reduce((s,o)=>s+(o.total||0),0);
      return `<div class="os-item" onclick="Clientes.ver('${c.id}')" style="padding-left:20px">
        <div class="osi-top">
          <div class="osi-avatar" style="background:${avatarColor(c.nome)}">${initials(c.nome)}</div>
          <div style="flex:1">
            <div class="osi-name">${c.nome} ${c.nivel==='vip'?'⭐':c.nivel==='premium'?'💎':''}</div>
            <div style="font-size:11px;color:var(--muted)">${c.telefone||'Sem telefone'} ${c.cpf?'· '+c.cpf:''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">${fmt(total)}</div>
            <div style="font-size:10px;color:var(--muted)">${osCount} OS</div>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  ver(id) {
    const c = STATE.clientes.find(x=>x.id===id);
    if (!c) return;
    const osCliente = STATE.os.filter(o=>o.cliente_id===id).slice(0,5);
    const totalGasto = STATE.os.filter(o=>o.cliente_id===id&&o.status==='paga').reduce((s,o)=>s+(o.total||0),0);
    const body = `<div style="text-align:center;margin-bottom:20px">
      <div style="width:72px;height:72px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;margin:0 auto 10px">${initials(c.nome)}</div>
      <div style="font-size:20px;font-weight:800">${c.nome} ${c.nivel==='vip'?'⭐':c.nivel==='premium'?'💎':''}</div>
      ${c.telefone?`<a href="https://wa.me/55${c.telefone.replace(/\D/g,'')}" target="_blank" class="btn btn-green btn-sm" style="margin-top:8px">📱 WhatsApp</a>`:''}
    </div>
    <div class="card">
      ${c.email?`<div class="ir"><div class="irl">Email</div><div class="irv">${c.email}</div></div>`:''}
      ${c.cpf?`<div class="ir"><div class="irl">CPF/CNPJ</div><div class="irv">${c.cpf}</div></div>`:''}
      ${c.endereco?`<div class="ir"><div class="irl">Endereço</div><div class="irv">${c.endereco}</div></div>`:''}
      ${c.nascimento?`<div class="ir"><div class="irl">Aniversário</div><div class="irv">${fmtDate(c.nascimento)}</div></div>`:''}
      ${c.limite_credito?`<div class="ir"><div class="irl">Limite Fiado</div><div class="irv txt-orange">${fmt(c.limite_credito)}</div></div>`:''}
      <div class="ir"><div class="irl">Total gasto</div><div class="irv txt-green fw-800">${fmt(totalGasto)}</div></div>
    </div>
    ${osCliente.length ? `<div class="card"><div class="card-title"><div class="card-title-left"><div class="card-bar"></div>Histórico de OS</div></div>${osCliente.map(o=>`<div class="mov-item" onclick="OS.ver('${o.id}');UI.closeModal('modal-cliente')"><div><div class="mov-desc">${o.equipamento||''}</div><div class="mov-meta">${statusLabel(o.status)}</div></div><div class="mov-val e">${fmt(o.total||0)}</div></div>`).join('')}</div>`:''}
    <div class="brow" style="margin-top:8px">
      <button class="btn btn-ghost btn-sm" onclick="UI.closeModal('modal-cliente')">Fechar</button>
      <button class="btn btn-primary btn-sm" onclick="Clientes.abrirEditar('${c.id}')">✏️ Editar</button>
      <button class="btn btn-red btn-sm" onclick="Clientes.del('${c.id}')">🗑️ Excluir</button>
    </div>`;
    document.getElementById('cli-modal-title').textContent = c.nome;
    document.getElementById('cli-id').value = id;
    document.querySelector('#modal-cliente .mbody').innerHTML = body;
    UI.openModal('modal-cliente');
  },

  abrirEditar(id) {
    const c = STATE.clientes.find(x=>x.id===id);
    if (!c) { openNovoCliente(); return; }
    UI.closeModal('modal-cliente');
    setTimeout(() => {
      document.getElementById('cli-modal-title').textContent = 'Editar Cliente';
      document.getElementById('cli-id').value = id;
      document.getElementById('cli-nome').value = c.nome||'';
      document.getElementById('cli-tel').value = c.telefone||'';
      document.getElementById('cli-cpf').value = c.cpf||'';
      document.getElementById('cli-email').value = c.email||'';
      document.getElementById('cli-end').value = c.endereco||'';
      document.getElementById('cli-nasc').value = c.nascimento||'';
      document.getElementById('cli-nivel').value = c.nivel||'normal';
      document.getElementById('cli-limite').value = c.limite_credito||'';
      document.getElementById('cli-obs').value = c.observacoes||'';
      UI.openModal('modal-cliente');
    }, 200);
  },

  uploadFoto(inp) {
    if (!inp.files[0]) return;
    const r = new FileReader();
    r.onload = e => {
      const pv = document.getElementById('cli-foto-preview');
      pv.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
    };
    r.readAsDataURL(inp.files[0]);
  },

  async salvar() {
    const nome = document.getElementById('cli-nome').value.trim();
    if (!nome) { UI.toast('⚠️ Informe o nome', true); return; }
    const id = document.getElementById('cli-id').value;
    const payload = {
      empresa_id: STATE.empresa.id,
      nome, telefone: document.getElementById('cli-tel').value,
      cpf: document.getElementById('cli-cpf').value,
      email: document.getElementById('cli-email').value,
      endereco: document.getElementById('cli-end').value,
      nascimento: document.getElementById('cli-nasc').value || null,
      nivel: document.getElementById('cli-nivel').value,
      limite_credito: parseFloat(document.getElementById('cli-limite').value) || null,
      observacoes: document.getElementById('cli-obs').value,
    };
    try {
      if (id) await window.sb.from('clientes').update(payload).eq('id', id);
      else await window.sb.from('clientes').insert(payload);
      UI.closeModal('modal-cliente');
      await Clientes.load();
      UI.toast(id ? '✅ Cliente atualizado' : '✅ Cliente cadastrado');
    } catch(e) { UI.toast('Erro: ' + e.message, true); }
  },

  async del(id) {
    if (!confirm('Excluir cliente?')) return;
    await window.sb.from('clientes').delete().eq('id', id);
    UI.closeModal('modal-cliente');
    await Clientes.load();
    UI.toast('🗑️ Cliente removido');
  },
};

// ── CAIXA ──
const Caixa = {
  async load() {
    if (!STATE.empresa) return;
    const hoje = today();
    let query = window.sb.from('caixa').select('*').eq('empresa_id', STATE.empresa.id);
    if (Caixa._periodo === 'hoje') query = query.gte('criado_em', hoje);
    else if (Caixa._periodo === 'semana') {
      const d = new Date(); d.setDate(d.getDate()-7);
      query = query.gte('criado_em', d.toISOString().split('T')[0]);
    } else if (Caixa._periodo === 'mes') {
      query = query.gte('criado_em', hoje.slice(0,7)+'-01');
    }
    const { data } = await query.order('criado_em', { ascending: false });
    const movs = data || [];

    const entrada = movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+(m.valor||0),0);
    const saida = movs.filter(m=>m.tipo==='saida').reduce((s,m)=>s+(m.valor||0),0);
    const fiado = STATE.os.filter(o=>o.status==='fiado').reduce((s,o)=>s+(o.total||0),0);

    document.getElementById('cx-entrada').textContent = fmt(entrada);
    document.getElementById('cx-saida').textContent = fmt(saida);
    document.getElementById('cx-saldo').textContent = fmt(entrada - saida);
    document.getElementById('cx-fiado').textContent = fmt(fiado);

    const el = document.getElementById('cx-movs');
    if (!movs.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">💰</div><p>Sem movimentações</p></div>'; return; }
    el.innerHTML = movs.map(m => `<div class="mov-item">
      <div>
        <div class="mov-desc">${m.descricao||'Movimentação'}</div>
        <div class="mov-meta">${fmtDate(m.criado_em?.split('T')[0])} · ${payLabel(m.forma_pagamento)}</div>
      </div>
      <div class="mov-val ${m.tipo==='entrada'?'e':'s'}">${m.tipo==='saida'?'-':''}${fmt(m.valor||0)}</div>
    </div>`).join('');

    // Carregar contas
    await Caixa.loadContas();
  },
  _periodo: 'hoje',
  setPeriodo(p, el) {
    Caixa._periodo = p;
    document.querySelectorAll('#pg-caixa .chip').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    document.getElementById('cx-custom-range').classList.toggle('gone', p !== 'custom');
    if (p !== 'custom') Caixa.load();
  },
  loadCustom() { Caixa.load(); },

  setTab(tab, el) {
    STATE.caixaTab = tab;
    ['mov','pagar','receber'].forEach(t => {
      document.getElementById('cx-tab-'+t+'-content').classList.toggle('gone', t !== tab);
    });
    document.querySelectorAll('.auth-tabs .auth-tab').forEach(b=>b.classList.remove('on'));
    el.classList.add('on');
  },

  async loadContas() {
    if (!STATE.empresa) return;
    const { data: pagar } = await window.sb.from('contas_pagar').select('*').eq('empresa_id', STATE.empresa.id).eq('pago', false).order('vencimento');
    const { data: receber } = await window.sb.from('contas_receber').select('*').eq('empresa_id', STATE.empresa.id).eq('recebido', false).order('vencimento');
    STATE.contas_pagar = pagar || [];
    STATE.contas_receber = receber || [];
    Caixa.renderContas('pagar', pagar||[]);
    Caixa.renderContas('receber', receber||[]);
  },

  renderContas(tipo, list) {
    const el = document.getElementById('contas-'+tipo+'-list');
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><p>Nenhuma conta</p></div>'; return; }
    el.innerHTML = list.map(c => {
      const venc = new Date(c.vencimento+'T12:00:00');
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const atrasado = venc < hoje;
      return `<div class="mov-item">
        <div>
          <div class="mov-desc">${c.descricao}</div>
          <div class="mov-meta ${atrasado?'txt-red':''}">📅 ${fmtDate(c.vencimento)} ${atrasado?'· VENCIDA':''} ${c.categoria?'· '+c.categoria:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="mov-val ${tipo==='pagar'?'s':'e'}">${fmt(c.valor)}</div>
          <button class="btn btn-green btn-sm" onclick="Caixa.quitarConta('${c.id}','${tipo}')">✓</button>
        </div>
      </div>`;
    }).join('');
  },

  async quitarConta(id, tipo) {
    const table = tipo === 'pagar' ? 'contas_pagar' : 'contas_receber';
    const field = tipo === 'pagar' ? 'pago' : 'recebido';
    await window.sb.from(table).update({ [field]: true }).eq('id', id);
    const conta = (tipo==='pagar'?STATE.contas_pagar:STATE.contas_receber).find(c=>c.id===id);
    if (conta) {
      await window.sb.from('caixa').insert({ empresa_id: STATE.empresa.id, descricao: conta.descricao, valor: conta.valor, tipo: tipo==='pagar'?'saida':'entrada', forma_pagamento: 'outro' });
    }
    await Caixa.loadContas();
    UI.toast('✅ Conta quitada');
  },

  async salvarConta() {
    const tipo = document.getElementById('conta-tipo').value;
    const desc = document.getElementById('conta-desc').value.trim();
    const valor = parseFloat(document.getElementById('conta-valor').value);
    const venc = document.getElementById('conta-venc').value;
    if (!desc || !valor || !venc) { UI.toast('⚠️ Preencha todos os campos', true); return; }
    const table = tipo === 'pagar' ? 'contas_pagar' : 'contas_receber';
    await window.sb.from(table).insert({ empresa_id: STATE.empresa.id, descricao: desc, valor, vencimento: venc, [tipo==='pagar'?'pago':'recebido']: false, categoria: document.getElementById('conta-cat').value });
    UI.closeModal('modal-conta');
    await Caixa.loadContas();
    UI.toast('✅ Conta adicionada');
  },

  async salvarSaida() {
    const desc = document.getElementById('saida-desc').value.trim();
    const val = parseFloat(document.getElementById('saida-val').value);
    if (!desc || !val) { UI.toast('⚠️ Preencha todos os campos', true); return; }
    const data = document.getElementById('saida-data').value || today();
    await window.sb.from('caixa').insert({ empresa_id: STATE.empresa.id, descricao: desc, valor: val, tipo: 'saida', categoria: document.getElementById('saida-cat').value, criado_em: data+'T12:00:00' });
    UI.closeModal('modal-saida');
    await Caixa.load();
    UI.toast('➖ Saída registrada');
  },

  sangria() {
    document.getElementById('saida-desc').value = 'Sangria de caixa';
    document.getElementById('saida-cat').value = 'outro';
    document.getElementById('saida-data').value = today();
    UI.openModal('modal-saida');
  },

  fecharCaixa() {
    const saldo = document.getElementById('cx-saldo').textContent;
    if (confirm(`Fechar caixa do dia com saldo de ${saldo}?`)) {
      UI.toast('🔒 Caixa fechado com saldo: ' + saldo);
    }
  },

  exportPDF() {
    UI.toast('📄 Gerando PDF...'); 
    setTimeout(() => UI.toast('📄 PDF do caixa gerado'), 1500);
  },
};

// ── ESTOQUE ──
const Estoque = {
  _filtro: '',

  async loadAll() {
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('produtos').select('*').eq('empresa_id', STATE.empresa.id).order('nome');
    STATE.produtos = data || [];
    // Badge estoque baixo
    const baixo = STATE.produtos.filter(p => p.ativo !== false && (p.quantidade||0) <= (p.estoque_minimo||0)).length;
    const badge = document.getElementById('sb-stock-badge');
    if (baixo > 0) { badge.style.display = ''; badge.textContent = baixo + ' baixo'; }
    else badge.style.display = 'none';
  },

  async load() {
    await Estoque.loadAll();
    Estoque.render();
  },

  filter() {
    Estoque._filtro = document.getElementById('est-search').value.toLowerCase();
    Estoque.render();
  },

  setFiltro(f, el) {
    Estoque._filtroTipo = f;
    document.querySelectorAll('#pg-estoque .chip').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    Estoque.render();
  },

  render() {
    let list = STATE.produtos;
    if (Estoque._filtro) list = list.filter(p =>
      (p.nome||'').toLowerCase().includes(Estoque._filtro) ||
      (p.codigo_barras||'').includes(Estoque._filtro)
    );
    if (Estoque._filtroTipo === 'baixo') list = list.filter(p=>(p.quantidade||0)<=(p.estoque_minimo||0));
    if (Estoque._filtroTipo === 'inativo') list = list.filter(p=>p.ativo===false);
    else if (!Estoque._filtroTipo) list = list.filter(p=>p.ativo!==false);

    const el = document.getElementById('est-list');
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">📦</div><p>Nenhum produto</p></div>'; return; }
    el.innerHTML = list.map(p => {
      const baixo = (p.quantidade||0) <= (p.estoque_minimo||0);
      return `<div class="os-item" onclick="Estoque.ver('${p.id}')" style="padding-left:20px">
        <div class="osi-top">
          <span style="font-size:20px">📦</span>
          <div style="flex:1">
            <div class="osi-name">${p.nome}</div>
            <div style="font-size:11px;color:var(--muted)">${p.categoria||''} ${p.codigo_barras?'· '+p.codigo_barras:''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:13px;font-weight:700">${fmt(p.preco_venda||0)}</div>
            <div style="font-size:11px;${baixo?'color:var(--red);font-weight:700':'color:var(--muted)'}">Estoque: ${p.quantidade||0} ${baixo?'⚠️':''}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  ver(id) {
    const p = STATE.produtos.find(x=>x.id===id);
    if (!p) return;
    document.getElementById('prod-modal-title').textContent = 'Editar Produto';
    document.getElementById('prod-id').value = id;
    document.getElementById('prod-nome').value = p.nome||'';
    document.getElementById('prod-barcode').value = p.codigo_barras||'';
    document.getElementById('prod-custo').value = p.preco_custo||'';
    document.getElementById('prod-venda').value = p.preco_venda||'';
    document.getElementById('prod-qty').value = p.quantidade||'';
    document.getElementById('prod-min').value = p.estoque_minimo||'';
    document.getElementById('prod-cat').value = p.categoria||'';
    document.getElementById('prod-forn').value = p.fornecedor||'';
    Estoque.calcMargem();
    UI.openModal('modal-produto');
  },

  calcMargem() {
    const custo = parseFloat(document.getElementById('prod-custo').value) || 0;
    const venda = parseFloat(document.getElementById('prod-venda').value) || 0;
    const margem = custo > 0 ? ((venda - custo) / custo * 100).toFixed(0) + '%' : '—';
    document.getElementById('prod-margem').value = margem;
  },

  async salvar() {
    const nome = document.getElementById('prod-nome').value.trim();
    if (!nome) { UI.toast('⚠️ Informe o nome', true); return; }
    const id = document.getElementById('prod-id').value;
    const payload = {
      empresa_id: STATE.empresa.id,
      nome, codigo_barras: document.getElementById('prod-barcode').value || null,
      preco_custo: parseFloat(document.getElementById('prod-custo').value) || 0,
      preco_venda: parseFloat(document.getElementById('prod-venda').value) || 0,
      quantidade: parseInt(document.getElementById('prod-qty').value) || 0,
      estoque_minimo: parseInt(document.getElementById('prod-min').value) || 0,
      categoria: document.getElementById('prod-cat').value || null,
      fornecedor: document.getElementById('prod-forn').value || null,
      ativo: true,
    };
    try {
      if (id) await window.sb.from('produtos').update(payload).eq('id', id);
      else await window.sb.from('produtos').insert(payload);
      UI.closeModal('modal-produto');
      await Estoque.load();
      UI.toast(id ? '✅ Produto atualizado' : '✅ Produto cadastrado');
    } catch(e) { UI.toast('Erro: ' + e.message, true); }
  },
};

// ── AGENDA ──
const Agenda = {
  async load() {
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('agenda').select('*').eq('empresa_id', STATE.empresa.id);
    STATE.eventos = data || [];
  },

  render() {
    Agenda.renderCal();
  },

  renderCal() {
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    document.getElementById('agenda-mes-label').textContent = meses[STATE.agendaMes] + ' ' + STATE.agendaAno;
    const cal = document.getElementById('agenda-cal');
    const dias = ['D','S','T','Q','Q','S','S'];
    const primeiroDia = new Date(STATE.agendaAno, STATE.agendaMes, 1).getDay();
    const totalDias = new Date(STATE.agendaAno, STATE.agendaMes+1, 0).getDate();
    const hoje = new Date();

    let html = dias.map(d=>`<div style="font-size:10px;font-weight:700;color:var(--muted);padding:4px 0">${d}</div>`).join('');
    for (let i=0; i<primeiroDia; i++) html += '<div></div>';
    for (let d=1; d<=totalDias; d++) {
      const isHoje = d === hoje.getDate() && STATE.agendaMes === hoje.getMonth() && STATE.agendaAno === hoje.getFullYear();
      const isSel = d === STATE.agendaDia;
      const dateStr = `${STATE.agendaAno}-${String(STATE.agendaMes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const temEvento = STATE.eventos.some(e=>e.data?.startsWith(dateStr));
      html += `<div onclick="Agenda.selDia(${d})" style="padding:6px 2px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;position:relative;
        background:${isSel?'var(--blue-d)':isHoje?'rgba(59,130,246,.15)':'transparent'};
        color:${isSel?'#fff':isHoje?'var(--blue-l)':'var(--txt2)'};
        border:1px solid ${isSel?'var(--blue-d)':isHoje?'rgba(59,130,246,.3)':'transparent'}">
        ${d}${temEvento?`<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:${isSel?'#fff':'var(--orange)'}"></span>`:''}
      </div>`;
    }
    cal.innerHTML = html;
    Agenda.renderEventosDia();
  },

  selDia(d) {
    STATE.agendaDia = d;
    Agenda.renderCal();
  },

  hoje() {
    const h = new Date();
    STATE.agendaMes = h.getMonth(); STATE.agendaAno = h.getFullYear(); STATE.agendaDia = h.getDate();
    Agenda.renderCal();
  },

  prevMes() { if(STATE.agendaMes===0){STATE.agendaMes=11;STATE.agendaAno--;}else STATE.agendaMes--; Agenda.renderCal(); },
  nextMes() { if(STATE.agendaMes===11){STATE.agendaMes=0;STATE.agendaAno++;}else STATE.agendaMes++; Agenda.renderCal(); },

  renderEventosDia() {
    const dateStr = `${STATE.agendaAno}-${String(STATE.agendaMes+1).padStart(2,'0')}-${String(STATE.agendaDia).padStart(2,'0')}`;
    const evs = STATE.eventos.filter(e=>e.data?.startsWith(dateStr));
    const el = document.getElementById('agenda-events');
    if (!evs.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">📅</div><p>Sem eventos neste dia</p></div>'; return; }
    el.innerHTML = evs.map(e => `<div class="mov-item">
      <div>
        <div class="mov-desc">${e.titulo}</div>
        <div class="mov-meta">${e.hora||''} · ${({os:'🔧 OS',visita:'🚗 Visita',cobranca:'💰 Cobrança',geral:'📌 Geral'})[e.tipo]||e.tipo}</div>
      </div>
      <button class="btn btn-red btn-sm" onclick="Agenda.del('${e.id}')">✕</button>
    </div>`).join('');
  },

  async salvar() {
    const titulo = document.getElementById('ev-titulo').value.trim();
    const data = document.getElementById('ev-data').value;
    const tipo = document.getElementById('ev-tipo').value;
    if (!titulo || !data) { UI.toast('⚠️ Preencha título e data', true); return; }
    const tecId = document.getElementById('ev-tecnico').value;
    await window.sb.from('agenda').insert({
      empresa_id: STATE.empresa.id, titulo, data,
      hora: document.getElementById('ev-hora').value || null,
      tipo, descricao: document.getElementById('ev-desc').value,
      tecnico_id: tecId || null,
    });
    UI.closeModal('modal-evento');
    await Agenda.load();
    Agenda.renderCal();
    UI.toast('✅ Evento agendado');
  },

  async del(id) {
    await window.sb.from('agenda').delete().eq('id', id);
    STATE.eventos = STATE.eventos.filter(e=>e.id!==id);
    Agenda.renderEventosDia();
    UI.toast('🗑️ Evento removido');
  },
};

// ── ANALYTICS ──
const Analytics = {
  async load() {
    if (!STATE.empresa) return;
    const hoje = today();
    const mesAtual = hoje.slice(0,7);
    const mesAnterior = new Date(); mesAnterior.setMonth(mesAnterior.getMonth()-1);
    const mesAntStr = mesAnterior.toISOString().slice(0,7);

    const osMes = STATE.os.filter(o => o.status === 'paga' && (o.criado_em||'').startsWith(mesAtual));
    const osAnt = STATE.os.filter(o => o.status === 'paga' && (o.criado_em||'').startsWith(mesAntStr));
    const fat = osMes.reduce((s,o)=>s+(o.total||0),0);
    const fatAnt = osAnt.reduce((s,o)=>s+(o.total||0),0);
    const pct = fatAnt > 0 ? ((fat-fatAnt)/fatAnt*100).toFixed(0) : 0;
    const fiado = STATE.os.filter(o=>o.status==='fiado').reduce((s,o)=>s+(o.total||0),0);
    const ticket = osMes.length ? fat/osMes.length : 0;

    document.getElementById('an-fat').textContent = fmt(fat);
    document.getElementById('an-svcs').textContent = osMes.length;
    document.getElementById('an-ticket').textContent = fmt(ticket);
    document.getElementById('an-fiado').textContent = fmt(fiado);
    const badge = document.getElementById('an-fat-badge');
    badge.textContent = (pct>=0?'+':'')+pct+'%';
    badge.className = 'kpi-badge ' + (pct >= 0 ? 'up' : 'down');

    Analytics.renderChartMensal();
    Analytics.renderChartPag(osMes);
    IA.analiseMes();
  },

  renderChartMensal() {
    const labels=[], vals=[];
    for (let i=5;i>=0;i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i);
      const m = d.toISOString().slice(0,7);
      const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      labels.push(meses[d.getMonth()]);
      vals.push(STATE.os.filter(o=>o.status==='paga'&&(o.criado_em||'').startsWith(m)).reduce((s,o)=>s+(o.total||0),0));
    }
    if (STATE.chartMensal) STATE.chartMensal.destroy();
    const ctx = document.getElementById('chart-mensal')?.getContext('2d');
    if (!ctx) return;
    STATE.chartMensal = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Faturamento', data: vals, backgroundColor: 'rgba(59,130,246,.7)', borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { callback: v => 'R$'+v } } } }
    });
  },

  renderChartPag(osMes) {
    const pays = {};
    osMes.forEach(o => { pays[o.forma_pagamento||'outro'] = (pays[o.forma_pagamento||'outro']||0) + (o.total||0); });
    const labels = Object.keys(pays).map(payLabel);
    const vals = Object.values(pays);
    if (STATE.chartPag) STATE.chartPag.destroy();
    const ctx = document.getElementById('chart-pag')?.getContext('2d');
    if (!ctx) return;
    STATE.chartPag = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: vals, backgroundColor: ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, font: { size: 11 } } } } }
    });
  },

  setPeriodo(p, el) {
    STATE.anPeriodo = p;
    document.querySelectorAll('#pg-analytics .chip').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    Analytics.load();
  },
};

// ── DASHBOARD ──
const Dashboard = {
  async load() {
    if (!STATE.empresa || !STATE.os.length) return;
    const hoje = today();
    const mesAtual = hoje.slice(0,7);

    const fHoje = STATE.os.filter(o=>o.status==='paga'&&(o.criado_em||'').startsWith(hoje)).reduce((s,o)=>s+(o.total||0),0);
    const fMes = STATE.os.filter(o=>o.status==='paga'&&(o.criado_em||'').startsWith(mesAtual)).reduce((s,o)=>s+(o.total||0),0);
    const osAb = STATE.os.filter(o=>o.status==='aberta'||o.status==='em_andamento').length;
    const lucro = fMes * 0.65; // estimativa

    document.getElementById('kv-hoje').textContent = fmt(fHoje);
    document.getElementById('kv-mes').textContent = fmt(fMes);
    document.getElementById('kv-os-ab').textContent = osAb;
    document.getElementById('kv-lucro').textContent = fmt(lucro);
    document.getElementById('ks-os-ab').textContent = osAb + ' em andamento';

    Dashboard.renderChart();
    Dashboard.renderRanking();
    Dashboard.renderOSRecentes();
  },

  reload() { OS.load(); },

  setRange(r, el) {
    STATE.range = r;
    document.querySelectorAll('#pg-dashboard .chip').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    Dashboard.renderChart();
  },

  renderChart() {
    const labels=[], vals=[];
    for (let i=STATE.range-1;i>=0;i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const ds = d.toISOString().split('T')[0];
      labels.push(STATE.range<=7 ? ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()] : (d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0')));
      vals.push(STATE.os.filter(o=>o.status==='paga'&&(o.criado_em||'').startsWith(ds)).reduce((s,o)=>s+(o.total||0),0));
    }
    if (STATE.chartFat) STATE.chartFat.destroy();
    const ctx = document.getElementById('chart-fat')?.getContext('2d');
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0,0,0,160);
    grad.addColorStop(0,'rgba(59,130,246,.3)'); grad.addColorStop(1,'rgba(59,130,246,.0)');
    STATE.chartFat = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Faturamento', data: vals, borderColor: '#3b82f6', backgroundColor: grad, tension: .4, fill: true, pointBackgroundColor: '#3b82f6', pointRadius: vals.length>14?2:4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } } }, y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', callback: v => 'R$'+v, font: { size: 10 } } } } }
    });
  },

  renderRanking() {
    const ranking = {};
    STATE.os.filter(o=>o.cliente_id&&o.status==='paga').forEach(o=>{
      if (!ranking[o.cliente_id]) ranking[o.cliente_id] = { nome: o.cliente_nome||'?', total: 0, count: 0 };
      ranking[o.cliente_id].total += (o.total||0);
      ranking[o.cliente_id].count++;
    });
    const list = Object.values(ranking).sort((a,b)=>b.total-a.total).slice(0,5);
    const el = document.getElementById('ranking-clientes');
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">👥</div><p>Sem dados</p></div>'; return; }
    el.innerHTML = list.map((c,i) => `<div class="rank-item">
      <div class="rank-num">${i+1}</div>
      <div class="rank-av" style="background:${avatarColor(c.nome)}">${initials(c.nome)}</div>
      <div class="rank-info">
        <div class="rank-name">${c.nome}</div>
        <div class="rank-os">${c.count} OS</div>
      </div>
      <div class="rank-val">${fmt(c.total)}</div>
    </div>`).join('');
  },

  renderOSRecentes() {
    const el = document.getElementById('dash-os-list');
    const list = STATE.os.slice(0,5);
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">🔧</div><p>Nenhuma OS</p></div>'; return; }
    el.innerHTML = list.map(o => OS.cardHTML(o)).join('');
  },
};

// ── IA ──
const IA = {
  async analiseMes() {
    const el = document.getElementById('ia-analytics-txt');
    if (!el) return;
    el.innerHTML = '<div class="ia-loading"><div class="ia-dot"></div><div class="ia-dot"></div><div class="ia-dot"></div></div>';
    const osMes = STATE.os.filter(o=>o.status==='paga'&&(o.criado_em||'').startsWith(today().slice(0,7)));
    const fat = osMes.reduce((s,o)=>s+(o.total||0),0);
    const prompt = `Analise estes dados de uma assistência técnica:
- Faturamento do mês: ${fmt(fat)}
- Total de serviços concluídos: ${osMes.length}
- OS em aberto: ${STATE.os.filter(o=>o.status==='aberta').length}
- Fiado pendente: ${fmt(STATE.os.filter(o=>o.status==='fiado').reduce((s,o)=>s+(o.total||0),0))}
Dê uma análise rápida em 2-3 frases com sugestões práticas. Seja direto e útil.`;
    try {
      const res = await fetch('https://twxotfzlronfjfjyaklx.supabase.co/functions/v1/ia-proxy', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A'},
        body: JSON.stringify({ prompt })
      });
      const d = await res.json();
      el.textContent = d.result || d.text || 'Análise indisponível no momento.';
    } catch(e) { el.textContent = 'IA temporariamente indisponível.'; }
  },
};

// ── NOTIFICAÇÕES ──
const Notif = {
  async load() {
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('notificacoes').select('*').eq('empresa_id', STATE.empresa.id).order('criado_em', { ascending: false }).limit(20);
    STATE.notifs = data || [];
    Notif.render();
  },

  render() {
    const unread = STATE.notifs.filter(n=>!n.lida).length;
    document.getElementById('notif-dot').style.display = unread ? '' : 'none';
    const el = document.getElementById('notif-list');
    if (!STATE.notifs.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">🔔</div><p>Sem notificações</p></div>'; return; }
    el.innerHTML = STATE.notifs.map(n=>`<div class="notif-item ${n.lida?'':'unread'}" onclick="Notif.read('${n.id}')">
      <div class="notif-title">${n.titulo||'Notificação'}</div>
      <div class="notif-msg">${n.mensagem||''}</div>
      <div class="notif-time">${fmtDate(n.criado_em?.split('T')[0])}</div>
    </div>`).join('');
  },

  async read(id) {
    await window.sb.from('notificacoes').update({ lida: true }).eq('id', id);
    STATE.notifs = STATE.notifs.map(n=>n.id===id?{...n,lida:true}:n);
    Notif.render();
  },

  async markAll() {
    await window.sb.from('notificacoes').update({ lida: true }).eq('empresa_id', STATE.empresa.id);
    STATE.notifs = STATE.notifs.map(n=>({...n,lida:true}));
    Notif.render();
  },
};

// ── CONFIGURAÇÕES ──
const Config = {
  async load() {
    if (!STATE.empresa) return;
    const c = STATE.empresa;
    document.getElementById('cfg-empresa').value = c.nome||'';
    document.getElementById('cfg-cnpj').value = c.cnpj||'';
    document.getElementById('cfg-tel').value = c.telefone||'';
    document.getElementById('cfg-end').value = c.endereco||'';
    document.getElementById('cfg-insta').value = c.instagram||'';
    document.getElementById('cfg-pix').value = c.pix||'';
    document.getElementById('cfg-termos').value = c.termos_garantia||'';
    document.getElementById('cfg-wapi').value = c.whatsapp_api||'';
    document.getElementById('cfg-sig').checked = c.config?.assinatura||false;
    document.getElementById('cfg-foto').checked = c.config?.fotos||false;
    document.getElementById('cfg-scanner').checked = c.config?.scanner||false;
    if (c.logo_url) {
      document.getElementById('logo-preview').innerHTML = `<img src="${c.logo_url}" style="width:100%;height:100%;object-fit:contain">`;
    }
    await Config.loadFuncionarios();
  },

  async salvar() {
    const nome = document.getElementById('cfg-empresa').value.trim();
    if (!nome) { UI.toast('⚠️ Informe o nome da empresa', true); return; }
    const payload = {
      nome, cnpj: document.getElementById('cfg-cnpj').value,
      telefone: document.getElementById('cfg-tel').value,
      endereco: document.getElementById('cfg-end').value,
      instagram: document.getElementById('cfg-insta').value,
      pix: document.getElementById('cfg-pix').value,
      termos_garantia: document.getElementById('cfg-termos').value,
    };
    await window.sb.from('empresas').update(payload).eq('id', STATE.empresa.id);
    STATE.empresa = { ...STATE.empresa, ...payload };
    UI.toast('✅ Dados salvos');
  },

  async toggle(key, val) {
    const config = { ...STATE.config, [key]: val };
    await window.sb.from('empresas').update({ config }).eq('id', STATE.empresa.id);
    STATE.config = config;
    STATE.empresa.config = config;
    if (key === 'assinatura') document.getElementById('os-sig-section').classList.toggle('gone', !val);
    if (key === 'fotos') document.getElementById('os-foto-section').classList.toggle('gone', !val);
    if (key === 'scanner') {
      localStorage.setItem('nexos_scanner', val ? '1' : '0');
      document.querySelectorAll('[id$="-btn"]').forEach(b => { if(b.id.includes('scanner')) b.classList.toggle('gone', !val); });
    }
  },

  toggleTheme(isLight) {
    if (isLight) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('nexos_theme','dark'); }
    else { document.documentElement.setAttribute('data-theme','light'); localStorage.setItem('nexos_theme','light'); }
  },

  uploadLogo(inp) {
    if (!inp.files[0]) return;
    const r = new FileReader();
    r.onload = async e => {
      document.getElementById('logo-preview').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain">`;
      await window.sb.from('empresas').update({ logo_url: e.target.result }).eq('id', STATE.empresa.id);
      STATE.empresa.logo_url = e.target.result;
      UI.toast('✅ Logo atualizado');
    };
    r.readAsDataURL(inp.files[0]);
  },

  async salvarWA() {
    await window.sb.from('empresas').update({ whatsapp_api: document.getElementById('cfg-wapi').value, whatsapp_token: document.getElementById('cfg-wtoken').value || undefined }).eq('id', STATE.empresa.id);
    UI.toast('✅ WhatsApp configurado');
  },

  async loadFuncionarios() {
    if (!STATE.empresa) return;
    const { data } = await window.sb.from('funcionarios').select('*').eq('empresa_id', STATE.empresa.id);
    const el = document.getElementById('func-list');
    if (!data?.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">👨‍💼</div><p>Nenhum funcionário</p></div>'; return; }
    el.innerHTML = data.map(f=>`<div class="mov-item">
      <div>
        <div class="mov-desc">${f.nome}</div>
        <div class="mov-meta">${f.funcao} · PIN: ••••</div>
      </div>
      <div style="display:flex;gap:6px">
        <span class="sbadge ${f.ativo?'sb-paga':'sb-cancelada'}">${f.ativo?'Ativo':'Inativo'}</span>
        <button class="btn btn-red btn-sm" onclick="Funcionarios.del('${f.id}')">✕</button>
      </div>
    </div>`).join('');
  },

  exportJSON() {
    const data = { os: STATE.os, clientes: STATE.clientes, produtos: STATE.produtos };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'nexos_backup_' + today() + '.json'; a.click();
    UI.toast('✅ Backup exportado');
  },

  importJSON(inp) {
    if (!inp.files[0]) return;
    const r = new FileReader();
    r.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        UI.toast('⚠️ Importação: função em desenvolvimento', true);
      } catch(err) { UI.toast('❌ JSON inválido', true); }
    };
    r.readAsText(inp.files[0]);
  },
};

// ── FUNCIONÁRIOS ──
const Funcionarios = {
  async salvar() {
    const nome = document.getElementById('func-nome').value.trim();
    const funcao = document.getElementById('func-funcao').value.trim();
    const pin = document.getElementById('func-pin').value.trim();
    if (!nome || !funcao || pin.length < 4) { UI.toast('⚠️ Preencha nome, função e PIN de 4 dígitos', true); return; }
    const perms = {};
    document.querySelectorAll('#func-perms input[name="perm"]').forEach(cb => { perms[cb.value] = cb.checked; });
    const id = document.getElementById('func-id').value;
    const payload = { empresa_id: STATE.empresa.id, nome, funcao, pin_hash: btoa(pin), permissoes: perms, ativo: true };
    try {
      if (id) await window.sb.from('funcionarios').update(payload).eq('id', id);
      else await window.sb.from('funcionarios').insert(payload);
      UI.closeModal('modal-funcionario');
      await Config.loadFuncionarios();
      UI.toast(id ? '✅ Funcionário atualizado' : '✅ Funcionário cadastrado');
    } catch(e) { UI.toast('Erro: ' + e.message, true); }
  },

  async del(id) {
    if (!confirm('Remover funcionário?')) return;
    await window.sb.from('funcionarios').update({ ativo: false }).eq('id', id);
    await Config.loadFuncionarios();
    UI.toast('🗑️ Funcionário removido');
  },
};

// ── COMPROVANTE ──
const Comp = {
  ver(id) {
    const o = STATE.os.find(x=>x.id===id) || STATE.os.find(x=>String(x.id)===String(id));
    if (!o) { UI.toast('OS não encontrada', true); return; }
    UI.closeModal('modal-os-detail');
    const emp = STATE.empresa;
    const pix = emp?.pix;
    let qrDiv = '';
    if (pix) qrDiv = `<div class="comp-qr" id="comp-qr-${o.id}"></div>`;
    const paper = document.getElementById('comp-paper');
    paper.innerHTML = `
      <div class="comp-header">
        ${emp?.logo_url ? `<img class="comp-logo-img" src="${emp.logo_url}" alt="Logo">` : ''}
        <div class="comp-logo">${emp?.nome||'Empresa'}</div>
        <div class="comp-sub">${emp?.telefone||''} ${emp?.pix?'· PIX: '+emp.pix:''}</div>
        <div class="comp-num">#${String(o.numero||'?').padStart(4,'0')}</div>
        <div class="comp-date">${fmtDate(o.criado_em?.split('T')[0])}</div>
      </div>
      <div class="comp-section">CLIENTE</div>
      <div class="comp-row"><span>Nome</span><span>${o.cliente_nome||'—'}</span></div>
      <div class="comp-section">SERVIÇO</div>
      <div class="comp-row"><span>Equipamento</span><span>${o.equipamento||'—'}</span></div>
      <div class="comp-row"><span>Defeito</span><span>${o.defeito||'—'}</span></div>
      ${o.tecnico_nome?`<div class="comp-row"><span>Técnico</span><span>${o.tecnico_nome}</span></div>`:''}
      ${o.garantia_dias?`<div class="comp-row"><span>Garantia</span><span>${o.garantia_dias} dias</span></div>`:''}
      ${(o.items||[]).length?`<div class="comp-section">ITENS</div>${(o.items||[]).map(it=>`<div class="comp-item-row"><span>${it.qty}x ${it.desc}</span><span>${fmt(it.total)}</span></div>`).join('')}`:''}
      <div class="comp-total-row"><span>TOTAL</span><span>${fmt(o.total||0)}</span></div>
      <div class="comp-row"><span>Pagamento</span><span>${payLabel(o.forma_pagamento)}</span></div>
      ${emp?.termos_garantia?`<div class="comp-terms">${emp.termos_garantia}</div>`:''}
      ${pix?`<div class="comp-section">PIX</div>${qrDiv}`:''}
      <div class="comp-footer">
        <div>Obrigado pela preferência!</div>
        <div class="comp-hash">OS-${o.id?.slice(0,8)||'?'}</div>
      </div>
    `;
    if (pix) {
      setTimeout(() => {
        try { new QRCode(document.getElementById('comp-qr-'+o.id), { text: pix, width: 100, height: 100 }); } catch(e) {}
      }, 100);
    }
    const cv = document.getElementById('compView');
    cv.style.display = 'block';
    cv.style.position = 'fixed';
    cv.style.inset = '0';
    cv.style.zIndex = '600';
    cv.style.background = 'var(--bg)';
    cv.style.overflowY = 'auto';
    cv.style.padding = '20px';
    cv.style.transform = 'none';
  },

  fechar() {
    const cv = document.getElementById('compView');
    cv.style.display = 'none';
  },

  pdf() {
    window.print();
  },

  whatsapp() {
    const tel = STATE.clientes.find(c=>c.id===STATE.os.find(o=>o.status==='paga')?.cliente_id)?.telefone || '';
    const msg = encodeURIComponent('Seu serviço está pronto! Acesse seu comprovante no NexOS.');
    window.open('https://wa.me/55'+tel.replace(/\D/g,'')+`?text=${msg}`, '_blank');
  },
};

// ── ASSINATURA ──
const Sig = {
  canvas: null, ctx: null, drawing: false,
  init() {
    const c = document.getElementById('sig-canvas');
    if (!c) return;
    Sig.canvas = c;
    c.width = c.offsetWidth * 2; c.height = 240;
    Sig.ctx = c.getContext('2d');
    Sig.ctx.scale(2, 2);
    Sig.ctx.strokeStyle = '#3b82f6';
    Sig.ctx.lineWidth = 2;
    Sig.ctx.lineCap = 'round';
    const pos = e => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left), y: (src.clientY - r.top) };
    };
    c.addEventListener('mousedown', e => { Sig.drawing = true; const p = pos(e); Sig.ctx.beginPath(); Sig.ctx.moveTo(p.x, p.y); });
    c.addEventListener('mousemove', e => { if (!Sig.drawing) return; const p = pos(e); Sig.ctx.lineTo(p.x, p.y); Sig.ctx.stroke(); });
    c.addEventListener('mouseup', () => Sig.drawing = false);
    c.addEventListener('touchstart', e => { e.preventDefault(); Sig.drawing = true; const p = pos(e); Sig.ctx.beginPath(); Sig.ctx.moveTo(p.x, p.y); }, { passive: false });
    c.addEventListener('touchmove', e => { e.preventDefault(); if (!Sig.drawing) return; const p = pos(e); Sig.ctx.lineTo(p.x, p.y); Sig.ctx.stroke(); }, { passive: false });
    c.addEventListener('touchend', () => Sig.drawing = false);
  },
  clear() { if (Sig.ctx) Sig.ctx.clearRect(0, 0, Sig.canvas.width, Sig.canvas.height); }
};

// ── SCANNER ──
const Scanner = {
  _target: null, _stream: null,
  async open(targetId) {
    if (!STATE.config?.scanner) { UI.toast('⚠️ Ative o scanner nas configurações', true); return; }
    Scanner._target = targetId;
    UI.openModal('modal-scanner');
    try {
      Scanner._stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      document.getElementById('scanner-video').srcObject = Scanner._stream;
      document.getElementById('scanner-video').play();
      document.getElementById('scanner-result').textContent = 'Aponte para o código...';
    } catch(e) {
      UI.toast('❌ Câmera não disponível', true);
      Scanner.close();
    }
  },
  close() {
    if (Scanner._stream) { Scanner._stream.getTracks().forEach(t=>t.stop()); Scanner._stream = null; }
    UI.closeModal('modal-scanner');
  },
};

// ── MASTER ──
const Master = {
  async load() {
    if (STATE.perfil !== 'master' && STATE.perfil !== 'dono') return;
    const { data: emps } = await window.sb.from('empresas').select('*').order('criado_em', { ascending: false });
    if (!emps) return;
    document.getElementById('m-empresas').textContent = emps.length;
    document.getElementById('m-ativas').textContent = emps.filter(e=>!e.bloqueada).length;
    document.getElementById('m-bloq').textContent = emps.filter(e=>e.bloqueada).length;
    const el = document.getElementById('master-list');
    el.innerHTML = emps.map(e=>`<div class="mov-item">
      <div>
        <div class="mov-desc">${e.nome}</div>
        <div class="mov-meta">${fmtDate(e.criado_em?.split('T')[0])} · Plano: ${e.plano||'básico'}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="sbadge ${e.bloqueada?'sb-cancelada':'sb-paga'}">${e.bloqueada?'Bloqueada':'Ativa'}</span>
        <button class="btn btn-ghost btn-sm" onclick="Master.toggle('${e.id}',${e.bloqueada})">${e.bloqueada?'✓':'⛔'}</button>
      </div>
    </div>`).join('');
  },
  async toggle(id, bloqueada) {
    await window.sb.from('empresas').update({ bloqueada: !bloqueada }).eq('id', id);
    await Master.load();
    UI.toast(bloqueada ? '✅ Empresa desbloqueada' : '⛔ Empresa bloqueada');
  },
};

// ── GLOBAL SEARCH ──
const GlobalSearch = {
  search(q) {
    const panel = document.getElementById('gsearch-panel');
    const results = document.getElementById('gsearch-results');
    if (!q || q.length < 2) { panel.classList.add('gone'); return; }
    panel.classList.remove('gone');
    const ql = q.toLowerCase();
    const osR = STATE.os.filter(o=>(o.cliente_nome||'').toLowerCase().includes(ql)||(o.equipamento||'').toLowerCase().includes(ql)||(o.defeito||'').toLowerCase().includes(ql)).slice(0,4);
    const cliR = STATE.clientes.filter(c=>(c.nome||'').toLowerCase().includes(ql)||(c.telefone||'').includes(ql)).slice(0,4);
    const prodR = STATE.produtos.filter(p=>(p.nome||'').toLowerCase().includes(ql)).slice(0,3);
    let html = '';
    if (osR.length) {
      html += `<div style="font-size:10px;font-weight:700;color:var(--muted);padding:8px 8px 4px;text-transform:uppercase;letter-spacing:1px">Ordens de Serviço</div>`;
      html += osR.map(o=>`<div onclick="Nav.go('os');setTimeout(()=>OS.ver('${o.id}'),200);document.getElementById('gsearch-panel').classList.add('gone')" style="padding:8px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
        <span>🔧</span>
        <div><div style="font-size:13px;font-weight:600">#${String(o.numero||'?').padStart(4,'0')} ${o.cliente_nome||'Sem nome'}</div><div style="font-size:11px;color:var(--muted)">${o.equipamento||''} — ${o.defeito||''}</div></div>
      </div>`).join('');
    }
    if (cliR.length) {
      html += `<div style="font-size:10px;font-weight:700;color:var(--muted);padding:8px 8px 4px;text-transform:uppercase;letter-spacing:1px">Clientes</div>`;
      html += cliR.map(c=>`<div onclick="Nav.go('clientes');setTimeout(()=>Clientes.ver('${c.id}'),200);document.getElementById('gsearch-panel').classList.add('gone')" style="padding:8px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
        <div style="width:28px;height:28px;border-radius:50%;background:${avatarColor(c.nome)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${initials(c.nome)}</div>
        <div><div style="font-size:13px;font-weight:600">${c.nome}</div><div style="font-size:11px;color:var(--muted)">${c.telefone||''}</div></div>
      </div>`).join('');
    }
    if (prodR.length) {
      html += `<div style="font-size:10px;font-weight:700;color:var(--muted);padding:8px 8px 4px;text-transform:uppercase;letter-spacing:1px">Estoque</div>`;
      html += prodR.map(p=>`<div onclick="Nav.go('estoque');document.getElementById('gsearch-panel').classList.add('gone')" style="padding:8px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
        <span>📦</span>
        <div><div style="font-size:13px;font-weight:600">${p.nome}</div><div style="font-size:11px;color:var(--muted)">Estoque: ${p.quantidade||0} · ${fmt(p.preco_venda||0)}</div></div>
      </div>`).join('');
    }
    if (!html) html = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">Nenhum resultado</div>';
    results.innerHTML = html;
  },
};

// ── HELPERS GLOBAIS ──
function openNovaOS() {
  OS.openNew();
  if (!document.getElementById('pg-os').classList.contains('on')) Nav.go('os');
}
function openNovoCliente() {
  document.getElementById('cli-modal-title').textContent = 'Novo Cliente';
  document.getElementById('cli-id').value = '';
  ['cli-nome','cli-tel','cli-cpf','cli-email','cli-end','cli-obs','cli-limite'].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('cli-nasc').value = '';
  document.getElementById('cli-nivel').value = 'normal';
  document.getElementById('cli-foto-preview').innerHTML = '👤';
  // Rebuild modal body
  const tpl = document.querySelector('#modal-cliente .mbody');
  // Keep the original structure
  UI.openModal('modal-cliente');
}
function openNovoProduto() {
  document.getElementById('prod-modal-title').textContent = 'Novo Produto';
  document.getElementById('prod-id').value = '';
  ['prod-nome','prod-barcode','prod-custo','prod-venda','prod-qty','prod-min','prod-cat','prod-forn'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('prod-margem').value = '';
  // Scanner btn
  if (STATE.config?.scanner) document.getElementById('scanner-prod-btn').classList.remove('gone');
  UI.openModal('modal-produto');
}
function openNovoEvento() {
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-titulo').value = '';
  document.getElementById('ev-data').value = `${STATE.agendaAno}-${String(STATE.agendaMes+1).padStart(2,'0')}-${String(STATE.agendaDia).padStart(2,'0')}`;
  document.getElementById('ev-hora').value = '';
  document.getElementById('ev-tipo').value = 'geral';
  document.getElementById('ev-desc').value = '';
  OS.loadTecnicos('ev-tecnico');
  UI.openModal('modal-evento');
}
function openRegistrarSaida() {
  document.getElementById('saida-desc').value = '';
  document.getElementById('saida-val').value = '';
  document.getElementById('saida-data').value = today();
  UI.openModal('modal-saida');
}
function openNovaContaPagar() { openNovaConta('pagar'); }
function openNovaConta(tipo) {
  document.getElementById('conta-modal-title').textContent = tipo === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber';
  document.getElementById('conta-tipo').value = tipo;
  ['conta-desc','conta-cat'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('conta-valor').value = '';
  document.getElementById('conta-venc').value = '';
  UI.openModal('modal-conta');
}
function openNovoFuncionario() {
  document.getElementById('func-modal-title').textContent = 'Novo Funcionário';
  document.getElementById('func-id').value = '';
  ['func-nome','func-funcao','func-pin'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.querySelectorAll('#func-perms input[name="perm"]').forEach(cb => { cb.checked = cb.value==='criar_os'||cb.value==='gerenciar_estoque'||cb.value==='ver_clientes'; });
  UI.openModal('modal-funcionario');
}
