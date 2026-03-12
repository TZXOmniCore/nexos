/* ============================================================
   NexOS v3.0 — api.js
   Camada de acesso ao Supabase.
   Todas as operações de banco passam por aqui.
   ============================================================ */

// ── UTILS GLOBAIS ──────────────────────────────────────────

// Formata valor monetário conforme moeda configurada
function fmt(v, currency) {
  const cur = currency || STATE.currency || 'BRL';
  const num = parseFloat(v) || 0;
  const symbols = { BRL:'R$ ', USD:'$ ', EUR:'€ ', GBP:'£ ', ARS:'$ ', CLP:'$ ', COP:'$ ', MXN:'$ ', PYG:'₲ ', UYU:'$ ' };
  const sym = symbols[cur] || 'R$ ';
  return sym + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const today      = () => new Date().toISOString().split('T')[0];
const nowISO     = () => new Date().toISOString();
const fmtDate    = d  => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtDatetime= d  => d ? new Date(d).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
const initials   = n  => (n||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
const avatarColor= n  => { const c=['#38BDF8','#A78BFA','#FB923C','#34D399','#F472B6','#FBBF24','#60A5FA']; let h=0; for(let i=0;i<(n||'').length;i++) h+=n.charCodeAt(i); return c[h%c.length]; };
const slugify    = s  => s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
const clamp      = (v,min,max) => Math.min(Math.max(v,min),max);

// Status labels + cores
const STATUS_CONFIG = {
  aguardando: { label:'Aguardando',       color:'var(--yellow)', icon:'clock'          },
  andamento:  { label:'Em Andamento',     color:'var(--blue)',   icon:'loader'          },
  concluido:  { label:'Concluído',        color:'var(--green)',  icon:'check-circle-2'  },
  retirada:   { label:'Pronto p/ Retirada',color:'var(--orange)',icon:'package-check'  },
  cancelado:  { label:'Cancelado',        color:'var(--red)',    icon:'x-circle'        },
  fiado:      { label:'Fiado',            color:'var(--purple)', icon:'credit-card'     },
  orcamento:  { label:'Orçamento',        color:'var(--text-2)', icon:'file-text'       },
};

const PAY_CONFIG = {
  dinheiro:     { label:'Dinheiro',         icon:'banknote'         },
  pix:          { label:'PIX',              icon:'zap'              },
  credito:      { label:'Cartão Crédito',   icon:'credit-card'      },
  debito:       { label:'Cartão Débito',    icon:'credit-card'      },
  parcelado:    { label:'Parcelado',        icon:'calendar-days'    },
  fiado:        { label:'Fiado',            icon:'handshake'        },
  carne:        { label:'Carnê',            icon:'book-open'        },
  transferencia:{ label:'Transferência',    icon:'arrow-right-left' },
  orcamento:    { label:'Orçamento',        icon:'file-text'        },
};

function statusLabel(s) { return STATUS_CONFIG[s]?.label || s || '—'; }
function statusColor(s) { return STATUS_CONFIG[s]?.color || 'var(--text-2)'; }
function payLabel(p)    { return PAY_CONFIG[p]?.label   || p || '—'; }

// ── UI HELPERS ─────────────────────────────────────────────
const UI = {

  toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    container.appendChild(t);

    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3200);
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  },

  closeModal(id) {
    if (id) {
      document.getElementById(id)?.classList.remove('open');
    } else {
      document.querySelectorAll('.modal.open, .modal-wrap.open').forEach(m => m.classList.remove('open'));
    }
    document.body.style.overflow = '';
  },

  confirm(msg, onYes) {
    const id = 'confirm-modal-' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = 'modal-wrap open';
    el.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h3 class="modal-title">Confirmar</h3>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-1);font-size:.9rem;line-height:1.5">${msg}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="document.getElementById('${id}').remove();document.body.style.overflow=''">Cancelar</button>
          <button class="btn btn-danger" id="${id}-ok">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    document.getElementById(id + '-ok').onclick = () => {
      el.remove();
      document.body.style.overflow = '';
      onYes();
    };
  },

  loading(show, msg) {
    const el = document.getElementById('loading-screen');
    if (!el) return;
    if (show) {
      el.style.display = 'flex';
      const txt = el.querySelector('.loading-text');
      if (txt) txt.textContent = msg || 'Carregando...';
    } else {
      el.style.display = 'none';
    }
  },

  setPageTitle(title) {
    const el = document.getElementById('header-title');
    if (el) el.textContent = title;
  },

  badge(el_id, count) {
    const el = document.getElementById(el_id);
    if (!el) return;
    el.style.display = count > 0 ? 'flex' : 'none';
    el.textContent = count > 99 ? '99+' : count;
  },
};

