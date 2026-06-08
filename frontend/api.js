/* ============================================================
   NexOS v5.0 — core/api.js
   Utilitários, UI, Supabase, API
   Correções: saveEvento bug, número OS único, rate limit
   Novo: auditoria, histórico de preços, backup, logo
   ============================================================ */
'use strict';

// ══════════════════════════════════════════════════════════════
// FORMATADORES
// ══════════════════════════════════════════════════════════════
function fmt(v) {
  const num = parseFloat(v) || 0;
  return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtBRL(v)      { return fmt(v); }
function fmtDate(d)     { return d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'; }
function fmtDatetime(d) { return d ? new Date(d).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'; }
function fDateFull(d)   { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fTime(d)       { return d ? new Date(d).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : ''; }
function pad(n)         { return String(n).padStart(2, '0'); }
const today  = () => new Date().toISOString().split('T')[0];
const nowISO = () => new Date().toISOString();
const initials = n => (n || '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES DE STATUS E PAGAMENTO
// ══════════════════════════════════════════════════════════════
const STATUS_CONFIG = {
  aguardando: { label: 'Aguardando',         color: 'var(--yellow)'  },
  andamento:  { label: 'Em Andamento',       color: 'var(--blue)'    },
  concluido:  { label: 'Concluído',          color: 'var(--green)'   },
  retirada:   { label: 'Pronto p/ Retirada', color: 'var(--orange)'  },
  cancelado:  { label: 'Cancelado',          color: 'var(--red)'     },
  fiado:      { label: 'Fiado',              color: 'var(--purple)'  },
  orcamento:  { label: 'Orçamento',          color: 'var(--text-2)'  },
};
const PAY_CONFIG = {
  dinheiro:      { label: 'Dinheiro'        },
  pix:           { label: 'PIX'             },
  credito:       { label: 'Crédito'         },
  debito:        { label: 'Débito'          },
  fiado:         { label: 'Fiado'           },
  carne:         { label: 'Carnê'           },
  transferencia: { label: 'Transferência'   },
  aguardando:    { label: 'Aguardando Pag.' },
};

function statusLabel(s)   { return STATUS_CONFIG[s]?.label || s || '—'; }
function statusColor(s)   { return STATUS_CONFIG[s]?.color || 'var(--text-2)'; }
function payLabel(p)      { return PAY_CONFIG[p]?.label   || p || '—'; }
function pagLabel(p)      { return payLabel(p); }
function slabel(s)        { return statusLabel(s); }
function statusBgColor(s) {
  return {
    concluido: '#059669', aguardando: '#d97706', andamento: '#0ea5e9',
    retirada:  '#ea580c', cancelado:  '#64748b', fiado:     '#7c3aed',
    paga: '#059669', aberta: '#d97706', orcamento: '#94a3b8',
  }[s] || '#0ea5e9';
}

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════
function genHash(seed) {
  const ts = Date.now().toString(36).toUpperCase();
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) {
    h = ((h << 5) - h) + String(seed).charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).toUpperCase().padStart(6, '0') + '-' + ts;
}

function isEmptySig(cv) {
  if (!cv || cv.width === 0 || cv.height === 0) return true;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
  return true;
}

function isVenc(d) { return d && d < today(); }

// ══════════════════════════════════════════════════════════════
// GERADOR DE NÚMERO DE OS — sequencial único por usuário
// FIX: era Math.random() com risco de colisão
// ══════════════════════════════════════════════════════════════
async function gerarNumeroOS(uid) {
  // Busca o maior número existente e incrementa
  const { data } = await window.sb
    .from('ordens_servico')
    .select('numero')
    .eq('dono_id', uid)
    .order('numero', { ascending: false })
    .limit(1);
  const ultimo = data?.[0]?.numero || 0;
  return ultimo + 1;
}

// ══════════════════════════════════════════════════════════════
// GERADOR DE PIX BR CODE (payload EMV padrão Bacen)
// Feature #6: QR Code PIX com valor real
// ══════════════════════════════════════════════════════════════
function gerarPixBRCode({ chave, nome, cidade, valor, txid = '' }) {
  const sanitize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 25).toUpperCase();
  const sanNome  = sanitize(nome  || 'NEXOS');
  const sanCidade= sanitize(cidade|| 'BRASIL');
  const txidClean= (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  function tlv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return id + len + value;
  }

  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', chave);
  const payload =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (valor > 0 ? tlv('54', valor.toFixed(2)) : '') +
    tlv('58', 'BR') +
    tlv('59', sanNome) +
    tlv('60', sanCidade) +
    tlv('62', tlv('05', txidClean)) +
    '6304';

  // CRC16-CCITT
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return payload + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// ══════════════════════════════════════════════════════════════
// UI — Toasts, Modais, Confirmações
// ══════════════════════════════════════════════════════════════
const UI = {
  toast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  },

  confirm(msg, onYes, dangerous = false) {
    const id = 'cm_' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = 'modal-wrap open';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-xl);width:100%;max-width:380px;overflow:hidden">
      <div style="padding:20px 22px 14px"><p style="font-size:.9rem;line-height:1.55">${msg}</p></div>
      <div style="padding:12px 22px 18px;display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-ghost" onclick="document.getElementById('${id}').remove()">Cancelar</button>
        <button class="btn ${dangerous ? 'btn-danger' : 'btn-primary'}" id="${id}-ok">Confirmar</button>
      </div></div>`;
    document.body.appendChild(el);
    document.getElementById(id + '-ok').onclick = () => { el.remove(); onYes(); };
    // Fechar ao clicar fora
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  },

  // Confirmação protegida por senha
  async confirmSecure(msg, onYes) {
    const id = 'sec_' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-xl);width:100%;max-width:380px;padding:24px">
      <div style="font-size:1rem;font-weight:700;margin-bottom:6px">🔐 Ação Protegida</div>
      <p style="font-size:.84rem;color:var(--text-2);margin-bottom:16px">${msg}</p>
      <label style="font-size:.75rem;color:var(--text-2);margin-bottom:6px;display:block">Digite sua senha para confirmar:</label>
      <input type="password" id="${id}-pw" class="form-control" placeholder="Senha da conta" style="margin-bottom:12px" autocomplete="current-password">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('${id}').remove()">Cancelar</button>
        <button class="btn btn-danger" id="${id}-ok">Confirmar</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    document.getElementById(id + '-pw').focus();
    document.getElementById(id + '-ok').onclick = async () => {
      const pw = document.getElementById(id + '-pw').value;
      if (!pw) { UI.toast('Digite a senha', 'warning'); return; }
      try {
        const { error } = await window.sb.auth.signInWithPassword({ email: STATE.user.email, password: pw });
        if (error) { UI.toast('Senha incorreta', 'error'); return; }
        el.remove();
        onYes();
      } catch { UI.toast('Erro de verificação', 'error'); }
    };
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  },

  setPageTitle(t) {
    const el = document.getElementById('header-title');
    if (el) el.textContent = t;
  },

  // Loading spinner inline
  loading(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = show ? '.5' : '1';
    el.style.pointerEvents = show ? 'none' : '';
  },
};

// ══════════════════════════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════════════════════════
const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    storageKey:        'nexos_v5_auth',
    flowType:          'pkce',
    detectSessionInUrl: true,
  },
});

window.STATE = {
  user:    null,
  perfil:  null,
  empresa: null,
  currency:'BRL',
  tema:    localStorage.getItem('nexos_tema') || 'dark',
  acento:  localStorage.getItem('nexos_acento') || 'blue',
};

// ══════════════════════════════════════════════════════════════
// API — todas as operações com Supabase
// ══════════════════════════════════════════════════════════════
const API = {

  // ── PERFIL ──────────────────────────────────────────────────
  async getPerfil(uid) {
    const { data } = await sb.from('perfil').select('*').eq('user_id', uid).maybeSingle();
    return data;
  },
  async upsertPerfil(uid, d) {
    const { data, error } = await sb.from('perfil')
      .upsert({ user_id: uid, ...d }, { onConflict: 'user_id' })
      .select().single();
    if (error) throw error;
    return data;
  },

  // ── UPLOAD DE LOGO (Supabase Storage) ── Feature #4 ─────────
  async uploadLogo(uid, file) {
    // Valida tipo e tamanho
    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!ALLOWED.has(file.type)) throw new Error('Formato inválido. Use PNG, JPG ou WEBP.');
    if (file.size > 2_000_000)   throw new Error('Imagem acima de 2MB.');

    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `logos/${uid}/logo.${ext}`;

    const { error } = await sb.storage
      .from('nexos-assets')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;

    const { data } = sb.storage.from('nexos-assets').getPublicUrl(path);
    // Salva URL no perfil
    await API.upsertPerfil(uid, { logo_url: data.publicUrl + '?t=' + Date.now() });
    return data.publicUrl;
  },

  // ── CLIENTES ────────────────────────────────────────────────
  async getClientes(uid) {
    const { data, error } = await sb.from('clientes')
      .select('*').eq('dono_id', uid).order('nome');
    if (error) throw error;
    return data || [];
  },
  async saveCliente(uid, d) {
    const p = {
      dono_id:   uid,
      nome:      d.nome,
      telefone:  d.telefone  || null,
      cpf:       d.cpf       || null,
      email:     d.email     || null,
      endereco:  d.endereco  || null,
      blacklist: d.blacklist || false,
      aniversario: d.aniversario || null,  // Feature #28
      observacoes_cli: d.observacoes_cli || null,
    };
    if (d.id) {
      const { data, error } = await sb.from('clientes')
        .update(p).eq('id', d.id).eq('dono_id', uid).select().single();
      if (error) throw error;
      await API.audit('clientes', 'UPDATE', d.id, { nome: d.nome });
      return data;
    }
    const { data, error } = await sb.from('clientes').insert(p).select().single();
    if (error) throw error;
    await API.audit('clientes', 'INSERT', data.id, { nome: d.nome });
    return data;
  },
  async deleteCliente(uid, id) {
    const { error } = await sb.from('clientes').delete().eq('id', id).eq('dono_id', uid);
    if (error) throw error;
    await API.audit('clientes', 'DELETE', id, {});
  },

  // ── PRODUTOS ────────────────────────────────────────────────
  async getProdutos(uid) {
    const { data, error } = await sb.from('produtos')
      .select('*').eq('dono_id', uid).eq('ativo', true).order('nome');
    if (error) throw error;
    return data || [];
  },
  async saveProduto(uid, d) {
    const p = {
      dono_id:      uid,
      nome:         d.nome,
      codigo:       d.codigo       || null,
      preco_custo:  +d.preco_custo || 0,
      preco_venda:  +d.preco_venda || 0,
      quantidade:   +d.quantidade  || 0,
      estoque_min:  +d.estoque_min || 0,
      ativo:        true,
    };

    if (d.id) {
      // Feature #20: Histórico de preços — registra mudança antes de salvar
      const antigo = await sb.from('produtos').select('preco_venda,preco_custo').eq('id', d.id).single();
      if (antigo.data && (antigo.data.preco_venda !== p.preco_venda || antigo.data.preco_custo !== p.preco_custo)) {
        await sb.from('historico_precos').insert({
          dono_id:       uid,
          produto_id:    d.id,
          preco_custo:   antigo.data.preco_custo,
          preco_venda:   antigo.data.preco_venda,
          novo_custo:    p.preco_custo,
          novo_venda:    p.preco_venda,
          criado_em:     nowISO(),
        }).catch(() => {}); // silencioso se tabela não existir ainda
      }
      const { data, error } = await sb.from('produtos')
        .update(p).eq('id', d.id).eq('dono_id', uid).select().single();
      if (error) throw error;
      await API.audit('produtos', 'UPDATE', d.id, { nome: d.nome, preco_venda: p.preco_venda });
      return data;
    }

    const { data, error } = await sb.from('produtos').insert(p).select().single();
    if (error) throw error;
    await API.audit('produtos', 'INSERT', data.id, { nome: d.nome });
    return data;
  },
  async updateEstoque(uid, id, qtd) {
    const { error } = await sb.from('produtos')
      .update({ quantidade: qtd }).eq('id', id).eq('dono_id', uid);
    if (error) throw error;
  },
  async getHistoricoPrecos(uid, produtoId) {
    const { data } = await sb.from('historico_precos')
      .select('*')
      .eq('dono_id', uid)
      .eq('produto_id', produtoId)
      .order('criado_em', { ascending: false })
      .limit(20);
    return data || [];
  },

  // ── ORDENS DE SERVIÇO ────────────────────────────────────────
  async getOS(uid, limit = 200) {
    const { data, error } = await sb.from('ordens_servico')
      .select('*,clientes(nome,telefone,cpf)')
      .eq('dono_id', uid)
      .order('numero', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },
  async getOSById(id, uid) {
    let q = sb.from('ordens_servico')
      .select('*,clientes(nome,telefone,cpf)')
      .eq('id', id);
    if (uid) q = q.eq('dono_id', uid);
    const { data, error } = await q.single();
    if (error) throw error;
    return data;
  },
  async createOS(uid, d) {
    // FIX: número sequencial único — era Math.random()
    const numero = await gerarNumeroOS(uid);
    const { data, error } = await sb.from('ordens_servico')
      .insert({ dono_id: uid, numero, ...d })
      .select().single();
    if (error) throw error;
    await API.audit('ordens_servico', 'INSERT', data.id, { numero, cliente: d.cliente_nome });
    return data;
  },
  async updateOS(id, uid, d) {
    const { data, error } = await sb.from('ordens_servico')
      .update(d).eq('id', id).eq('dono_id', uid)
      .select().single();
    if (error) throw error;
    await API.audit('ordens_servico', 'UPDATE', id, d);
    return data;
  },
  async deleteOS(id, uid) {
    await sb.from('caixa').delete().eq('ordem_id', id).eq('dono_id', uid);
    await sb.from('parcelas').delete().eq('ordem_id', id).eq('dono_id', uid);
    const { error } = await sb.from('ordens_servico')
      .delete().eq('id', id).eq('dono_id', uid);
    if (error) throw error;
    await API.audit('ordens_servico', 'DELETE', id, {});
  },
  async addHistorico(osId, texto) {
    const uid = STATE.user?.id;
    const os  = await API.getOSById(osId, uid);
    let hist = [];
    try { hist = JSON.parse(os.historico || '[]'); } catch {}
    hist.push({ at: nowISO(), txt: texto, por: STATE.perfil?.empresa_nome || 'Sistema' });
    await API.updateOS(osId, uid, { historico: JSON.stringify(hist) });
  },

  // ── ORÇAMENTOS ── Feature #13 ────────────────────────────────
  async getOrcamentos(uid) {
    const { data, error } = await sb.from('ordens_servico')
      .select('*,clientes(nome,telefone)')
      .eq('dono_id', uid)
      .eq('status', 'orcamento')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async aprovarOrcamento(id, uid) {
    return await API.updateOS(id, uid, { status: 'aguardando' });
  },
  async recusarOrcamento(id, uid) {
    return await API.updateOS(id, uid, { status: 'cancelado' });
  },

  // ── CAIXA ────────────────────────────────────────────────────
  async getCaixa(uid, data_inicio, data_fim) {
    let q = sb.from('caixa').select('*').eq('dono_id', uid)
      .order('criado_em', { ascending: false });
    if (data_inicio) q = q.gte('data', data_inicio);
    if (data_fim)    q = q.lte('data', data_fim);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async addCaixa(uid, d) {
    const { data, error } = await sb.from('caixa')
      .insert({ dono_id: uid, data: today(), ...d })
      .select().single();
    if (error) throw error;
    return data;
  },
  async deleteCaixa(uid, id) {
    const { error } = await sb.from('caixa').delete().eq('id', id).eq('dono_id', uid);
    if (error) throw error;
    await API.audit('caixa', 'DELETE', id, {});
  },

  // ── AGENDA ───────────────────────────────────────────────────
  async getAgenda(uid, from, to) {
    let q = sb.from('agenda')
      .select('*,clientes(nome,telefone)')
      .eq('dono_id', uid)
      .order('data_inicio');
    if (from) q = q.gte('data_inicio', from);
    if (to)   q = q.lte('data_inicio', to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async saveEvento(uid, d) {
    const { id, ...payload } = d;
    const p = { dono_id: uid, ...payload };

    // FIX CRÍTICO: era if(id){update} insert — sempre executava insert ao editar
    if (id) {
      const { data, error } = await sb.from('agenda')
        .update(p).eq('id', id).eq('dono_id', uid)
        .select().single();
      if (error) throw error;
      await API.audit('agenda', 'UPDATE', id, { titulo: d.titulo });
      return data; // ← return faltava aqui
    }
    const { data, error } = await sb.from('agenda').insert(p).select().single();
    if (error) throw error;
    await API.audit('agenda', 'INSERT', data.id, { titulo: d.titulo });
    return data;
  },
  async deleteEvento(uid, id) {
    const { error } = await sb.from('agenda').delete().eq('id', id).eq('dono_id', uid);
    if (error) throw error;
    await API.audit('agenda', 'DELETE', id, {});
  },

  // ── CHECKLISTS ── Feature #22 ────────────────────────────────
  async getChecklists(uid) {
    const { data } = await sb.from('checklists')
      .select('*').eq('dono_id', uid).order('nome');
    return data || [];
  },
  async saveChecklist(uid, d) {
    const p = { dono_id: uid, nome: d.nome, itens: JSON.stringify(d.itens || []) };
    if (d.id) {
      const { data, error } = await sb.from('checklists')
        .update(p).eq('id', d.id).eq('dono_id', uid).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb.from('checklists').insert(p).select().single();
    if (error) throw error;
    return data;
  },

  // ── GARANTIAS ── Feature #25 ─────────────────────────────────
  async verificarGarantia(osId) {
    const { data } = await sb.from('ordens_servico')
      .select('garantia_dias,criado_em,numero,cliente_nome')
      .eq('id', osId).single();
    if (!data || !data.garantia_dias) return null;
    const fim = new Date(data.criado_em);
    fim.setDate(fim.getDate() + data.garantia_dias);
    return {
      valida:    new Date() <= fim,
      vence_em:  fim.toISOString().slice(0, 10),
      dias:      data.garantia_dias,
    };
  },

  // ── PARCELAS / CARNÊ ─────────────────────────────────────────
  async getParcelas(uid, vencidas = false) {
    let q = sb.from('parcelas')
      .select('*,ordens_servico(numero,clientes(nome,telefone))')
      .eq('dono_id', uid).eq('pago', false)
      .order('vencimento');
    if (vencidas) q = q.lt('vencimento', today());
    const { data } = await q;
    return data || [];
  },
  async pagarParcela(uid, id, valor, ordemId) {
    const { error } = await sb.from('parcelas')
      .update({ pago: true, pago_em: today() })
      .eq('id', id).eq('dono_id', uid);
    if (error) throw error;
    const p = await sb.from('parcelas').select('numero,total').eq('id', id).single();
    await API.addCaixa(uid, {
      tipo: 'entrada',
      descricao: `Parcela ${p.data?.numero || '?'}/${p.data?.total || '?'}`,
      valor, forma: 'carne', ordem_id: ordemId,
    });
    await API.audit('parcelas', 'PAGAR', id, { valor });
  },

  // ── DASHBOARD ────────────────────────────────────────────────
  async getDashboard(uid) {
    const mes = today().slice(0, 7);
    const [os, caixa, agenda, parcVenc] = await Promise.all([
      sb.from('ordens_servico').select('status,valor_total,criado_em')
        .eq('dono_id', uid).gte('criado_em', mes + '-01'),
      sb.from('caixa').select('tipo,valor')
        .eq('dono_id', uid).gte('data', mes + '-01'),
      API.getAgenda(uid, today() + 'T00:00:00', today() + 'T23:59:59'),
      API.getParcelas(uid, true),
    ]);
    const osData = os.data   || [];
    const cxData = caixa.data || [];
    const pagas  = osData.filter(o => ['concluido', 'retirada'].includes(o.status));
    const fat    = pagas.reduce((s, o) => s + (+o.valor_total || 0), 0);
    const saidas = cxData.filter(c => c.tipo === 'saida').reduce((s, c) => s + (+c.valor || 0), 0);

    // Feature #19: meta mensal
    const meta = STATE.perfil?.meta_mensal || 0;

    return {
      faturamento:        fat,
      lucro:              fat - saidas,
      os_abertas:         osData.filter(o => ['aguardando', 'andamento', 'retirada'].includes(o.status)).length,
      agenda_hoje:        agenda,
      parcelas_vencidas:  parcVenc.length,
      meta,
      meta_pct:           meta > 0 ? Math.min(100, (fat / meta) * 100) : 0,
    };
  },

  // ── LOG DE AUDITORIA ── Feature #39 ──────────────────────────
  async audit(tabela, operacao, registro_id, dados) {
    try {
      await sb.from('audit_log').insert({
        dono_id:    STATE.user?.id,
        tabela,
        operacao,
        registro_id: String(registro_id),
        dados:       JSON.stringify(dados),
        ip_hint:     null, // frontend não tem acesso ao IP real
        criado_em:   nowISO(),
      });
    } catch { /* silencioso — não pode travar operações */ }
  },
  async getAuditLog(uid, limit = 50) {
    const { data } = await sb.from('audit_log')
      .select('*').eq('dono_id', uid)
      .order('criado_em', { ascending: false })
      .limit(limit);
    return data || [];
  },

  // ── BACKUP COMPLETO ── Feature #40 ───────────────────────────
  async gerarBackup(uid) {
    const [os, clientes, produtos, caixa, agenda, parcelas] = await Promise.all([
      API.getOS(uid, 9999),
      API.getClientes(uid),
      API.getProdutos(uid),
      API.getCaixa(uid, '2000-01-01', '2099-12-31'),
      API.getAgenda(uid, '2000-01-01', '2099-12-31'),
      sb.from('parcelas').select('*').eq('dono_id', uid).then(r => r.data || []),
    ]);
    return {
      versao:      'nexos-v5',
      exportado_em: nowISO(),
      usuario:     STATE.user?.email,
      empresa:     STATE.perfil?.empresa_nome,
      os, clientes, produtos, caixa, agenda, parcelas,
    };
  },

  // ── ANIVERSARIANTES DO MÊS ── Feature #28 ────────────────────
  async getAniversariantesHoje(uid) {
    const hoje = today().slice(5); // MM-DD
    const { data } = await sb.from('clientes')
      .select('id,nome,telefone,aniversario')
      .eq('dono_id', uid)
      .not('aniversario', 'is', null);
    if (!data) return [];
    return data.filter(c => c.aniversario && c.aniversario.slice(5) === hoje);
  },

  // ── WHATSAPP LINK ────────────────────────────────────────────
  buildWALink(tel, msg) {
    const num  = (tel || '').replace(/\D/g, '');
    const fone = num.startsWith('55') ? num : '55' + num;
    return `https://wa.me/${fone}?text=${encodeURIComponent(msg)}`;
  },
};

window.API    = API;
window.UI     = UI;
window.gerarPixBRCode = gerarPixBRCode;
