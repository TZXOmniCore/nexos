/* ============================================================
   NexOS v4.0 — api.js
   ============================================================ */
'use strict';

// ── UTILS ─────────────────────────────────────────────────
function fmt(v) {
  const num = parseFloat(v) || 0;
  return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtBRL(v) { return fmt(v); }
function fmtDate(d) { return d ? new Date(d.includes('T')?d:d+'T12:00:00').toLocaleDateString('pt-BR') : '—'; }
function fmtDatetime(d) { return d ? new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'; }
function fDateFull(d) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fTime(d) { return d ? new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''; }
function pad(n) { return String(n).padStart(2,'0'); }
const today = () => new Date().toISOString().split('T')[0];
const nowISO = () => new Date().toISOString();
const initials = n => (n||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);

// Status
const STATUS_CONFIG = {
  aguardando: { label:'Aguardando',         color:'var(--yellow)' },
  andamento:  { label:'Em Andamento',       color:'var(--blue)'   },
  concluido:  { label:'Concluído',          color:'var(--green)'  },
  retirada:   { label:'Pronto p/ Retirada', color:'var(--orange)' },
  cancelado:  { label:'Cancelado',          color:'var(--red)'    },
  fiado:      { label:'Fiado',              color:'var(--purple)' },
  orcamento:  { label:'Orçamento',          color:'var(--text-2)' },
};
const PAY_CONFIG = {
  dinheiro:     { label:'Dinheiro'       },
  pix:          { label:'PIX'            },
  credito:      { label:'Crédito'        },
  debito:       { label:'Débito'         },
  fiado:        { label:'Fiado'          },
  carne:        { label:'Carnê'          },
  transferencia:{ label:'Transferência'  },
  aguardando:   { label:'Aguardando Pag.' },
};
function statusLabel(s) { return STATUS_CONFIG[s]?.label || s || '—'; }
function statusColor(s) { return STATUS_CONFIG[s]?.color || 'var(--text-2)'; }
function payLabel(p)    { return PAY_CONFIG[p]?.label   || p || '—'; }
function pagLabel(p)    { return payLabel(p); }
function slabel(s)      { return statusLabel(s); }
function statusBgColor(s){return{concluido:'#059669',aguardando:'#d97706',andamento:'#0ea5e9',retirada:'#ea580c',cancelado:'#64748b',fiado:'#7c3aed',paga:'#059669',aberta:'#d97706'}[s]||'#0ea5e9';}

// Calcular hash único para documentos (não sequencial)
function genHash(seed) {
  const ts = Date.now().toString(36).toUpperCase();
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) { h = ((h << 5) - h) + String(seed).charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).toUpperCase().padStart(6,'0') + '-' + ts;
}
function isEmptySig(cv) {
  if (!cv || cv.width === 0 || cv.height === 0) return true;
  const d = cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
  for (let i=3;i<d.length;i+=4) if(d[i]>0) return false;
  return true;
}
function isVenc(d) { return d && d < today(); }

// ── UI ─────────────────────────────────────────────────────
const UI = {
  toast(msg, type='info') {
    const c = document.getElementById('toast-container'); if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 3200);
  },
  confirm(msg, onYes, dangerous=false) {
    const id = 'cm_'+Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = 'modal-wrap open';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-xl);width:100%;max-width:380px;overflow:hidden">
      <div style="padding:20px 22px 14px"><p style="font-size:.9rem;line-height:1.55">${msg}</p></div>
      <div style="padding:12px 22px 18px;display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-ghost" onclick="document.getElementById('${id}').remove()">Cancelar</button>
        <button class="btn ${dangerous?'btn-danger':'btn-primary'}" id="${id}-ok">Confirmar</button>
      </div></div>`;
    document.body.appendChild(el);
    document.getElementById(id+'-ok').onclick = () => { el.remove(); onYes(); };
  },
  // Confirmação protegida por senha mestre
  async confirmSecure(msg, onYes) {
    const id = 'sec_'+Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="background:var(--bg-1);border:1px solid var(--border-md);border-radius:var(--radius-xl);width:100%;max-width:380px;padding:24px">
      <div style="font-size:1rem;font-weight:700;margin-bottom:6px">🔐 Ação Protegida</div>
      <p style="font-size:.84rem;color:var(--text-2);margin-bottom:16px">${msg}</p>
      <label style="font-size:.75rem;color:var(--text-2);margin-bottom:6px;display:block">Digite sua senha para confirmar:</label>
      <input type="password" id="${id}-pw" class="form-control" placeholder="Senha da conta" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('${id}').remove()">Cancelar</button>
        <button class="btn btn-danger" id="${id}-ok">Confirmar</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    document.getElementById(id+'-pw').focus();
    document.getElementById(id+'-ok').onclick = async () => {
      const pw = document.getElementById(id+'-pw').value;
      if (!pw) { UI.toast('Digite a senha','warning'); return; }
      try {
        const {error} = await window.sb.auth.signInWithPassword({email:STATE.user.email, password:pw});
        if (error) { UI.toast('Senha incorreta','error'); return; }
        el.remove();
        onYes();
      } catch { UI.toast('Erro de verificação','error'); }
    };
  },
  setPageTitle(t) { const el=document.getElementById('header-title'); if(el) el.textContent=t; },
};

// ── SUPABASE ───────────────────────────────────────────────
const SB_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

window.sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession:true, autoRefreshToken:true, storageKey:'nexos_v4_auth', flowType:'pkce', detectSessionInUrl:true }
});

window.STATE = { user:null, perfil:null, empresa:null, currency:'BRL' };

// ── API ────────────────────────────────────────────────────
const API = {

  // PERFIL
  async getPerfil(uid) {
    const {data} = await sb.from('perfil').select('*').eq('user_id',uid).maybeSingle();
    return data;
  },
  async upsertPerfil(uid, d) {
    const {data,error} = await sb.from('perfil').upsert({user_id:uid,...d},{onConflict:'user_id'}).select().single();
    if(error) throw error;
    return data;
  },

  // CLIENTES
  async getClientes(uid) {
    const {data,error} = await sb.from('clientes').select('*').eq('dono_id',uid).order('nome');
    if(error) throw error;
    return data||[];
  },
  async saveCliente(uid, d) {
    const p = {dono_id:uid,nome:d.nome,telefone:d.telefone||null,cpf:d.cpf||null,email:d.email||null,endereco:d.endereco||null};
    if(d.id) {
      const {data,error} = await sb.from('clientes').update(p).eq('id',d.id).eq('dono_id',uid).select().single();
      if(error) throw error; return data;
    }
    const {data,error} = await sb.from('clientes').insert(p).select().single();
    if(error) throw error; return data;
  },
  async deleteCliente(uid,id) {
    const {error} = await sb.from('clientes').delete().eq('id',id).eq('dono_id',uid);
    if(error) throw error;
  },

  // PRODUTOS
  async getProdutos(uid) {
    const {data,error} = await sb.from('produtos').select('*').eq('dono_id',uid).eq('ativo',true).order('nome');
    if(error) throw error;
    return data||[];
  },
  async saveProduto(uid, d) {
    const p = {dono_id:uid,nome:d.nome,codigo:d.codigo||null,preco_custo:+d.preco_custo||0,preco_venda:+d.preco_venda||0,quantidade:+d.quantidade||0,estoque_min:+d.estoque_min||0,ativo:true};
    if(d.id) {
      const {data,error} = await sb.from('produtos').update(p).eq('id',d.id).eq('dono_id',uid).select().single();
      if(error) throw error; return data;
    }
    const {data,error} = await sb.from('produtos').insert(p).select().single();
    if(error) throw error; return data;
  },
  async updateEstoque(id,qtd) {
    const {error} = await sb.from('produtos').update({quantidade:qtd}).eq('id',id);
    if(error) throw error;
  },
  async updateEstoque(uid,id,qtd) {
    const {error} = await sb.from('produtos').update({quantidade:qtd}).eq('id',id).eq('dono_id',uid);
    if(error) throw error;
  },

  // ORDENS DE SERVIÇO
  async getOS(uid, limit=200) {
    const {data,error} = await sb.from('ordens_servico').select('*,clientes(nome,telefone,cpf)').eq('dono_id',uid).order('numero',{ascending:false}).limit(limit);
    if(error) throw error;
    return data||[];
  },
   async getOSById(id, uid) {
    let q = sb.from('ordens_servico').select('*,clientes(nome,telefone,cpf)').eq('id',id);
    if (uid) q = q.eq('dono_id', uid);
    const {data,error} = await q.single();
  },
  async createOS(uid, d) {
    // Número aleatório de 5 dígitos único
    const numero = Math.floor(10000 + Math.random() * 90000);
    const {data,error} = await sb.from('ordens_servico').insert({dono_id:uid, numero, ...d}).select().single();
    if(error) throw error;
    return data;
  },
  async updateOS(id,uid,d) {
    const {data,error} = await sb.from('ordens_servico').update(d).eq('id',id).eq('dono_id',uid).select().single();
    if(error) throw error;
    return data;
  },
  async deleteOS(id,uid) {
    await sb.from('caixa').delete().eq('ordem_id',id).eq('dono_id',uid);
   await sb.from('parcelas').delete().eq('ordem_id',id).eq('dono_id',uid);
    const {error} = await sb.from('ordens_servico').delete().eq('id',id).eq('dono_id',uid);
    if(error) throw error;
  },
  async addHistorico(osId, texto) {
    const uid = STATE.user?.id;
    const os = await API.getOSById(osId, uid);
    let hist = [];
    try { hist = JSON.parse(os.historico||'[]'); } catch {}
    hist.push({at:nowISO(), txt:texto, por:STATE.perfil?.empresa_nome||'Sistema'});
    await API.updateOS(osId,uid,{historico:JSON.stringify(hist)});
  },

  // CAIXA
  async getCaixa(uid,data_inicio,data_fim) {
    let q = sb.from('caixa').select('*').eq('dono_id',uid).order('criado_em',{ascending:false});
    if(data_inicio) q = q.gte('data',data_inicio);
    if(data_fim)    q = q.lte('data',data_fim);
    const {data,error} = await q;
    if(error) throw error;
    return data||[];
  },
  async addCaixa(uid,d) {
    const {data,error} = await sb.from('caixa').insert({dono_id:uid,data:today(),...d}).select().single();
    if(error) throw error;
    return data;
  },
  async deleteCaixa(uid,id) {
    const {error} = await sb.from('caixa').delete().eq('id',id).eq('dono_id',uid);
    if(error) throw error;
  },

  // AGENDA
  async getAgenda(uid,from,to) {
    let q = sb.from('agenda').select('*,clientes(nome,telefone)').eq('dono_id',uid).order('data_inicio');
    if(from) q = q.gte('data_inicio',from);
    if(to)   q = q.lte('data_inicio',to);
    const {data,error} = await q;
    if(error) throw error;
    return data||[];
  },
  async saveEvento(uid,d) {
    const p = {dono_id:uid,...d};
    if(d.id) {
      const {data,error} = await sb.from('agenda').update(p).eq('id',d.id).eq('dono_id',uid).select().single();
      if(error) throw error; return data;
    }
    const {data,error} = await sb.from('agenda').insert(p).select().single();
    if(error) throw error; return data;
  },
  async deleteEvento(uid,id) {
    const {error} = await sb.from('agenda').delete().eq('id',id).eq('dono_id',uid);
    if(error) throw error;
  },

  // PARCELAS / CARNÊ
  async getParcelas(uid,vencidas=false) {
    let q = sb.from('parcelas').select('*,ordens_servico(numero,clientes(nome,telefone))').eq('dono_id',uid).eq('pago',false).order('vencimento');
    if(vencidas) q = q.lt('vencimento',today());
    const {data} = await q;
    return data||[];
  },
  async pagarParcela(uid,id,valor,ordemId) {
    const {error} = await sb.from('parcelas').update({pago:true,pago_em:today()}).eq('id',id).eq('dono_id',uid);
    if(error) throw error;
    const p = await sb.from('parcelas').select('numero,total').eq('id',id).single();
    await API.addCaixa(uid,{tipo:'entrada',descricao:`Parcela ${p.data?.numero||'?'}/${p.data?.total||'?'}`,valor,forma:'carne',ordem_id:ordemId});
  },

  // DASHBOARD
  async getDashboard(uid) {
    const mes = today().slice(0,7);
    const [os, caixa, agenda, parcVenc] = await Promise.all([
      sb.from('ordens_servico').select('status,valor_total,criado_em').eq('dono_id',uid).gte('criado_em',mes+'-01'),
      sb.from('caixa').select('tipo,valor').eq('dono_id',uid).gte('data',mes+'-01'),
      API.getAgenda(uid,today()+'T00:00:00',today()+'T23:59:59'),
      API.getParcelas(uid,true),
    ]);
    const osData = os.data||[];
    const cxData = caixa.data||[];
    const pagas  = osData.filter(o=>['concluido','retirada'].includes(o.status));
    const fat    = pagas.reduce((s,o)=>s+(+o.valor_total||0),0);
    const saidas = cxData.filter(c=>c.tipo==='saida').reduce((s,c)=>s+(+c.valor||0),0);
    return {
      faturamento: fat,
      lucro: fat-saidas,
      os_abertas: osData.filter(o=>['aguardando','andamento','retirada'].includes(o.status)).length,
      agenda_hoje: agenda,
      parcelas_vencidas: parcVenc.length,
    };
  },

  // WA Link
  buildWALink(tel,msg) {
    const num = (tel||'').replace(/\D/g,'');
    const fone = num.startsWith('55')?num:'55'+num;
    return `https://wa.me/${fone}?text=${encodeURIComponent(msg)}`;
  },
};

window.API = API;
window.UI  = UI;