// ── API — EMPRESAS ─────────────────────────────────────────
const API = {

  // ── EMPRESA ────────────────────────────────────────────
  async getEmpresa(id) {
    const { data } = await window.sb.from('empresas').select('*').eq('id', id).single();
    return data;
  },

  async updateEmpresa(id, updates) {
    const { data, error } = await window.sb.from('empresas').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ── ORDENS DE SERVIÇO ─────────────────────────────────
  async getOS(empresaId, filters = {}) {
    let q = window.sb
      .from('ordens')
      .select(`
        *,
        clientes ( id, nome, telefone, nivel ),
        funcionarios ( id, nome, funcao )
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
    if (filters.search) {
      q = q.or(`numero.ilike.%${filters.search}%,item.ilike.%${filters.search}%,extra_1.ilike.%${filters.search}%`);
    }
    if (filters.from)   q = q.gte('created_at', filters.from);
    if (filters.to)     q = q.lte('created_at', filters.to + 'T23:59:59');
    if (filters.limit)  q = q.limit(filters.limit);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getOSById(id) {
    const { data, error } = await window.sb
      .from('ordens')
      .select(`*, clientes(*), funcionarios(id,nome,funcao), ordens_historico(*)`)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createOS(empresaId, osData) {
    // Gera número sequencial
    const { count } = await window.sb
      .from('ordens')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId);

    const numero = String((count || 0) + 1).padStart(4, '0');

    const { data, error } = await window.sb
      .from('ordens')
      .insert({ ...osData, empresa_id: empresaId, numero, created_at: nowISO() })
      .select()
      .single();

    if (error) throw error;
    await API._log(empresaId, 'criar_os', { numero, item: osData.item });
    return data;
  },

  async updateOS(id, updates) {
    const { data, error } = await window.sb
      .from('ordens')
      .update({ ...updates, updated_at: nowISO() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await API._log(STATE.empresa?.id, 'editar_os', { id, status: updates.status });
    return data;
  },

  async deleteOS(id) {
    // Deleta histórico e parcelas primeiro (FK)
    await window.sb.from('ordens_historico').delete().eq('ordem_id', id);
    await window.sb.from('parcelas').delete().eq('ordem_id', id);
    await window.sb.from('caixa').delete().eq('ordem_id', id);

    const { error } = await window.sb.from('ordens').delete().eq('id', id);
    if (error) throw error;
    await API._log(STATE.empresa?.id, 'deletar_os', { id });
  },

  async addHistoricoOS(ordemId, texto, usuarioNome) {
    const { data, error } = await window.sb
      .from('ordens_historico')
      .insert({
        ordem_id:     ordemId,
        empresa_id:   STATE.empresa?.id,
        texto,
        usuario_nome: usuarioNome || STATE.perfil?.nome || 'Sistema',
        created_at:   nowISO(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async duplicarOS(id) {
    const os = await API.getOSById(id);
    if (!os) throw new Error('OS não encontrada');
    const { id: _, numero: __, created_at: ___, updated_at: ____, ordens_historico: _____, ...osData } = os;
    osData.status = 'aguardando';
    osData.valor_total = osData.valor_total || 0;
    return await API.createOS(STATE.empresa.id, osData);
  },

  // ── CLIENTES ──────────────────────────────────────────
  async getClientes(empresaId, search = '') {
    let q = window.sb
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');

    if (search) q = q.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%,cpf.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getClienteById(id) {
    const { data, error } = await window.sb.from('clientes').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async createCliente(empresaId, dados) {
    const { data, error } = await window.sb
      .from('clientes')
      .insert({ ...dados, empresa_id: empresaId, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    await API._log(empresaId, 'criar_cliente', { nome: dados.nome });
    return data;
  },

  async updateCliente(id, updates) {
    const { data, error } = await window.sb
      .from('clientes')
      .update({ ...updates, updated_at: nowISO() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteCliente(id) {
    const { error } = await window.sb.from('clientes').delete().eq('id', id);
    if (error) throw error;
  },

  async getHistoricoCliente(clienteId) {
    const { data } = await window.sb
      .from('ordens')
      .select('id, numero, item, status, valor_total, created_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  },

  async getTopClientes(empresaId, limit = 5) {
    const { data } = await window.sb
      .from('ordens')
      .select('cliente_id, valor_total, clientes(nome, telefone, nivel)')
      .eq('empresa_id', empresaId)
      .in('status', ['concluido', 'retirada'])
      .not('cliente_id', 'is', null);

    if (!data) return [];

    // Agrupa por cliente e soma totais
    const map = {};
    data.forEach(os => {
      const id = os.cliente_id;
      if (!map[id]) map[id] = { ...os.clientes, cliente_id: id, total: 0, count: 0 };
      map[id].total += parseFloat(os.valor_total) || 0;
      map[id].count++;
    });

    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  },

  // ── PRODUTOS / ESTOQUE ────────────────────────────────
  async getProdutos(empresaId, search = '') {
    let q = window.sb
      .from('produtos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');

    if (search) q = q.or(`nome.ilike.%${search}%,codigo.ilike.%${search}%,codigo_barras.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getProdutoById(id) {
    const { data } = await window.sb.from('produtos').select('*').eq('id', id).single();
    return data;
  },

  async createProduto(empresaId, dados) {
    const { data, error } = await window.sb
      .from('produtos')
      .insert({ ...dados, empresa_id: empresaId, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    await API._log(empresaId, 'criar_produto', { nome: dados.nome });
    return data;
  },

  async updateProduto(id, updates) {
    const { data, error } = await window.sb
      .from('produtos')
      .update({ ...updates, updated_at: nowISO() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteProduto(id) {
    const { error } = await window.sb.from('produtos').delete().eq('id', id);
    if (error) throw error;
  },

  async getLowStockProducts(empresaId) {
    const { data } = await window.sb
      .from('produtos')
      .select('*')
      .eq('empresa_id', empresaId)
      .gt('estoque_minimo', 0)
      .filter('quantidade', 'lte', window.sb.rpc) // usando js
      .order('quantidade');

    // Fallback — filtra no JS
    const all = await API.getProdutos(empresaId);
    return all.filter(p => p.estoque_minimo > 0 && (p.quantidade || 0) <= (p.estoque_minimo || 0));
  },

  async ajustarEstoque(produtoId, delta, motivo) {
    const prod = await API.getProdutoById(produtoId);
    if (!prod) return;
    const novaQtd = Math.max(0, (prod.quantidade || 0) + delta);
    await API.updateProduto(produtoId, { quantidade: novaQtd });
    await API._log(STATE.empresa?.id, 'ajuste_estoque', { produto: prod.nome, delta, motivo });
    return novaQtd;
  },

  // ── CAIXA ─────────────────────────────────────────────
  async getCaixa(empresaId, from, to) {
    const { data, error } = await window.sb
      .from('caixa')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', from || today() + 'T00:00:00')
      .lte('created_at', (to || today()) + 'T23:59:59')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async addCaixaEntry(empresaId, entry) {
    const { data, error } = await window.sb
      .from('caixa')
      .insert({ ...entry, empresa_id: empresaId, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getCaixaSummary(empresaId, from, to) {
    const items = await API.getCaixa(empresaId, from, to);
    const entradas = items.filter(i => i.tipo === 'entrada').reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
    const saidas   = items.filter(i => i.tipo === 'saida').reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
    return { entradas, saidas, saldo: entradas - saidas, items };
  },

  // ── CONTAS A PAGAR ────────────────────────────────────
  async getContasPagar(empresaId) {
    const { data, error } = await window.sb
      .from('contas_pagar')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('vencimento');
    if (error) throw error;
    return data || [];
  },

  async createContaPagar(empresaId, dados) {
    const { data, error } = await window.sb
      .from('contas_pagar')
      .insert({ ...dados, empresa_id: empresaId, pago: false, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateContaPagar(id, updates) {
    const { data, error } = await window.sb
      .from('contas_pagar')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteContaPagar(id) {
    await window.sb.from('contas_pagar').delete().eq('id', id);
  },

  // ── CONTAS A RECEBER ──────────────────────────────────
  async getContasReceber(empresaId) {
    const { data, error } = await window.sb
      .from('contas_receber')
      .select('*, clientes(nome, telefone)')
      .eq('empresa_id', empresaId)
      .order('vencimento');
    if (error) throw error;
    return data || [];
  },

  async createContaReceber(empresaId, dados) {
    const { data, error } = await window.sb
      .from('contas_receber')
      .insert({ ...dados, empresa_id: empresaId, recebido: false, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateContaReceber(id, updates) {
    const { data, error } = await window.sb
      .from('contas_receber')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── PARCELAS ──────────────────────────────────────────
  async getParcelas(empresaId, apenasVencidas = false) {
    let q = window.sb
      .from('parcelas')
      .select('*, ordens(numero, item, clientes(nome, telefone))')
      .eq('empresa_id', empresaId)
      .eq('pago', false)
      .order('vencimento');
    if (apenasVencidas) q = q.lt('vencimento', today());
    const { data } = await q;
    return data || [];
  },

  async createParcelas(empresaId, ordemId, total, nParcelas, dataInicio) {
    const valorParc = total / nParcelas;
    const base = new Date(dataInicio || today());
    const parcelas = Array.from({ length: nParcelas }, (_, i) => {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i);
      return {
        empresa_id: empresaId,
        ordem_id:   ordemId,
        numero:     i + 1,
        total:      nParcelas,
        valor:      parseFloat(valorParc.toFixed(2)),
        vencimento: d.toISOString().split('T')[0],
        pago:       false,
        created_at: nowISO(),
      };
    });
    const { data, error } = await window.sb.from('parcelas').insert(parcelas).select();
    if (error) throw error;
    return data;
  },

  async pagarParcela(id) {
    const { data, error } = await window.sb
      .from('parcelas')
      .update({ pago: true, pago_em: today() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    // Registra no caixa
    await API.addCaixaEntry(STATE.empresa.id, {
      tipo:      'entrada',
      descricao: `Parcela ${data.numero}/${data.total} - OS`,
      valor:     data.valor,
      forma:     'carne',
      ordem_id:  data.ordem_id,
    });
    return data;
  },

  // ── AGENDA ────────────────────────────────────────────
  async getAgenda(empresaId, from, to) {
    const { data, error } = await window.sb
      .from('agenda')
      .select('*, clientes(nome, telefone), funcionarios(nome)')
      .eq('empresa_id', empresaId)
      .gte('data_inicio', from)
      .lte('data_inicio', to)
      .order('data_inicio');
    if (error) throw error;
    return data || [];
  },

  async getAgendaHoje(empresaId) {
    return API.getAgenda(empresaId, today() + 'T00:00:00', today() + 'T23:59:59');
  },

  async createEvento(empresaId, dados) {
    const { data, error } = await window.sb
      .from('agenda')
      .insert({ ...dados, empresa_id: empresaId, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateEvento(id, updates) {
    const { data, error } = await window.sb
      .from('agenda')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteEvento(id) {
    await window.sb.from('agenda').delete().eq('id', id);
  },

  // ── FUNCIONÁRIOS ──────────────────────────────────────
  async getFuncionarios(empresaId) {
    const { data, error } = await window.sb
      .from('funcionarios')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (error) throw error;
    return data || [];
  },

  async createFuncionario(empresaId, dados) {
    // Hash simples do PIN (base64) — em produção usar edge function com bcrypt
    const pinHash = dados.pin ? btoa(dados.pin) : null;
    const { data, error } = await window.sb
      .from('funcionarios')
      .insert({
        ...dados,
        empresa_id: empresaId,
        pin_hash:   pinHash,
        ativo:      true,
        created_at: nowISO(),
      })
      .select()
      .single();
    if (error) throw error;
    await API._log(empresaId, 'criar_funcionario', { nome: dados.nome });
    return data;
  },

  async updateFuncionario(id, updates) {
    if (updates.pin) {
      updates.pin_hash = btoa(updates.pin);
      delete updates.pin;
    }
    const { data, error } = await window.sb
      .from('funcionarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFuncionario(id) {
    await window.sb.from('funcionarios').update({ ativo: false }).eq('id', id);
  },

  // ── NOTIFICAÇÕES ──────────────────────────────────────
  async getNotificacoes(empresaId) {
    const { data } = await window.sb
      .from('notificacoes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data || [];
  },

  async marcarNotifLida(id) {
    await window.sb.from('notificacoes').update({ lida: true }).eq('id', id);
  },

  async marcarTodasLidas(empresaId) {
    await window.sb.from('notificacoes').update({ lida: true }).eq('empresa_id', empresaId).eq('lida', false);
  },

  async createNotif(empresaId, dados) {
    await window.sb.from('notificacoes').insert({
      ...dados,
      empresa_id: empresaId,
      lida: false,
      created_at: nowISO(),
    });
  },

  // ── FORNECEDORES ──────────────────────────────────────
  async getFornecedores(empresaId) {
    const { data } = await window.sb
      .from('fornecedores')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');
    return data || [];
  },

  async createFornecedor(empresaId, dados) {
    const { data, error } = await window.sb
      .from('fornecedores')
      .insert({ ...dados, empresa_id: empresaId, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateFornecedor(id, updates) {
    const { data, error } = await window.sb
      .from('fornecedores')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFornecedor(id) {
    await window.sb.from('fornecedores').delete().eq('id', id);
  },

  // ── ANALYTICS ─────────────────────────────────────────
  async getAnalytics(empresaId, from, to) {
    const [osData, caixaData] = await Promise.all([
      window.sb.from('ordens')
        .select('status, valor_total, forma_pagamento, tecnico_id, created_at, item')
        .eq('empresa_id', empresaId)
        .gte('created_at', from + 'T00:00:00')
        .lte('created_at', to + 'T23:59:59'),
      window.sb.from('caixa')
        .select('tipo, valor, forma, created_at')
        .eq('empresa_id', empresaId)
        .gte('created_at', from + 'T00:00:00')
        .lte('created_at', to + 'T23:59:59'),
    ]);

    const os     = osData.data || [];
    const caixa  = caixaData.data || [];
    const pagas  = os.filter(o => ['concluido','retirada'].includes(o.status));
    const faturamento = pagas.reduce((s, o) => s + (parseFloat(o.valor_total) || 0), 0);
    const custo       = caixa.filter(c => c.tipo === 'saida').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);

    // Por forma de pagamento
    const byPayment = {};
    pagas.forEach(o => {
      const f = o.forma_pagamento || 'outros';
      byPayment[f] = (byPayment[f] || 0) + (parseFloat(o.valor_total) || 0);
    });

    // Por serviço/item
    const byItem = {};
    os.forEach(o => {
      const k = o.item?.split(' ').slice(0,3).join(' ') || 'Outros';
      byItem[k] = (byItem[k] || 0) + 1;
    });
    const topServices = Object.entries(byItem).sort((a,b)=>b[1]-a[1]).slice(0,5);

    return {
      total_os:       os.length,
      pagas:          pagas.length,
      faturamento,
      custo,
      lucro:          faturamento - custo,
      ticket_medio:   pagas.length ? faturamento / pagas.length : 0,
      by_payment:     byPayment,
      top_services:   topServices,
      os_raw:         os,
    };
  },

  async getFaturamentoDiario(empresaId, days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];

    const { data } = await window.sb
      .from('ordens')
      .select('valor_total, created_at')
      .eq('empresa_id', empresaId)
      .in('status', ['concluido', 'retirada'])
      .gte('created_at', fromStr + 'T00:00:00');

    if (!data) return [];

    // Agrupa por dia
    const byDay = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      byDay[d.toISOString().split('T')[0]] = 0;
    }

    data.forEach(os => {
      const d = os.created_at.split('T')[0];
      if (byDay[d] !== undefined) byDay[d] += parseFloat(os.valor_total) || 0;
    });

    return Object.entries(byDay).map(([date, value]) => ({ date, value }));
  },

  async getMetas(empresaId) {
    const mes = new Date().toISOString().slice(0,7);
    const { data } = await window.sb
      .from('metas')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('mes', mes);
    return data || [];
  },

  async setMeta(empresaId, tipo, valor) {
    const mes = new Date().toISOString().slice(0,7);
    const { data: existing } = await window.sb
      .from('metas')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('mes', mes)
      .eq('tipo', tipo)
      .maybeSingle();

    if (existing) {
      await window.sb.from('metas').update({ valor_meta: valor }).eq('id', existing.id);
    } else {
      await window.sb.from('metas').insert({ empresa_id: empresaId, tipo, valor_meta: valor, mes, created_at: nowISO() });
    }
  },

  // ── TEMPLATES DE OS ───────────────────────────────────
  async getTemplates(empresaId) {
    const { data } = await window.sb
      .from('templates_os')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');
    return data || [];
  },

  async createTemplate(empresaId, dados) {
    const { data, error } = await window.sb
      .from('templates_os')
      .insert({ ...dados, empresa_id: empresaId, created_at: nowISO() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTemplate(id) {
    await window.sb.from('templates_os').delete().eq('id', id);
  },

  // ── LOG DE AÇÕES ──────────────────────────────────────
  async _log(empresaId, acao, detalhes = {}) {
    if (!empresaId) return;
    try {
      await window.sb.from('acoes_log').insert({
        empresa_id:   empresaId,
        usuario_id:   STATE.user?.id || null,
        usuario_nome: STATE.funcionario?.nome || STATE.perfil?.nome || STATE.user?.email || 'Sistema',
        acao,
        detalhes:     JSON.stringify(detalhes),
        criado_em:    nowISO(),
      });
    } catch(e) {
      // Log não crítico — ignora erros
    }
  },

  async getLogs(empresaId, limit = 50) {
    const { data } = await window.sb
      .from('acoes_log')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('criado_em', { ascending: false })
      .limit(limit);
    return data || [];
  },

  // ── IA (Edge Function) ────────────────────────────────
  async askAI(prompt, context = {}) {
    const { data, error } = await window.sb.functions.invoke('ia-proxy', {
      body: { prompt, context, empresa_id: STATE.empresa?.id }
    });
    if (error) throw error;
    return data?.response || data?.content || '';
  },

  // ── REALTIME ──────────────────────────────────────────
  subscribeOS(empresaId, onChange) {
    return window.sb
      .channel('os-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ordens',
        filter: `empresa_id=eq.${empresaId}`,
      }, onChange)
      .subscribe();
  },

  subscribeNotifs(empresaId, onChange) {
    return window.sb
      .channel('notif-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: `empresa_id=eq.${empresaId}`,
      }, onChange)
      .subscribe();
  },

  // ── WHATSAPP ──────────────────────────────────────────
  buildWhatsAppLink(telefone, msg) {
    const num = telefone.replace(/\D/g, '');
    const fone = num.startsWith('55') ? num : '55' + num;
    return `https://wa.me/${fone}?text=${encodeURIComponent(msg)}`;
  },

  async getWhatsAppConfig(empresaId) {
    const { data } = await window.sb
      .from('whatsapp_config')
      .select('*')
      .eq('empresa_id', empresaId)
      .maybeSingle();
    return data;
  },

  // ── ANIVERSÁRIOS DO DIA ───────────────────────────────
  async getAniversariosHoje(empresaId) {
    const hoje = today(); // YYYY-MM-DD
    const mD = hoje.slice(5); // MM-DD
    const { data } = await window.sb
      .from('clientes')
      .select('id, nome, telefone, aniversario')
      .eq('empresa_id', empresaId)
      .not('aniversario', 'is', null);

    if (!data) return [];
    return data.filter(c => c.aniversario?.slice(5) === mD);
  },

  // ── DASHBOARD SUMMARY ─────────────────────────────────
  async getDashboardData(empresaId) {
    const mesStart  = today().slice(0,7) + '-01';
    const mesEnd    = today();
    const anoStart  = today().slice(0,4) + '-01-01';
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lmStart = lastMonth.toISOString().slice(0,7) + '-01';
    const lmEnd   = lastMonth.toISOString().slice(0,8).replace(/\d\d$/, String(new Date(lastMonth.getFullYear(), lastMonth.getMonth()+1, 0).getDate()).padStart(2,'0'));

    const [
      osAbertas,
      osConcluidas,
      faturamentoMes,
      faturamentoMesAnterior,
      agendaHoje,
      aniversarios,
      topClientes,
      parcelasVencidas,
      estoquesBaixos,
    ] = await Promise.all([
      window.sb.from('ordens').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).in('status', ['aguardando','andamento','retirada']),
      window.sb.from('ordens').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'concluido').gte('created_at', mesStart),
      window.sb.from('ordens').select('valor_total').eq('empresa_id', empresaId).in('status', ['concluido','retirada']).gte('created_at', mesStart + 'T00:00:00').lte('created_at', mesEnd + 'T23:59:59'),
      window.sb.from('ordens').select('valor_total').eq('empresa_id', empresaId).in('status', ['concluido','retirada']).gte('created_at', lmStart + 'T00:00:00').lte('created_at', lmEnd + 'T23:59:59'),
      API.getAgendaHoje(empresaId),
      API.getAniversariosHoje(empresaId),
      API.getTopClientes(empresaId),
      API.getParcelas(empresaId, true),
      API.getLowStockProducts(empresaId),
    ]);

    const fatMes = (faturamentoMes.data || []).reduce((s, o) => s + (parseFloat(o.valor_total) || 0), 0);
    const fatAnt = (faturamentoMesAnterior.data || []).reduce((s, o) => s + (parseFloat(o.valor_total) || 0), 0);
    const deltaPct = fatAnt > 0 ? ((fatMes - fatAnt) / fatAnt * 100).toFixed(1) : null;

    return {
      os_abertas:            osAbertas.count || 0,
      os_concluidas_mes:     osConcluidas.count || 0,
      faturamento_mes:       fatMes,
      faturamento_ant:       fatAnt,
      delta_pct:             deltaPct,
      agenda_hoje:           agendaHoje,
      aniversarios:          aniversarios,
      top_clientes:          topClientes,
      parcelas_vencidas:     parcelasVencidas.length,
      estoques_baixos:       estoquesBaixos.length,
    };
  },
};
