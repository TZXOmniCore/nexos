/* ============================================================
   NexOS v4.0 — app.js | Nav v3.5 + Forms V_TEST
   ============================================================ */
'use strict';

// ── Estado local ───────────────────────────────────────────
const APP = { os:[], clientes:[], produtos:[], agenda:[], _page:'dashboard' };

// ── Sanitização ────────────────────────────────────────────
function _c(s,n)  { return typeof s==='string'?s.trim().slice(0,n||300).replace(/[<>"'`]/g,''):''; }
function _n(s,mn,mx){ const v=parseFloat(s); return isNaN(v)?0:Math.min(Math.max(v,mn??0),mx??9999999); }
function _e(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function gv(id,d) { const el=document.getElementById(id);return el?el.value:(d!==undefined?d:''); }
function gi(id,d) { const v=parseInt(gv(id,''));return isNaN(v)?(d||0):v; }
function gn(id,d) { const v=parseFloat(gv(id,''));return isNaN(v)?(d||0):v; }

// Calcular margem
function calcMargem(custo,venda){ return venda>0?((((venda-custo)/venda)*100).toFixed(0)):0; }

// ── Navegação (estilo v3.5) ────────────────────────────────
const PAGE_TITLES = {
  dashboard:'Dashboard', os:'Ordens de Serviço', clientes:'Clientes',
  estoque:'Estoque', caixa:'Caixa', agenda:'Agenda', config:'Configurações',
  carnes:'Carnês',
  'nova-os':'Nova OS', 'ver-os':'OS', 'novo-cliente':'Novo Cliente',
  'novo-produto':'Novo Produto', 'novo-evento':'Novo Evento',
};

// Páginas secundárias (não aparecem no nav)
const SECONDARY_PAGES = ['nova-os','ver-os','novo-cliente','novo-produto','novo-evento'];

let _prevPage = 'dashboard';
let _verOsId  = null;

function goPage(page, opts={}) {
  // Guardar página anterior para goBack
  if(!SECONDARY_PAGES.includes(APP._page)) _prevPage = APP._page;
  APP._page = page;
  // Ativar página no DOM
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+page);if(pg)pg.classList.add('active');
  // Nav — só atualizar para páginas principais
  const navPage = SECONDARY_PAGES.includes(page) ? _prevPage : page;
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===navPage));
  document.querySelectorAll('.mobile-nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===navPage));
  // FAB — esconder em páginas de formulário
  const fab=document.getElementById('fab');
  if(fab) fab.style.display=(!SECONDARY_PAGES.includes(page)&&['os','clientes','estoque','agenda'].includes(page))?'flex':'none';
  // Título
  UI.setPageTitle(PAGE_TITLES[page]||page);
  if(!SECONDARY_PAGES.includes(page)) localStorage.setItem('nexos_v4_page',page);
  // Scroll topo
  const pc=document.getElementById('page-content');if(pc)pc.scrollTop=0;
  // Render
  const r={
    dashboard:renderDash, os:renderOS, clientes:renderClientes,
    estoque:renderEstoque, caixa:renderCaixa, agenda:renderAgenda,
    config:renderConfig, carnes:renderCarnes,
  };
  if(r[page]) r[page]();
  // Reiniciar lucide
  if(window.lucide) lucide.createIcons();
}

function goBack() {
  goPage(_prevPage);
}

function fabAction() {
  const a={os:novaOS, clientes:novoCliente, estoque:novoProduto, agenda:novoEvento};
  if(a[APP._page]) a[APP._page]();
}

// ── Modal V_TEST ───────────────────────────────────────────
function openModal(html) {
  const mb=document.getElementById('mbody');if(!mb)return;
  mb.innerHTML=html;
  document.getElementById('mwrap').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal() {
  document.getElementById('mwrap')?.classList.remove('open');
  document.body.style.overflow='';
}

// ── App init ───────────────────────────────────────────────
const App = {
  async init() {
    try {
      [APP.os, APP.clientes, APP.produtos, APP.agenda] = await Promise.all([
        API.getOS(STATE.user.id),
        API.getClientes(STATE.user.id),
        API.getProdutos(STATE.user.id),
        API.getAgenda(STATE.user.id, today()+'T00:00:00', today()+'T23:59:59'),
      ]);
    } catch(e){ console.error('App.init error:',e); }
    this._ui();
    // Verificar agenda do dia
    this._agendaAlert();
    // Verificar carnês vencidos
    this._carnesAlert();
    const last = localStorage.getItem('nexos_v4_page')||'dashboard';
    // Não restaurar páginas de formulário
    goPage(SECONDARY_PAGES.includes(last)?'dashboard':last);
    if(window.lucide) lucide.createIcons();
  },
  _ui() {
    const p=STATE.perfil||{};
    const nome=p.empresa_nome||STATE.user?.email||'NexOS';
    const ini=initials(nome);
    ['sidebar-avatar','header-avatar'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=ini;});
    const sn=document.getElementById('sidebar-name');if(sn)sn.textContent=nome;
    const sr=document.getElementById('sidebar-role');if(sr)sr.textContent='Proprietário';
  },
  async _agendaAlert() {
    if(!APP.agenda.length) return;
    const msg=APP.agenda.map(e=>`• ${e.titulo} ${e.hora?'às '+e.hora:''}`).join('\n');
    if(APP.agenda.length>0) UI.toast(`📅 ${APP.agenda.length} compromisso(s) hoje`,'info');
    // Notificação nativa
    if('Notification'in window&&Notification.permission==='granted') {
      new Notification('NexOS — Agenda de Hoje',{body:msg,icon:'NexOS.png'});
    }
  },
  async _carnesAlert() {
    try {
      const vencidas = await API.getParcelas(STATE.user.id,true);
      if(vencidas.length>0) UI.toast(`⚠️ ${vencidas.length} parcela(s) vencida(s)`,'warning');
    } catch{}
  },
};

// ════════════════════════════════════════════════════════════
// DASHBOARD — dados reais, sem gráficos
// ════════════════════════════════════════════════════════════
async function renderDash() {
  try {
    const d = await API.getDashboard(STATE.user.id);
    // KPIs
    const kf=document.getElementById('kpi-fat');if(kf)kf.textContent=fmt(d.faturamento);
    const kl=document.getElementById('kpi-lucro');if(kl)kl.textContent=fmt(d.lucro);
    const ko=document.getElementById('kpi-os');if(ko)ko.textContent=d.os_abertas;
    // Alertas
    const ka=document.getElementById('kpi-alertas');
    if(ka){
      const bx=APP.produtos.filter(p=>p.quantidade<=(p.estoque_min||0)).length;
      ka.textContent=(d.parcelas_vencidas+bx)||'✓';
      ka.style.color=(d.parcelas_vencidas+bx)>0?'var(--red)':'var(--green)';
    }
    // OS recentes
    const box=document.getElementById('dash-os-list');if(!box)return;
    const recent=APP.os.slice(0,8);
    if(!recent.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma OS ainda</div><button class="btn btn-primary mt-3" onclick="novaOS()">+ Nova OS</button></div>';return;}
    box.innerHTML=recent.map(o=>`
      <div class="os-item s-${_normSt(o.status)}" onclick="verOS('${o.id}')">
        <div class="osi-top">
          <div class="osi-num">OS #${o.numero||'?'}</div>
          <span class="sbadge sb-${_normSt(o.status)}">${statusLabel(o.status)}</span>
        </div>
        <div class="osi-name">${_e(o.clientes?.nome||o.cliente_nome||'–')}</div>
        <div class="osi-desc">${_e(o.equipamento||o.item||'')}${o.defeito?' · '+_e(o.defeito.slice(0,35)):''}</div>
        <div class="osi-meta">
          <span class="pay-pill pp-${o.forma_pagamento||''}">${payLabel(o.forma_pagamento)}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${fmtDate(o.criado_em)}</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);margin-left:auto">${fmt(o.valor_total)}</span>
        </div>
      </div>`).join('');
    // Agenda hoje
    const agb=document.getElementById('dash-agenda');
    if(agb&&d.agenda_hoje.length){
      agb.innerHTML=d.agenda_hoje.map(e=>`
        <div class="agenda-item">
          <div class="agenda-dot" style="background:${e.cor||'var(--blue)'}"></div>
          <div class="agenda-info">
            <div class="agenda-title">${_e(e.titulo)}</div>
            <div class="agenda-time">${e.hora||'Dia todo'}${e.clientes?.nome?' · '+_e(e.clientes.nome):''}</div>
          </div>
        </div>`).join('');
    } else if(agb) {
      agb.innerHTML='<p style="font-size:.8rem;color:var(--text-3)">Sem compromissos hoje</p>';
    }
  } catch(e){ console.error('renderDash:',e); }
}

function _normSt(s){return{concluido:'concluido',retirada:'concluido',aguardando:'aguardando',andamento:'andamento',cancelado:'cancelado',fiado:'fiado'}[s]||s||'aguardando';}
function _sbStBack(s){return{paga:'concluido',aberta:'aguardando',fiado:'fiado',cancelada:'cancelado',parcial:'andamento'}[s]||'aguardando';}

// ════════════════════════════════════════════════════════════
// ORDENS DE SERVIÇO — lista estilo V_TEST
// ════════════════════════════════════════════════════════════
let _osFilter='all', _newItens=[], _newFotos=[], _curPay='', _sigDraw=false, _sigLX=0, _sigLY=0;

function renderOS() {
  const box=document.getElementById('os-list');if(!box)return;
  const q=gv('os-search','').toLowerCase();
  let list=[...APP.os];
  if(_osFilter!=='all') list=list.filter(o=>o.status===_osFilter);
  if(q) list=list.filter(o=>(o.clientes?.nome||o.cliente_nome||'').toLowerCase().includes(q)||String(o.numero||'').includes(q)||(o.equipamento||o.item||'').toLowerCase().includes(q));
  const cnt=document.getElementById('os-count');if(cnt)cnt.textContent=list.length+' registro'+(list.length!==1?'s':'');
  if(!list.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">'+(APP.os.length?'Nenhuma OS neste filtro':'Nenhuma OS ainda')+'</div>'+(APP.os.length?'':`<button class="btn btn-primary mt-3" onclick="novaOS()">+ Nova OS</button>`)+'</div>';return;}
  box.innerHTML=list.map(o=>{
    const st=_normSt(o.status);
    return`<div class="os-item s-${st}" onclick="verOS('${o.id}')">
      <div class="osi-top">
        <div class="osi-num">OS #${o.numero||'?'}</div>
        <span class="sbadge sb-${st}">${statusLabel(o.status)}</span>
      </div>
      <div class="osi-name">${_e(o.clientes?.nome||o.cliente_nome||'–')}</div>
      <div class="osi-desc">${_e(o.equipamento||o.item||'')}${o.defeito?' · '+_e(o.defeito.slice(0,40)):''}</div>
      <div class="osi-meta">
        <span class="pay-pill pp-${o.forma_pagamento||''}">${payLabel(o.forma_pagamento)}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${fmtDate(o.criado_em)}</span>
        <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);margin-left:auto">${fmt(o.valor_total)}</span>
      </div>
    </div>`;
  }).join('');
}

function setOsFilter(f,el) {
  _osFilter=f;
  document.querySelectorAll('.filter-chips .chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  renderOS();
}

// ── Nova OS — navega para página nova-os ─────────────────────
function novaOS() {
  _newItens=[]; _newFotos=[]; _curPay='';
  // Preencher select de clientes na página
  const sel=document.getElementById('m-cli-id');
  if(sel){
    sel.innerHTML='<option value="">– Sem cadastro –</option>'+APP.clientes.map(c=>`<option value="${c.id}">${_e(c.nome)}</option>`).join('');
  }
  // Limpar campos
  ['m-cli-nome','m-cli-tel','m-cli-doc','m-equip','m-defeito','m-diag','m-obs','m-pago','m-troco'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['m-mao-obra'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0';});
  document.getElementById('m-status').value='paga';
  document.getElementById('m-tipo').value='servico';
  // Chips de pagamento
  document.querySelectorAll('.pchip').forEach(c=>c.className='pchip');
  _curPay='';
  document.getElementById('carneConfig').style.display='none';
  document.getElementById('fiadoWarn').style.display='none';
  // Itens
  const box=document.getElementById('m-itens-rows');if(box)box.innerHTML='<p style="font-size:12px;color:var(--text-3);padding:8px 4px">Nenhum item adicionado</p>';
  document.getElementById('m-total').textContent='R$ 0,00';
  // Fotos
  const pg=document.getElementById('m-photo-grid');if(pg)pg.innerHTML='';
  // Título
  const t=document.getElementById('nova-os-title');if(t)t.textContent='Nova OS';
  // Data/hora atual
  const md=document.getElementById('m-data');
  if(md){const n=new Date();md.value=n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate())+'T'+pad(n.getHours())+':'+pad(n.getMinutes());}
  goPage('nova-os');
  setTimeout(()=>{initSig();if(window.lucide)lucide.createIcons();},150);
}

// ── Itens ─────────────────────────────────────────────────
function addOSItem() {
  const desc=gv('m-i-desc','').trim();
  const qty=gn('m-i-qty',1)||1;
  const preco=gn('m-i-preco',0);
  if(!desc){UI.toast('Descreva o item','warning');return;}
  _newItens.push({desc,qty,preco});
  document.getElementById('m-i-desc').value='';
  document.getElementById('m-i-qty').value='1';
  document.getElementById('m-i-preco').value='';
  renderOSItens();
}
function renderOSItens() {
  const box=document.getElementById('m-itens-rows');if(!box)return;
  if(!_newItens.length){box.innerHTML='<p style="font-size:12px;color:var(--text-3);padding:8px 4px;font-family:var(--mono)">Nenhum item</p>';recalcTotalOS();return;}
  box.innerHTML=_newItens.map((it,i)=>`
    <div class="it-row">
      <span style="font-size:13px">${_e(it.desc)}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">x${it.qty}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt(it.qty*it.preco)}</span>
      <button class="it-del" onclick="_newItens.splice(${i},1);renderOSItens()">✕</button>
    </div>`).join('');
  recalcTotalOS();
}
function recalcTotalOS() {
  const t=_newItens.reduce((a,i)=>a+i.qty*i.preco,0)+gn('m-mao-obra',0);
  const el=document.getElementById('m-total');if(el)el.textContent=fmt(t);
}
function addDoEstoque() {
  const sel=APP.produtos.filter(p=>p.quantidade>0);
  if(!sel.length){UI.toast('Estoque vazio','warning');return;}
  openModal('<h3 style="margin-bottom:14px;font-size:18px;font-weight:700">📦 Adicionar do Estoque</h3>'
    +sel.map(p=>`<div class="prod-item" onclick="_addItemEst('${p.id}')">
      <div style="display:flex;justify-content:space-between"><span style="font-weight:600">${_e(p.nome)}</span><span style="color:var(--green);font-family:var(--mono)">${fmt(p.preco_venda)}</span></div>
      <div style="font-size:11px;color:var(--text-2);font-family:var(--mono)">Estoque: ${p.quantidade} | Custo: ${fmt(p.preco_custo)}</div>
    </div>`).join('')
    +'<button class="btn btn-ghost btn-sm" onclick="novaOS()" style="margin-top:8px">← Voltar</button>');
}
function _addItemEst(id) {
  const p=APP.produtos.find(x=>x.id===id);if(!p)return;
  _newItens.push({desc:p.nome,qty:1,preco:p.preco_venda||0,produto_id:id,preco_custo:p.preco_custo||0});
  UI.toast('Adicionado: '+p.nome,'success');
  novaOS(); // reabrir form com estado atual
  setTimeout(renderOSItens,60);
}

// ── Pagamento (idêntico V_TEST) ───────────────────────────
function setPay(p,el) {
  _curPay=p;
  document.querySelectorAll('.pchip').forEach(c=>c.className='pchip');
  el.classList.add('p-'+p);
  document.getElementById('fiadoWarn').style.display=p==='fiado'?'block':'none';
  document.getElementById('carneConfig').style.display=p==='carne'?'block':'none';
  if(p==='carne')calcCarne();
}
function calcTrocoOS() {
  const paid=gn('m-pago',0);
  const total=_newItens.reduce((a,i)=>a+i.qty*i.preco,0)+gn('m-mao-obra',0);
  const tr=document.getElementById('m-troco');if(tr)tr.value=Math.max(0,paid-total).toFixed(2);
}
function calcCarne() {
  const total=_newItens.reduce((a,i)=>a+i.qty*i.preco,0)+gn('m-mao-obra',0);
  const n=gi('carneN',3)||3,dia=gi('carneDia',10)||10,ent=gn('carneEnt',0);
  const parc=(total-ent)/n;const hoje=new Date();let txt='';
  for(let i=1;i<=n;i++){const cd=new Date(hoje.getFullYear(),hoje.getMonth()+i,dia);txt+=`Parc ${i}/${n}: ${fmt(parc)} — ${fmtDate(cd.toISOString())}\n`;}
  const prev=document.getElementById('carnePreview');if(prev)prev.innerHTML=`<pre style="margin:0;white-space:pre-wrap">${txt}</pre>`;
}

// ── Assinatura (idêntico V_TEST) ──────────────────────────
function initSig() {
  const cv=document.getElementById('sigCanvas');if(!cv)return;
  const pr=window.devicePixelRatio||1;
  cv.width=cv.offsetWidth*pr; cv.height=cv.offsetHeight*pr;
  const ctx=cv.getContext('2d');
  ctx.scale(pr,pr); ctx.strokeStyle='#38BDF8'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
  function getP(e){const r=cv.getBoundingClientRect();if(e.touches)return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top};return{x:e.clientX-r.left,y:e.clientY-r.top};}
  cv.addEventListener('mousedown',  e=>{_sigDraw=true;const p=getP(e);_sigLX=p.x;_sigLY=p.y;});
  cv.addEventListener('mousemove',  e=>{if(!_sigDraw)return;const p=getP(e);ctx.beginPath();ctx.moveTo(_sigLX,_sigLY);ctx.lineTo(p.x,p.y);ctx.stroke();_sigLX=p.x;_sigLY=p.y;});
  cv.addEventListener('mouseup',    ()=>_sigDraw=false);
  cv.addEventListener('touchstart', e=>{e.preventDefault();_sigDraw=true;const p=getP(e);_sigLX=p.x;_sigLY=p.y;},{passive:false});
  cv.addEventListener('touchmove',  e=>{e.preventDefault();if(!_sigDraw)return;const p=getP(e);ctx.beginPath();ctx.moveTo(_sigLX,_sigLY);ctx.lineTo(p.x,p.y);ctx.stroke();_sigLX=p.x;_sigLY=p.y;},{passive:false});
  cv.addEventListener('touchend',   ()=>_sigDraw=false);
}
function clearSig(){const cv=document.getElementById('sigCanvas');if(cv)cv.getContext('2d').clearRect(0,0,cv.width,cv.height);}

// ── Fotos ─────────────────────────────────────────────────
function handlePhotos(e){Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{_newFotos.push(ev.target.result);renderPhotoGrid();};r.readAsDataURL(f);});e.target.value='';}
function renderPhotoGrid(){const g=document.getElementById('m-photo-grid');if(!g)return;g.innerHTML=_newFotos.map((f,i)=>`<div class="photo-thumb"><img src="${f}"><button class="rx" onclick="_newFotos.splice(${i},1);renderPhotoGrid()">✕</button></div>`).join('');}

// ── Salvar OS ─────────────────────────────────────────────
async function salvarOS() {
  const nome=_c(gv('m-cli-nome','').trim(),100);
  if(!nome){UI.toast('Nome do cliente é obrigatório','warning');return;}
  if(!_newItens.length&&!gn('m-mao-obra',0)){UI.toast('Adicione ao menos 1 item ou mão de obra','warning');return;}
  if(!_curPay){UI.toast('Selecione a forma de pagamento','warning');return;}
  const totalItens=_newItens.reduce((a,i)=>a+i.qty*i.preco,0);
  const maoObra=gn('m-mao-obra',0);
  const total=totalItens+maoObra;
  const status=gv('m-status','paga');
  const sig=document.getElementById('sigCanvas');
  const sigData=sig&&!isEmptySig(sig)?sig.toDataURL('image/png'):null;
  // Carnê
  let carneData=null;
  if(_curPay==='carne'){
    const n=gi('carneN',3)||3,dia=gi('carneDia',10)||10,ent=gn('carneEnt',0);
    const parc=(total-ent)/n;const hoje=new Date();
    carneData={total,entrada:ent,parcelas:n,valorParcela:parc,vencDia:dia,itens:[]};
    for(let ci=1;ci<=n;ci++){const cd=new Date(hoje.getFullYear(),hoje.getMonth()+ci,dia);carneData.itens.push({num:ci,valor:parc,venc:cd.toISOString().slice(0,10),status:'pendente'});}
  }
  // Buscar/criar cliente
  let clienteId=gv('m-cli-id','')||null;
  const tel=_c(gv('m-cli-tel',''),20);
  if(!clienteId&&(nome||tel)){
    try{const nc=await API.saveCliente(STATE.user.id,{nome,telefone:tel,cpf:_c(gv('m-cli-doc',''),20)});clienteId=nc.id;APP.clientes.push(nc);}catch(e){console.error('criar cli:',e);}
  }
  const itensJSON=JSON.stringify(_newItens.map(i=>({descricao:i.desc,quantidade:i.qty,valor_unit:i.preco,produto_id:i.produto_id||null,preco_custo:i.preco_custo||0})));
  const payload={
    cliente_id:clienteId,cliente_nome:nome,
    equipamento:_c(gv('m-equip',''),200),item:_c(gv('m-equip',''),200),
    defeito:_c(gv('m-defeito',''),500),diagnostico:_c(gv('m-diag',''),500),
    observacoes:_c(gv('m-obs',''),500),
    itens:itensJSON,valor_pecas:totalItens,valor_mao_obra:maoObra,valor_total:total,
    valor_pago:gn('m-pago',0),forma_pagamento:_curPay,
    status:_sbStBack(status),tipo:gv('m-tipo','servico'),
    assinatura:sigData,fotos:_newFotos.length?JSON.stringify(_newFotos):null,
    carne_data:carneData?JSON.stringify(carneData):null,
    hash_doc:genHash(nome+total+Date.now()),
  };
  Object.keys(payload).forEach(k=>{if(payload[k]===''||payload[k]===null)delete payload[k];});
  const btn=document.querySelector('#mbody .btn-green');
  if(btn){btn.disabled=true;btn.textContent='Salvando...';}
  try{
    const saved=await API.createOS(STATE.user.id,payload);
    // Baixar estoque
    for(const it of _newItens){
      if(it.produto_id){const p=APP.produtos.find(x=>x.id===it.produto_id);if(p&&(p.quantidade||0)>=it.qty){const nq=(p.quantidade||0)-it.qty;await API.updateEstoque(it.produto_id,nq);p.quantidade=nq;}}
    }
    // Caixa
    const dia=today();
    if(status==='paga')await API.addCaixa(STATE.user.id,{tipo:'entrada',descricao:`OS #${saved.numero} - ${nome}`,valor:total,forma:_curPay,ordem_id:saved.id,data:dia});
    else if(status==='fiado')await API.addCaixa(STATE.user.id,{tipo:'entrada',descricao:`Fiado - OS #${saved.numero} - ${nome}`,valor:0,forma:'fiado',ordem_id:saved.id,data:dia});
    else if(status==='parcial'&&carneData?.entrada>0)await API.addCaixa(STATE.user.id,{tipo:'entrada',descricao:`Entrada carnê - OS #${saved.numero} - ${nome}`,valor:carneData.entrada,forma:'carne',ordem_id:saved.id,data:dia});
    // Criar parcelas no banco
    if(carneData){
      for(const p of carneData.itens){
        await window.sb.from('parcelas').insert({dono_id:STATE.user.id,ordem_id:saved.id,numero:p.num,total:carneData.parcelas,valor:p.valor,vencimento:p.venc,pago:false}).catch(()=>{});
      }
    }
    APP.os.unshift(saved);
    UI.toast(`OS #${saved.numero} emitida! ✅`,'success');
    goBack();
    renderOS();
    setTimeout(()=>abrirComp(saved.id),400);
  }catch(e){UI.toast('Erro: '+e.message,'error');if(btn){btn.disabled=false;btn.textContent='✅ EMITIR ORDEM DE SERVIÇO';}}
}

// ── Ver OS (detalhe) ──────────────────────────────────────
async function verOS(id) {
  _verOsId = id;
  const os=APP.os.find(o=>o.id===id)||await API.getOSById(id).catch(()=>null);
  if(!os){UI.toast('OS não encontrada','error');return;}
  let itens=[];try{itens=JSON.parse(os.itens||'[]');}catch{}
  let fotos=[];try{fotos=JSON.parse(os.fotos||'[]');}catch{}
  let hist=[];try{hist=JSON.parse(os.historico||'[]');}catch{}
  const nome=os.clientes?.nome||os.cliente_nome||'–';
  const tel=os.clientes?.telefone||'';
  const st=_normSt(os.status);

  // Atualizar cabeçalho da página
  const numEl=document.getElementById('ver-os-num');if(numEl)numEl.textContent='OS #'+(os.numero||'–');
  const stEl=document.getElementById('ver-os-status');if(stEl)stEl.textContent=statusLabel(os.status);

  const itensH=itens.map(it=>`
    <div class="it-row">
      <span style="font-size:13px">${_e(it.descricao||it.desc||'')}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">x${it.quantidade||1}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt((it.quantidade||1)*(it.valor_unit||0))}</span>
      <span></span>
    </div>`).join('');

  const statusBtns=['concluido','aguardando','andamento','cancelado','fiado'].map(s=>`
    <button onclick="alterarStatusOS('${id}','${s}')" class="btn btn-${st===s?'primary':'ghost'} btn-sm">
      ${statusLabel(s)}
    </button>`).join('');

  const fotosH=fotos.length?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Fotos (${fotos.length})</div><div class="photo-grid">${fotos.map((f,i)=>`<div class="photo-thumb"><img src="${f}" onclick="verFoto('${id}',${i})"></div>`).join('')}</div></div>`:'';
  const sigH=os.assinatura?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Assinatura Digital</div><div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;text-align:center"><img src="${os.assinatura}" style="max-width:100%;max-height:60px"><div style="font-size:.72rem;color:var(--text-3);margin-top:4px;font-family:var(--mono)">${_e(nome)}</div></div></div>`:'';
  const histH=hist.length?hist.map(h=>`<div class="hist-item"><div class="hist-dot"></div><div><div class="hist-time">${fDateFull(h.at||h.criado_em)}</div><div class="hist-txt">${_e(h.txt||h.texto||'')}</div></div></div>`).join(''):'<p style="font-size:.8rem;color:var(--text-3)">Sem histórico</p>';

  const body=document.getElementById('ver-os-body');
  if(!body)return;
  body.innerHTML=`
    <div class="total-hl">
      <div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-3)">TOTAL</div>
        <div style="font-size:.82rem;color:var(--text-2)">${payLabel(os.forma_pagamento)}</div>
      </div>
      <div class="th-val">${fmt(os.valor_total)}</div>
    </div>
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Cliente</div>
      <div class="ir"><span class="irl">Nome</span><span class="irv">${_e(nome)}</span></div>
      ${tel?`<div class="ir"><span class="irl">Tel</span><span class="irv">${_e(tel)}</span></div>`:''}
      <div class="ir"><span class="irl">Data</span><span class="irv">${fDateFull(os.criado_em)}</span></div>
    </div>
    ${os.equipamento||os.item?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Equipamento</div>
      ${os.equipamento||os.item?`<div class="ir"><span class="irl">Equip.</span><span class="irv">${_e(os.equipamento||os.item||'')}</span></div>`:''}
      ${os.defeito?`<div class="ir"><span class="irl">Defeito</span><span class="irv">${_e(os.defeito)}</span></div>`:''}
      ${os.diagnostico?`<div class="ir"><span class="irl">Diag.</span><span class="irv">${_e(os.diagnostico)}</span></div>`:''}
    </div>`:''}
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Itens</div>
      ${itensH}
      ${(os.valor_mao_obra||0)>0?`<div class="it-row"><span>Mão de Obra</span><span></span><span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt(os.valor_mao_obra)}</span><span></span></div>`:''}
      <div class="it-total-row"><span class="it-total-label">TOTAL</span><span class="it-total-val">${fmt(os.valor_total)}</span></div>
    </div>
    ${os.observacoes?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Observações</div><p style="font-size:14px;line-height:1.65">${_e(os.observacoes)}</p></div>`:''}
    ${fotosH}${sigH}
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Alterar Status</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${statusBtns}</div>
    </div>
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Histórico / Notas</div>
      ${histH}
      <div class="form-group" style="margin-top:12px">
        <textarea id="nota-txt" class="form-control" placeholder="Adicionar nota..." rows="2"></textarea>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addNotaOS('${id}')">
        <i data-lucide="file-plus" style="width:13px;height:13px"></i> Salvar nota
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <button class="btn btn-ghost" onclick="enviarWA('${id}')">
        <i data-lucide="message-circle" style="width:14px;height:14px"></i> WhatsApp
      </button>
      <button class="btn btn-ghost" onclick="gerarPDF('${id}')">
        <i data-lucide="file-text" style="width:14px;height:14px"></i> PDF
      </button>
    </div>
    <button class="btn btn-danger w-full" onclick="excluirOS('${id}')">
      <i data-lucide="trash-2" style="width:14px;height:14px"></i> Excluir OS
    </button>
    <div style="height:20px"></div>`;

  goPage('ver-os');
  if(window.lucide)setTimeout(()=>lucide.createIcons(),50);
}


async function alterarStatusOS(id,novoStatus) {
  try{
    await API.updateOS(id,STATE.user.id,{status:novoStatus});
    await API.addHistorico(id,`Status alterado para: ${statusLabel(novoStatus)}`);
    const os=APP.os.find(o=>o.id===id);if(os)os.status=novoStatus;
    UI.toast('Status atualizado!','success');
    closeModal();renderOS();renderDash();
  }catch(e){UI.toast('Erro: '+e.message,'error');}
}
async function addNotaOS(id) {
  const txt=_c(gv('nota-txt','').trim(),500);
  if(!txt){UI.toast('Digite uma nota','warning');return;}
  try{await API.addHistorico(id,txt);UI.toast('Nota salva!','success');verOS(id);}
  catch(e){UI.toast('Erro: '+e.message,'error');}
}
async function excluirOS(id) {
  await UI.confirmSecure('Excluir esta OS? Isso também remove os lançamentos do caixa.', async()=>{
    try{await API.deleteOS(id,STATE.user.id);APP.os=APP.os.filter(o=>o.id!==id);UI.toast('OS excluída!','success');closeModal();renderOS();renderDash();}
    catch(e){UI.toast('Erro: '+e.message,'error');}
  });
}
function verFoto(osId,idx){const os=APP.os.find(o=>o.id===osId);if(!os)return;let f=[];try{f=JSON.parse(os.fotos||'[]');}catch{}openModal(`<div style="text-align:center"><img src="${f[idx]}" style="max-width:100%;border-radius:12px"><div style="margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--text-2)">Foto ${idx+1}/${f.length}</div></div>`);}

// ── Comprovante (V_TEST style) ────────────────────────────
let _compId=null;
function abrirComp(id) {
  _compId=id;
  const os=APP.os.find(o=>o.id===id);if(!os)return;
  const p=STATE.perfil||{};
  let itens=[];try{itens=JSON.parse(os.itens||'[]');}catch{}
  let fotos=[];try{fotos=JSON.parse(os.fotos||'[]');}catch{}
  const nome=os.clientes?.nome||os.cliente_nome||'–';
  const tel=os.clientes?.telefone||'';
  const st=_normSt(os.status);
  const hash=os.hash_doc||genHash(id+(os.valor_total||0));
  const qrId='qr'+Date.now();
  const itensH=itens.map(it=>`<div class="comp-item-r"><span>${_e(it.descricao||it.desc||'')} (x${it.quantidade||1})</span><span><b>${fmt((it.quantidade||1)*(it.valor_unit||0))}</b></span></div>`).join('');
  const fotosH=fotos.length?`<div class="comp-sec">Fotos</div><div class="comp-photos">${fotos.slice(0,6).map(f=>`<img src="${f}">`).join('')}</div>`:'';
  document.getElementById('compContent').innerHTML=`
  <div class="comp-paper" id="compPaper">
    <div class="comp-header">
      <div class="comp-store">${_e(p.empresa_nome||'NexOS')}</div>
      ${p.cnpj?`<div class="comp-sub">CNPJ: ${_e(p.cnpj)}</div>`:''}
      ${p.endereco?`<div class="comp-sub">${_e(p.endereco)}</div>`:''}
      ${p.telefone?`<div class="comp-sub">${_e(p.telefone)}</div>`:''}
    </div>
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:2px;text-transform:uppercase">ORDEM DE SERVIÇO</div>
      <div class="comp-os-num">#${os.numero||'–'}</div>
      <div class="comp-date">${fDateFull(os.criado_em)}</div>
      <div style="margin-top:6px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        <span style="background:${statusBgColor(st)};color:#fff;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase">${statusLabel(os.status)}</span>
        <span style="background:#eee;color:#555;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">${payLabel(os.forma_pagamento)}</span>
      </div>
    </div>
    <div class="comp-sec">Cliente</div>
    <div class="comp-row"><span>Nome</span><span><b>${_e(nome)}</b></span></div>
    ${tel?`<div class="comp-row"><span>Tel</span><span>${_e(tel)}</span></div>`:''}
    ${os.equipamento||os.item?`<div class="comp-sec">Equipamento</div><div class="comp-row"><span>Equip.</span><span>${_e(os.equipamento||os.item||'')}</span></div>${os.defeito?`<div class="comp-row"><span>Defeito</span><span>${_e(os.defeito)}</span></div>`:''}`:''}
    <div class="comp-sec">Itens</div>
    <div class="comp-items">${itensH}${(os.valor_mao_obra||0)>0?`<div class="comp-item-r"><span>Mão de Obra</span><span><b>${fmt(os.valor_mao_obra)}</b></span></div>`:''}</div>
    <div class="comp-total"><span>TOTAL</span><span>${fmt(os.valor_total)}</span></div>
    ${(os.valor_pago||0)>0?`<div class="comp-row"><span>Pago</span><span>${fmt(os.valor_pago)}</span></div>`:''}
    ${(os.valor_pago||0)>(os.valor_total||0)?`<div class="comp-row"><span>Troco</span><span>${fmt((os.valor_pago||0)-(os.valor_total||0))}</span></div>`:''}
    ${os.observacoes?`<div class="comp-sec">Observações</div><div style="font-size:12px;color:#555;line-height:1.6;margin-bottom:8px">${_e(os.observacoes)}</div>`:''}
    ${fotosH}
    ${os.assinatura?`<div class="comp-sec">Assinatura</div><div style="border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;margin-bottom:8px"><img src="${os.assinatura}" style="max-width:100%;max-height:55px"><div style="font-size:10px;color:#888;margin-top:3px">${_e(nome)}</div></div>`:''}
    ${p.termos?`<div class="comp-terms">${_e(p.termos)}</div>`:''}
    <div class="comp-footer">
      <div id="${qrId}" style="display:flex;justify-content:center;margin-bottom:8px"></div>
      <div><b>Código de Verificação</b></div>
      <div class="comp-hash">OS: #${os.numero} | HASH: ${hash} | ${fDateFull(os.criado_em)}</div>
      ${p.pix?`<div style="margin-top:7px"><b>PIX:</b> ${_e(p.pix)}</div>`:''}
      <div style="margin-top:8px">Obrigado pela preferência! 🙏</div>
    </div>
  </div>`;
  setTimeout(()=>{try{const el=document.getElementById(qrId);if(el&&window.QRCode)new QRCode(el,{text:'OS:#'+os.numero+'|HASH:'+hash,width:80,height:80,colorDark:'#1a6cf0',colorLight:'#ffffff'});}catch{}},200);
  document.getElementById('compView').classList.add('open');
}
function fecharComp(){document.getElementById('compView').classList.remove('open');}
function compartilharComp(){
  const os=APP.os.find(o=>o.id===_compId);if(!os)return;
  const txt=`OS #${os.numero} - ${os.clientes?.nome||os.cliente_nome||'–'}\nTotal: ${fmt(os.valor_total)}\n${fDateFull(os.criado_em)}`;
  if(navigator.share)navigator.share({title:'OS #'+os.numero,text:txt});
  else navigator.clipboard.writeText(txt).then(()=>UI.toast('Copiado!','success'));
}

function enviarWA(id) {
  const os=APP.os.find(o=>o.id===id);if(!os)return;
  const p=STATE.perfil||{};
  let itens=[];try{itens=JSON.parse(os.itens||'[]');}catch{}
  const nome=os.clientes?.nome||os.cliente_nome||'–';
  const tel=os.clientes?.telefone||'';
  const hash=os.hash_doc||genHash(id+(os.valor_total||0));
  const itensMsg=itens.map(it=>`- ${it.descricao||it.desc||''} x${it.quantidade||1} = ${fmt((it.quantidade||1)*(it.valor_unit||0))}`).join('\n');
  const msg=`*${p.empresa_nome||'NexOS'}*\n\nOS #${os.numero}\n*${nome}*\n${fDateFull(os.criado_em)}\n\nItens:\n${itensMsg}${(os.valor_mao_obra||0)>0?`\nMão de Obra: ${fmt(os.valor_mao_obra)}`:''}\n\n*TOTAL: ${fmt(os.valor_total)}*\n${payLabel(os.forma_pagamento)} | ${statusLabel(os.status)}${p.pix?'\nPIX: '+p.pix:''}${p.telefone?'\n'+p.telefone:''}\n\nHash: ${hash}`;
  window.open(API.buildWALink(tel,msg),'_blank');
}

async function gerarPDF(id) {
  const os = APP.os.find(o=>o.id===id) || await API.getOSById(id).catch(()=>null);
  if(!os){UI.toast('OS não encontrada','error');return;}

  // Verificar se jsPDF está disponível
  const jsPDFLib = window.jspdf?.jsPDF || window.jsPDF;
  if(!jsPDFLib){
    UI.toast('Biblioteca PDF não carregou. Tente pela tela de comprovante.','error');
    abrirComp(id);
    return;
  }

  UI.toast('Gerando PDF...','info');
  const p   = STATE.perfil||{};
  let itens = []; try{itens=JSON.parse(os.itens||'[]');}catch{}
  let fotos = []; try{fotos=JSON.parse(os.fotos||'[]');}catch{}
  const nome = os.clientes?.nome||os.cliente_nome||'–';
  const tel  = os.clientes?.telefone||'';
  const st   = _normSt(os.status);
  const hash = os.hash_doc||genHash(id+(os.valor_total||0));

  try {
    const doc = new jsPDFLib({unit:'mm',format:'a4'});
    const W=210, M=15; let y=M;

    // Fundo
    doc.setFillColor(10,15,30); doc.rect(0,0,W,297,'F');
    doc.setFillColor(17,24,39); doc.rect(0,0,W,44,'F');

    // Cabeçalho empresa
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(56,189,248);
    doc.text(p.empresa_nome||'NexOS', M, 16);
    doc.setFontSize(7.5); doc.setTextColor(90,112,153);
    if(p.cnpj)     doc.text('CNPJ: '+p.cnpj, M, 22);
    if(p.endereco) doc.text(p.endereco, M, 27);
    if(p.telefone) doc.text(p.telefone, M, 32);

    // Número OS
    doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.setTextColor(56,189,248);
    doc.text('#'+os.numero, W-M, 16, {align:'right'});
    doc.setFontSize(7.5); doc.setTextColor(90,112,153);
    doc.text('ORDEM DE SERVIÇO', W-M, 22, {align:'right'});
    doc.text(fDateFull(os.criado_em), W-M, 27, {align:'right'});

    // Badge status
    const scol={concluido:[0,200,100],aguardando:[255,140,66],andamento:[56,189,248],cancelado:[100,120,150],fiado:[167,139,250],retirada:[251,146,60]};
    doc.setFillColor(...(scol[st]||[56,189,248]));
    doc.roundedRect(W-M-30,32,30,8,2,2,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7);
    doc.text(statusLabel(os.status).toUpperCase(), W-M-15, 37.5, {align:'center'});
    y = 53;

    // Total destaque
    doc.setFillColor(10,35,20); doc.roundedRect(M,y,W-2*M,13,3,3,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(90,112,153);
    doc.text('TOTAL', M+4, y+9);
    doc.setFontSize(15); doc.setTextColor(0,229,160);
    doc.text(fmt(os.valor_total), W-M-2, y+9, {align:'right'});
    y += 18;

    // Helpers
    const sec = t => {
      doc.setFillColor(18,28,48); doc.rect(M,y,W-2*M,7,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(56,189,248);
      doc.text(t, M+3, y+5); y+=9;
    };
    const row = (l,v) => {
      if(!v) return;
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(90,112,153);
      doc.text(l+':', M+2, y);
      doc.setTextColor(220,232,255); doc.setFont('helvetica','bold');
      const ls = doc.splitTextToSize(String(v), W-2*M-36);
      doc.text(ls, M+38, y); y += 5.5*ls.length;
    };

    // Cliente
    sec('CLIENTE'); row('Nome',nome); row('Tel',tel);
    if(os.clientes?.cpf) row('CPF',os.clientes.cpf);
    y += 2;

    // Equipamento
    if(os.equipamento||os.item){
      sec('EQUIPAMENTO');
      row('Equip.',os.equipamento||os.item);
      row('Defeito',os.defeito);
      row('Diag.',os.diagnostico);
      y += 2;
    }

    // Itens
    sec('ITENS');
    doc.setFillColor(16,24,42); doc.rect(M,y,W-2*M,5.5,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(90,112,153);
    doc.text('Descrição',M+2,y+4); doc.text('Qtd',W-M-42,y+4); doc.text('Total',W-M-2,y+4,{align:'right'});
    y += 7;

    itens.forEach((it,i) => {
      doc.setFillColor(i%2===0?16:18, i%2===0?24:26, i%2===0?40:42);
      doc.rect(M,y-1,W-2*M,6,'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(220,232,255);
      doc.text((it.descricao||it.desc||'').slice(0,45), M+2, y+4);
      doc.setTextColor(90,112,153); doc.text('x'+(it.quantidade||1), W-M-42, y+4);
      doc.setTextColor(0,229,160); doc.setFont('helvetica','bold');
      doc.text(fmt((it.quantidade||1)*(it.valor_unit||0)), W-M-2, y+4, {align:'right'});
      y += 6;
    });

    // Mão de obra
    if((os.valor_mao_obra||0)>0) {
      doc.setFillColor(16,24,40); doc.rect(M,y-1,W-2*M,6,'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(220,232,255);
      doc.text('Mão de Obra', M+2, y+4);
      doc.setTextColor(0,229,160); doc.setFont('helvetica','bold');
      doc.text(fmt(os.valor_mao_obra), W-M-2, y+4, {align:'right'});
      y += 6;
    }

    // Total linha
    doc.setFillColor(12,30,18); doc.rect(M,y,W-2*M,7,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0,229,160);
    doc.text('TOTAL', M+2, y+5);
    doc.text(fmt(os.valor_total), W-M-2, y+5, {align:'right'});
    y += 10;

    // Pagamento
    if(os.forma_pagamento){
      sec('PAGAMENTO');
      row('Forma', payLabel(os.forma_pagamento));
      if((os.valor_pago||0)>0) row('Pago', fmt(os.valor_pago));
      y += 2;
    }

    // Observações
    if(os.observacoes){
      sec('OBSERVAÇÕES');
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(220,232,255);
      const ls2 = doc.splitTextToSize(os.observacoes, W-2*M-4);
      doc.text(ls2, M+2, y); y += ls2.length*5+4;
    }

    // Fotos (até 3)
    if(fotos.length){
      if(y>215){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
      sec('FOTOS ('+fotos.length+')');
      const pw=(W-2*M-8)/3;
      for(let fi=0;fi<Math.min(fotos.length,3);fi++){
        try{doc.addImage(fotos[fi],'JPEG',M+fi*(pw+4),y,pw,pw*.75,'','FAST');}catch{}
      }
      y += pw*.75+5;
    }

    // Assinatura
    if(os.assinatura){
      if(y>235){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
      sec('ASSINATURA DIGITAL');
      try{doc.addImage(os.assinatura,'PNG',M,y,70,20,'','FAST');}catch{}
      y += 25;
      doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(90,112,153);
      doc.text(nome+' - '+fDateFull(os.criado_em), M, y); y += 7;
    }

    // Termos
    if(p.termos){
      if(y>245){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
      sec('TERMOS');
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(90,112,153);
      const tl = doc.splitTextToSize(p.termos, W-2*M-4);
      doc.text(tl, M+2, y); y += tl.length*4.5+4;
    }

    // Rodapé com hash
    if(y>260){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
    doc.setFillColor(16,22,38); doc.rect(M,y,W-2*M,20,'F');
    doc.setFont('courier','bold'); doc.setFontSize(7); doc.setTextColor(56,189,248);
    doc.text('DOCUMENTO VÁLIDO — NexOS v4.0', M+3, y+6);
    doc.setFont('courier','normal'); doc.setFontSize(6.5); doc.setTextColor(90,112,153);
    doc.text('OS: #'+os.numero+' | '+fDateFull(os.criado_em), M+3, y+11);
    doc.text('HASH: '+hash, M+3, y+16);
    if(p.pix) doc.text('PIX: '+p.pix, W-M-2, y+13, {align:'right'});

    doc.save('OS_'+os.numero+'_'+nome.replace(/\s+/g,'_')+'.pdf');
    UI.toast('PDF gerado! ✅','success');
  } catch(e) {
    console.error('PDF erro:', e);
    UI.toast('Erro ao gerar PDF: '+e.message,'error');
  }
}



// ════════════════════════════════════════════════════════════
// CLIENTES, ESTOQUE, CAIXA, AGENDA, CONFIG, CARNÊS
// ════════════════════════════════════════════════════════════
function renderClientes() {
  const box = document.getElementById('cli-list'); if(!box) return;
  const q = gv('cli-search','').toLowerCase();
  const list = APP.clientes.filter(c=>!q||c.nome.toLowerCase().includes(q)||(c.telefone||'').includes(q));
  if(!list.length){box.innerHTML='<div class="empty"><span class="empty-ico">👥</span><h3>Nenhum cliente</h3><p>Toque em + para adicionar</p></div>';return;}
  box.innerHTML = list.map(c=>`
    <div class="card" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:13px 15px" onclick="editarCliente('${c.id}')">
      <div>
        <div style="font-size:14px;font-weight:600">${esc(c.nome)}</div>
        <div style="font-family:monospace;font-size:11px;color:var(--muted);margin-top:3px">${esc(c.telefone||'–')} ${c.cpf_cnpj?'| '+esc(c.cpf_cnpj):''}</div>
      </div>
      <button onclick="excluirCliente(event,'${c.id}')" style="background:none;border:none;color:var(--muted2);cursor:pointer;font-size:18px;padding:4px">🗑️</button>
    </div>`).join('');
}

function novoCliente() {
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">👤 Novo Cliente</h3>
    <input type="hidden" id="form-cli-id" value="">
    <label class="req">Nome</label><input type="text" id="form-cli-nome" placeholder="Nome completo">
    <label>Telefone</label><input type="tel" id="form-cli-tel" placeholder="(00) 00000-0000">
    <label>CPF / CNPJ</label><input type="text" id="form-cli-doc" placeholder="000.000.000-00">
    <button class="btn btn-green" style="margin-top:4px" onclick="salvarCliente()">✅ Salvar</button>
  `);
}

function editarCliente(id) {
  const c = APP.clientes.find(x=>x.id===id); if(!c) return;
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">✏️ Editar Cliente</h3>
    <input type="hidden" id="form-cli-id" value="${c.id}">
    <label class="req">Nome</label><input type="text" id="form-cli-nome" value="${esc(c.nome)}">
    <label>Telefone</label><input type="tel" id="form-cli-tel" value="${esc(c.telefone||'')}">
    <label>CPF / CNPJ</label><input type="text" id="form-cli-doc" value="${esc(c.cpf_cnpj||'')}">
    <button class="btn btn-green" style="margin-top:4px" onclick="salvarCliente()">✅ Salvar</button>
  `);
}

async function salvarCliente() {
  const nome = clean(gv('form-cli-nome','').trim(), 100);
  if (!nome) { UI.toast('Nome obrigatório','w'); return; }
  const d = { id:gv('form-cli-id','')||undefined, nome, telefone:clean(gv('form-cli-tel',''),20), cpf_cnpj:clean(gv('form-cli-doc',''),20) };
  try {
    const saved = await API.saveCliente(STATE.user.id, d);
    if (d.id) { const i=APP.clientes.findIndex(x=>x.id===d.id); if(i!==-1)APP.clientes[i]=saved; }
    else APP.clientes.push(saved);
    UI.toast('Cliente salvo!','s');
    closeModal();
    renderClientes();
  } catch(e) { UI.toast('Erro: '+e.message,'e'); }
}

async function excluirCliente(e, id) {
  e.stopPropagation();
  if (!confirm('Excluir este cliente?')) return;
  try {
    await API.deleteCliente(STATE.user.id, id);
    APP.clientes = APP.clientes.filter(c=>c.id!==id);
    UI.toast('Cliente excluído!','s');
    renderClientes();
  } catch(err) { UI.toast('Erro: '+err.message,'e'); }
}

// ════════════════════════════════════════════════════════
// ESTOQUE
// ════════════════════════════════════════════════════════
function renderEstoque() {
  const box = document.getElementById('est-list'); if(!box) return;
  const q = gv('est-search','').toLowerCase();
  const list = APP.produtos.filter(p=>p.ativo!==false&&(!q||p.nome.toLowerCase().includes(q)||(p.codigo||'').toLowerCase().includes(q)));
  if(!list.length){box.innerHTML='<div class="empty"><span class="empty-ico">📦</span><h3>Nenhum produto</h3><p>Toque em + para adicionar</p></div>';return;}
  box.innerHTML = list.map(p=>`
    <div class="prod-item" onclick="editarProduto('${p.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(p.nome)}</div>
          <div style="font-family:monospace;font-size:10px;color:var(--muted)">${p.codigo?'#'+esc(p.codigo)+' · ':''}</div>
        </div>
        <div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--green)">${fmtBRL(p.preco_venda)}</div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <span style="font-family:monospace;font-size:11px;color:${(p.quantidade||0)<=(p.estoque_min||0)?'var(--red)':'var(--green)'}">Est: ${p.quantidade||0} (min:${p.estoque_min||0})</span>
        ${p.preco_custo>0?`<span style="font-family:monospace;font-size:11px;color:var(--blue)">Mg: ${calcMg(p.preco_custo,p.preco_venda)}%</span>`:''}
        <span style="font-family:monospace;font-size:11px;color:var(--muted)">Custo: ${fmtBRL(p.preco_custo)}</span>
      </div>
    </div>`).join('');
}

function novoProduto() {
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">📦 Novo Produto</h3>
    <input type="hidden" id="form-prd-id" value="">
    <label class="req">Nome</label><input type="text" id="form-prd-nome" placeholder="Nome do produto">
    <label>Código / SKU</label><input type="text" id="form-prd-cod" placeholder="SKU-001">
    <div class="frow">
      <div><label>Custo R$</label><input type="number" id="form-prd-custo" step="0.01" oninput="updMg()"></div>
      <div><label>Venda R$</label><input type="number" id="form-prd-venda" step="0.01" oninput="updMg()"></div>
    </div>
    <div id="mg-prev" style="font-family:monospace;font-size:11px;color:var(--blue);margin-bottom:10px"></div>
    <div class="frow">
      <div><label>Quantidade</label><input type="number" id="form-prd-qtd" value="0" min="0"></div>
      <div><label>Estoque Mín.</label><input type="number" id="form-prd-min" value="0" min="0"></div>
    </div>
    <button class="btn btn-green" style="margin-top:4px" onclick="salvarProduto()">✅ Salvar</button>
  `);
}

function editarProduto(id) {
  const p = APP.produtos.find(x=>x.id===id); if(!p) return;
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">✏️ ${esc(p.nome)}</h3>
    <input type="hidden" id="form-prd-id" value="${p.id}">
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Resumo</div>
      <div class="ir"><span class="irl">Venda</span><span class="irv" style="color:var(--green)">${fmtBRL(p.preco_venda)}</span></div>
      <div class="ir"><span class="irl">Custo</span><span class="irv">${fmtBRL(p.preco_custo)}</span></div>
      <div class="ir"><span class="irl">Margem</span><span class="irv" style="color:var(--blue)">${calcMg(p.preco_custo,p.preco_venda)}%</span></div>
      <div class="ir"><span class="irl">Estoque</span><span class="irv" style="color:${(p.quantidade||0)<=(p.estoque_min||0)?'var(--red)':'var(--green)'}">${p.quantidade||0}</span></div>
    </div>
    <label>Nome</label><input type="text" id="form-prd-nome" value="${esc(p.nome)}">
    <label>Código</label><input type="text" id="form-prd-cod" value="${esc(p.codigo||'')}">
    <div class="frow">
      <div><label>Custo R$</label><input type="number" id="form-prd-custo" value="${p.preco_custo||0}" step="0.01" oninput="updMg()"></div>
      <div><label>Venda R$</label><input type="number" id="form-prd-venda" value="${p.preco_venda||0}" step="0.01" oninput="updMg()"></div>
    </div>
    <div id="mg-prev" style="font-family:monospace;font-size:11px;color:var(--blue);margin-bottom:10px"></div>
    <div class="frow">
      <div><label>Quantidade</label><input type="number" id="form-prd-qtd" value="${p.quantidade||0}" min="0"></div>
      <div><label>Estoque Mín.</label><input type="number" id="form-prd-min" value="${p.estoque_min||0}" min="0"></div>
    </div>
    <div class="brow" style="margin-top:8px">
      <button class="btn btn-green" onclick="salvarProduto()">✅ Salvar</button>
      <button class="btn btn-red btn-sm" style="flex:.4" onclick="excluirProduto('${p.id}')">🗑️</button>
    </div>
  `);
  setTimeout(updMg, 50);
}

function updMg() {
  const c=parseFloat(gv('form-prd-custo',0)); const v=parseFloat(gv('form-prd-venda',0));
  const el=document.getElementById('mg-prev');
  if(el&&c>0&&v>0) el.textContent=`Margem: ${calcMg(c,v)}% | Lucro: ${fmtBRL(v-c)}`;
  else if(el) el.textContent='';
}

async function salvarProduto() {
  const nome = clean(gv('form-prd-nome','').trim(), 100);
  if(!nome){UI.toast('Nome obrigatório','w');return;}
  const d = { id:gv('form-prd-id','')||undefined, nome, codigo:clean(gv('form-prd-cod',''),50), preco_custo:gv('form-prd-custo',0), preco_venda:gv('form-prd-venda',0), quantidade:gi('form-prd-qtd',0), estoque_min:gi('form-prd-min',0) };
  try {
    const saved = await API.saveProduto(STATE.user.id, d);
    if(d.id){const i=APP.produtos.findIndex(x=>x.id===d.id);if(i!==-1)APP.produtos[i]=saved;}
    else APP.produtos.push(saved);
    UI.toast('Produto salvo!','s'); closeModal(); renderEstoque();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

async function excluirProduto(id) {
  if(!confirm('Excluir produto?'))return;
  try {
    await API.deleteProduto(STATE.user.id, id);
    APP.produtos = APP.produtos.filter(p=>p.id!==id);
    UI.toast('Produto excluído!','s'); closeModal(); renderEstoque();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

// ════════════════════════════════════════════════════════
// CAIXA — direto como V_TEST
// ════════════════════════════════════════════════════════
async function renderCaixa() {
  const dataSel = gv('cx-date', today()) || today();
  try {
    const movs = await API.getCaixa(STATE.user.id, dataSel, dataSel);
    const ent  = movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+(m.valor||0),0);
    const said = movs.filter(m=>m.tipo==='saida').reduce((a,m)=>a+(m.valor||0),0);
    const fiad = movs.filter(m=>m.tipo==='fiado').reduce((a,m)=>a+(m.valor||0),0);

    const cx = document.getElementById('cx-cards');
    if(cx) cx.innerHTML=`
      <div class="cx-card c-green"><div class="cx-num">${fmtBRL(ent)}</div><div class="cx-label">Entradas</div></div>
      <div class="cx-card c-red"><div class="cx-num">${fmtBRL(said)}</div><div class="cx-label">Saídas</div></div>
      <div class="cx-card c-blue"><div class="cx-num">${fmtBRL(ent-said)}</div><div class="cx-label">Saldo</div></div>
      <div class="cx-card c-yellow"><div class="cx-num">${fmtBRL(fiad)}</div><div class="cx-label">Fiado</div></div>`;

    // Por pagamento
    const pp={};
    movs.filter(m=>m.tipo==='entrada').forEach(m=>{pp[m.forma]=(pp[m.forma]||0)+(m.valor||0);});
    const pg = document.getElementById('cx-pags');
    if(pg) pg.innerHTML = Object.keys(pp).length
      ? Object.entries(pp).map(([k,v])=>`<div class="mov-item"><span class="pay-pill pp-${k}">${pagLabel(k)}</span><span class="mov-val mv-e">${fmtBRL(v)}</span></div>`).join('')
      : '<div style="font-size:12px;color:var(--muted2);font-family:monospace">Nenhuma entrada</div>';

    // Movimentações
    const mv = document.getElementById('cx-movs');
    if(mv) mv.innerHTML = movs.length
      ? movs.sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em)).map(m=>`
        <div class="mov-item">
          <div>
            <div class="mov-desc">${esc(m.descricao||'')}</div>
            <div class="mov-meta">${fTime(m.criado_em)}${m.forma?' – '+pagLabel(m.forma):''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mov-val mv-${m.tipo==='saida'?'s':m.tipo==='fiado'?'f':'e'}">${m.tipo==='saida'?'–':'+'}${fmtBRL(m.valor)}</span>
            <button onclick="excluirMov('${m.id}')" style="background:none;border:none;color:var(--muted2);cursor:pointer;font-size:14px">🗑️</button>
          </div>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--muted2);font-family:monospace">Nenhuma movimentação</div>';
  } catch(e) { console.error(e); }
}

async function registrarSaida() {
  const desc = clean(gv('cx-saida-desc','').trim(), 200);
  const val  = parseFloat(gv('cx-saida-val',''));
  if(!desc){UI.toast('Descreva a saída','w');return;}
  if(!val||val<=0){UI.toast('Valor inválido','w');return;}
  const data = gv('cx-date',today())||today();
  try {
    await API.addCaixa(STATE.user.id,{tipo:'saida',descricao:desc,valor:val,forma:'dinheiro',data});
    document.getElementById('cx-saida-desc').value='';
    document.getElementById('cx-saida-val').value='';
    UI.toast('Saída registrada!','s');
    renderCaixa();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

async function excluirMov(id) {
  if(!confirm('Excluir esta movimentação?'))return;
  try {
    await API.deleteCaixa(STATE.user.id, id);
    APP.movs = APP.movs.filter(m=>m.id!==id);
    UI.toast('Excluído!','s'); renderCaixa();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

// ════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ════════════════════════════════════════════════════════
function renderConfig() {
  const p = STATE.perfil||{};
  document.getElementById('cfg-nome').value    = p.empresa_nome||'';
  document.getElementById('cfg-cnpj').value    = p.cnpj||'';
  document.getElementById('cfg-tel').value     = p.telefone||'';
  document.getElementById('cfg-end').value     = p.endereco||'';
  document.getElementById('cfg-pix').value     = p.pix||'';
  document.getElementById('cfg-termos').value  = p.termos||'';
}

async function salvarConfig() {
  const d = {
    empresa_nome: clean(gv('cfg-nome',''),100),
    cnpj:    clean(gv('cfg-cnpj',''),20),
    telefone:clean(gv('cfg-tel',''),20),
    endereco:clean(gv('cfg-end',''),200),
    pix:     clean(gv('cfg-pix',''),100),
    termos:  clean(gv('cfg-termos',''),800),
  };
  if(!d.empresa_nome){UI.toast('Nome da empresa obrigatório','w');return;}
  try {
    STATE.perfil = await API.upsertPerfil(STATE.user.id, d);
    App._ui();
    UI.toast('Configurações salvas! ✅','s');
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

// ── Menu usuário ──────────────────────────────────────────
function toggleUserMenu() {
  const ex = document.getElementById('user-menu-dd'); if(ex){ex.remove();return;}
  const p = STATE.perfil||{};
  const m = document.createElement('div'); m.id='user-menu-dd';
  m.style.cssText='position:fixed;bottom:72px;left:10px;right:10px;background:var(--s1);border:1px solid var(--b2);border-radius:16px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:500';
  m.innerHTML=`
    <div style="padding:10px 12px 12px;border-bottom:1px solid var(--b1);margin-bottom:6px">
      <div style="font-size:.88rem;font-weight:700">${esc(p.empresa_nome||'NexOS')}</div>
      <div style="font-size:.72rem;color:var(--muted)">Proprietário</div>
    </div>
    <div class="dropdown-item" id="_cfg_dd">⚙️ Configurações</div>
    <div class="dropdown-sep"></div>
    <div class="dropdown-item danger" id="_out_dd">🚪 Sair</div>`;
  document.body.appendChild(m);
  document.getElementById('_cfg_dd')?.addEventListener('click',()=>{goPage('config');m.remove();});
  document.getElementById('_out_dd')?.addEventListener('click',()=>{m.remove();Auth.logout();});
  setTimeout(()=>{document.addEventListener('click',function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h);}});},50);
}

window.UI = UI;
window.App = App;
async function salvarPIN() {
  const p1=gv('cfg-pin-new',''), p2=gv('cfg-pin-conf','');
  if(p1.length!==4||!/^\d{4}$/.test(p1)){UI.toast('PIN deve ter 4 dígitos','warning');return;}
  if(p1!==p2){UI.toast('PINs não coincidem','warning');return;}
  const pin_hash=btoa(p1);
  try{STATE.perfil=await API.upsertPerfil(STATE.user.id,{pin_hash});UI.toast('PIN salvo! ✅','success');document.getElementById('cfg-pin-new').value='';document.getElementById('cfg-pin-conf').value='';}
  catch(e){UI.toast('Erro: '+e.message,'error');}
}

function updMgPrd(){
  const c=parseFloat(gv('form-prd-custo',0)), v2=parseFloat(gv('form-prd-venda',0));
  const el=document.getElementById('mg-prev');
  if(el&&c>0&&v2>0) el.textContent='Margem: '+calcMargem(c,v2)+'% | Lucro: '+fmt(v2-c);
  else if(el) el.textContent='';
}

// ── Notificações ───────────────────────────────────────────
async function requestNotifPermission() {
  if('Notification'in window && Notification.permission==='default') {
    await Notification.requestPermission().catch(()=>{});
  }
}

// ════════════════════════════════════════════════════════════
// AGENDA
// ════════════════════════════════════════════════════════════
async function renderAgenda() {
  const from = gv('ag-date', today()) || today();
  try {
    const eventos = await API.getAgenda(STATE.user.id, from + 'T00:00:00', from + 'T23:59:59');
    const box = document.getElementById('ag-list'); if (!box) return;
    if (!eventos.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sem compromissos neste dia</div></div>';
      return;
    }
    box.innerHTML = eventos.map(e => `
      <div class="card" style="cursor:pointer" onclick="editarEvento('${e.id}')">
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
  document.getElementById('form-ev-id').value = '';
  document.getElementById('form-ev-data').value = today();
  document.getElementById('form-ev-cor').value = '#38BDF8';
  const sel = document.getElementById('form-ev-cli');
  if (sel) sel.innerHTML = '<option value="">Sem cliente</option>' + APP.clientes.map(c => `<option value="${c.id}">${_e(c.nome)}</option>`).join('');
  const t = document.getElementById('form-ev-title'); if (t) t.textContent = 'Novo Evento';
  goPage('novo-evento');
}

function editarEvento(id) {
  const e = APP.agenda.find(x => x.id === id); if (!e) return;
  document.getElementById('form-ev-id').value    = e.id;
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
  if (!titulo) { UI.toast('Título obrigatório', 'warning'); return; }
  const d = {
    id: gv('form-ev-id', '') || undefined,
    titulo,
    hora:        gv('form-ev-hora', '') || null,
    data_inicio: gv('form-ev-data', today()) + 'T' + (gv('form-ev-hora', '') || '00:00'),
    cliente_id:  gv('form-ev-cli', '') || null,
    cor:         gv('form-ev-cor', '#38BDF8'),
    descricao:   _c(gv('form-ev-desc', ''), 300),
  };
  try {
    const saved = await API.saveEvento(STATE.user.id, d);
    if (d.id) { const i = APP.agenda.findIndex(x => x.id === d.id); if (i !== -1) APP.agenda[i] = saved; }
    else APP.agenda.push(saved);
    UI.toast('Evento salvo! ✅', 'success');
    goBack();
    renderAgenda();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function excluirEvento(e, id) {
  e.stopPropagation();
  if (!confirm('Excluir evento?')) return;
  try {
    await API.deleteEvento(STATE.user.id, id);
    APP.agenda = APP.agenda.filter(x => x.id !== id);
    UI.toast('Evento excluído!', 'success');
    renderAgenda();
  } catch(err) { UI.toast('Erro: ' + err.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
// CARNÊS
// ════════════════════════════════════════════════════════════
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
      return `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--blue)">${os ? 'OS #' + os.numero : '–'}</div>
            <div style="font-size:15px;font-weight:600">${_e(nome)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:15px;font-weight:700;color:var(--green)">${fmt(p.valor)}</div>
            <div style="font-size:11px;color:${venc ? 'var(--red)' : 'var(--text-2)'};font-family:var(--mono)">Venc: ${fmtDate(p.vencimento)}</div>
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
  if (!confirm('Confirmar pagamento de ' + fmt(valor) + '?')) return;
  try {
    await API.pagarParcela(STATE.user.id, id, valor, ordemId || null);
    UI.toast('Parcela paga! ✅', 'success');
    renderCarnes();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

function cobrarWA(id, tel, nome, valor, venc) {
  const p   = STATE.perfil || {};
  const msg = `Olá *${nome}*! 👋\n\nPassando para lembrá-lo(a) do pagamento pendente:\n\n💰 *Valor:* ${valor}\n📅 *Vencimento:* ${venc}${p.pix ? '\n\n🔑 *PIX:* ' + p.pix : ''}\n\n_${p.empresa_nome || 'NexOS'}_`;
  const num = (tel || '').replace(/\D/g, '');
  const fone = num.startsWith('55') ? num : '55' + num;
  window.open('https://wa.me/' + fone + '?text=' + encodeURIComponent(msg), '_blank');
}

// ── QR Reader ─────────────────────────────────────────────
let _qrStream = null;
function openQrReader() {
  const w = document.getElementById('qrReaderWrap'); if (!w) return;
  w.classList.add('open');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => { _qrStream = stream; document.getElementById('qrVideo').srcObject = stream; _scanQR(); })
    .catch(() => { UI.toast('Sem acesso à câmera', 'error'); closeQrReader(); });
}
function closeQrReader() {
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  document.getElementById('qrReaderWrap')?.classList.remove('open');
}
function _scanQR() {
  const video = document.getElementById('qrVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  function scan() {
    if (!_qrStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (window.jsQR) {
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
        if (code) {
          closeQrReader();
          const mo = code.data.match(/OS:#(\d+)/);
          if (mo) {
            const num = parseInt(mo[1]);
            const os = APP.os.find(o => o.numero === num);
            if (os) { UI.toast('OS #' + num + ' encontrada!', 'success'); verOS(os.id); }
            else UI.toast('OS #' + num + ' não encontrada', 'warning');
          } else { UI.toast('QR: ' + code.data.slice(0, 40), 'info'); }
          return;
        }
      }
    }
    requestAnimationFrame(scan);
  }
  requestAnimationFrame(scan);
}

// ── Global search ─────────────────────────────────────────
function globalSearch(q) {
  if (!q || q.length < 2) return;
  if (APP._page === 'os' || APP._page === 'dashboard') {
    const el = document.getElementById('os-search'); if (el) { el.value = q; renderOS(); }
  } else if (APP._page === 'clientes') {
    const el = document.getElementById('cli-search'); if (el) { el.value = q; renderClientes(); }
  } else if (APP._page === 'estoque') {
    const el = document.getElementBy/* ============================================================
   NexOS v4.0 — app.js | Nav v3.5 + Forms V_TEST
   ============================================================ */
'use strict';

// ── Estado local ───────────────────────────────────────────
const APP = { os:[], clientes:[], produtos:[], agenda:[], _page:'dashboard' };

// ── Sanitização ────────────────────────────────────────────
function _c(s,n)  { return typeof s==='string'?s.trim().slice(0,n||300).replace(/[<>"'`]/g,''):''; }
function _n(s,mn,mx){ const v=parseFloat(s); return isNaN(v)?0:Math.min(Math.max(v,mn??0),mx??9999999); }
function _e(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function gv(id,d) { const el=document.getElementById(id);return el?el.value:(d!==undefined?d:''); }
function gi(id,d) { const v=parseInt(gv(id,''));return isNaN(v)?(d||0):v; }
function gn(id,d) { const v=parseFloat(gv(id,''));return isNaN(v)?(d||0):v; }

// Calcular margem
function calcMargem(custo,venda){ return venda>0?((((venda-custo)/venda)*100).toFixed(0)):0; }

// ── Navegação (estilo v3.5) ────────────────────────────────
const PAGE_TITLES = {
  dashboard:'Dashboard', os:'Ordens de Serviço', clientes:'Clientes',
  estoque:'Estoque', caixa:'Caixa', agenda:'Agenda', config:'Configurações',
  carnes:'Carnês',
  'nova-os':'Nova OS', 'ver-os':'OS', 'novo-cliente':'Novo Cliente',
  'novo-produto':'Novo Produto', 'novo-evento':'Novo Evento',
};

// Páginas secundárias (não aparecem no nav)
const SECONDARY_PAGES = ['nova-os','ver-os','novo-cliente','novo-produto','novo-evento'];

let _prevPage = 'dashboard';
let _verOsId  = null;

function goPage(page, opts={}) {
  // Guardar página anterior para goBack
  if(!SECONDARY_PAGES.includes(APP._page)) _prevPage = APP._page;
  APP._page = page;
  // Ativar página no DOM
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+page);if(pg)pg.classList.add('active');
  // Nav — só atualizar para páginas principais
  const navPage = SECONDARY_PAGES.includes(page) ? _prevPage : page;
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===navPage));
  document.querySelectorAll('.mobile-nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===navPage));
  // FAB — esconder em páginas de formulário
  const fab=document.getElementById('fab');
  if(fab) fab.style.display=(!SECONDARY_PAGES.includes(page)&&['os','clientes','estoque','agenda'].includes(page))?'flex':'none';
  // Título
  UI.setPageTitle(PAGE_TITLES[page]||page);
  if(!SECONDARY_PAGES.includes(page)) localStorage.setItem('nexos_v4_page',page);
  // Scroll topo
  const pc=document.getElementById('page-content');if(pc)pc.scrollTop=0;
  // Render
  const r={
    dashboard:renderDash, os:renderOS, clientes:renderClientes,
    estoque:renderEstoque, caixa:renderCaixa, agenda:renderAgenda,
    config:renderConfig, carnes:renderCarnes,
  };
  if(r[page]) r[page]();
  // Reiniciar lucide
  if(window.lucide) lucide.createIcons();
}

function goBack() {
  goPage(_prevPage);
}

function fabAction() {
  const a={os:novaOS, clientes:novoCliente, estoque:novoProduto, agenda:novoEvento};
  if(a[APP._page]) a[APP._page]();
}

// ── Modal V_TEST ───────────────────────────────────────────
function openModal(html) {
  const mb=document.getElementById('mbody');if(!mb)return;
  mb.innerHTML=html;
  document.getElementById('mwrap').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal() {
  document.getElementById('mwrap')?.classList.remove('open');
  document.body.style.overflow='';
}

// ── App init ───────────────────────────────────────────────
const App = {
  async init() {
    try {
      [APP.os, APP.clientes, APP.produtos, APP.agenda] = await Promise.all([
        API.getOS(STATE.user.id),
        API.getClientes(STATE.user.id),
        API.getProdutos(STATE.user.id),
        API.getAgenda(STATE.user.id, today()+'T00:00:00', today()+'T23:59:59'),
      ]);
    } catch(e){ console.error('App.init error:',e); }
    this._ui();
    // Verificar agenda do dia
    this._agendaAlert();
    // Verificar carnês vencidos
    this._carnesAlert();
    const last = localStorage.getItem('nexos_v4_page')||'dashboard';
    // Não restaurar páginas de formulário
    goPage(SECONDARY_PAGES.includes(last)?'dashboard':last);
    if(window.lucide) lucide.createIcons();
  },
  _ui() {
    const p=STATE.perfil||{};
    const nome=p.empresa_nome||STATE.user?.email||'NexOS';
    const ini=initials(nome);
    ['sidebar-avatar','header-avatar'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=ini;});
    const sn=document.getElementById('sidebar-name');if(sn)sn.textContent=nome;
    const sr=document.getElementById('sidebar-role');if(sr)sr.textContent='Proprietário';
  },
  async _agendaAlert() {
    if(!APP.agenda.length) return;
    const msg=APP.agenda.map(e=>`• ${e.titulo} ${e.hora?'às '+e.hora:''}`).join('\n');
    if(APP.agenda.length>0) UI.toast(`📅 ${APP.agenda.length} compromisso(s) hoje`,'info');
    // Notificação nativa
    if('Notification'in window&&Notification.permission==='granted') {
      new Notification('NexOS — Agenda de Hoje',{body:msg,icon:'NexOS.png'});
    }
  },
  async _carnesAlert() {
    try {
      const vencidas = await API.getParcelas(STATE.user.id,true);
      if(vencidas.length>0) UI.toast(`⚠️ ${vencidas.length} parcela(s) vencida(s)`,'warning');
    } catch{}
  },
};

// ════════════════════════════════════════════════════════════
// DASHBOARD — dados reais, sem gráficos
// ════════════════════════════════════════════════════════════
async function renderDash() {
  try {
    const d = await API.getDashboard(STATE.user.id);
    // KPIs
    const kf=document.getElementById('kpi-fat');if(kf)kf.textContent=fmt(d.faturamento);
    const kl=document.getElementById('kpi-lucro');if(kl)kl.textContent=fmt(d.lucro);
    const ko=document.getElementById('kpi-os');if(ko)ko.textContent=d.os_abertas;
    // Alertas
    const ka=document.getElementById('kpi-alertas');
    if(ka){
      const bx=APP.produtos.filter(p=>p.quantidade<=(p.estoque_min||0)).length;
      ka.textContent=(d.parcelas_vencidas+bx)||'✓';
      ka.style.color=(d.parcelas_vencidas+bx)>0?'var(--red)':'var(--green)';
    }
    // OS recentes
    const box=document.getElementById('dash-os-list');if(!box)return;
    const recent=APP.os.slice(0,8);
    if(!recent.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma OS ainda</div><button class="btn btn-primary mt-3" onclick="novaOS()">+ Nova OS</button></div>';return;}
    box.innerHTML=recent.map(o=>`
      <div class="os-item s-${_normSt(o.status)}" onclick="verOS('${o.id}')">
        <div class="osi-top">
          <div class="osi-num">OS #${o.numero||'?'}</div>
          <span class="sbadge sb-${_normSt(o.status)}">${statusLabel(o.status)}</span>
        </div>
        <div class="osi-name">${_e(o.clientes?.nome||o.cliente_nome||'–')}</div>
        <div class="osi-desc">${_e(o.equipamento||o.item||'')}${o.defeito?' · '+_e(o.defeito.slice(0,35)):''}</div>
        <div class="osi-meta">
          <span class="pay-pill pp-${o.forma_pagamento||''}">${payLabel(o.forma_pagamento)}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${fmtDate(o.criado_em)}</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);margin-left:auto">${fmt(o.valor_total)}</span>
        </div>
      </div>`).join('');
    // Agenda hoje
    const agb=document.getElementById('dash-agenda');
    if(agb&&d.agenda_hoje.length){
      agb.innerHTML=d.agenda_hoje.map(e=>`
        <div class="agenda-item">
          <div class="agenda-dot" style="background:${e.cor||'var(--blue)'}"></div>
          <div class="agenda-info">
            <div class="agenda-title">${_e(e.titulo)}</div>
            <div class="agenda-time">${e.hora||'Dia todo'}${e.clientes?.nome?' · '+_e(e.clientes.nome):''}</div>
          </div>
        </div>`).join('');
    } else if(agb) {
      agb.innerHTML='<p style="font-size:.8rem;color:var(--text-3)">Sem compromissos hoje</p>';
    }
  } catch(e){ console.error('renderDash:',e); }
}

function _normSt(s){return{concluido:'concluido',retirada:'concluido',aguardando:'aguardando',andamento:'andamento',cancelado:'cancelado',fiado:'fiado'}[s]||s||'aguardando';}
function _sbStBack(s){return{paga:'concluido',aberta:'aguardando',fiado:'fiado',cancelada:'cancelado',parcial:'andamento'}[s]||'aguardando';}

// ════════════════════════════════════════════════════════════
// ORDENS DE SERVIÇO — lista estilo V_TEST
// ════════════════════════════════════════════════════════════
let _osFilter='all', _newItens=[], _newFotos=[], _curPay='', _sigDraw=false, _sigLX=0, _sigLY=0;

function renderOS() {
  const box=document.getElementById('os-list');if(!box)return;
  const q=gv('os-search','').toLowerCase();
  let list=[...APP.os];
  if(_osFilter!=='all') list=list.filter(o=>o.status===_osFilter);
  if(q) list=list.filter(o=>(o.clientes?.nome||o.cliente_nome||'').toLowerCase().includes(q)||String(o.numero||'').includes(q)||(o.equipamento||o.item||'').toLowerCase().includes(q));
  const cnt=document.getElementById('os-count');if(cnt)cnt.textContent=list.length+' registro'+(list.length!==1?'s':'');
  if(!list.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">'+(APP.os.length?'Nenhuma OS neste filtro':'Nenhuma OS ainda')+'</div>'+(APP.os.length?'':`<button class="btn btn-primary mt-3" onclick="novaOS()">+ Nova OS</button>`)+'</div>';return;}
  box.innerHTML=list.map(o=>{
    const st=_normSt(o.status);
    return`<div class="os-item s-${st}" onclick="verOS('${o.id}')">
      <div class="osi-top">
        <div class="osi-num">OS #${o.numero||'?'}</div>
        <span class="sbadge sb-${st}">${statusLabel(o.status)}</span>
      </div>
      <div class="osi-name">${_e(o.clientes?.nome||o.cliente_nome||'–')}</div>
      <div class="osi-desc">${_e(o.equipamento||o.item||'')}${o.defeito?' · '+_e(o.defeito.slice(0,40)):''}</div>
      <div class="osi-meta">
        <span class="pay-pill pp-${o.forma_pagamento||''}">${payLabel(o.forma_pagamento)}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${fmtDate(o.criado_em)}</span>
        <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);margin-left:auto">${fmt(o.valor_total)}</span>
      </div>
    </div>`;
  }).join('');
}

function setOsFilter(f,el) {
  _osFilter=f;
  document.querySelectorAll('.filter-chips .chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  renderOS();
}

// ── Nova OS — navega para página nova-os ─────────────────────
function novaOS() {
  _newItens=[]; _newFotos=[]; _curPay='';
  // Preencher select de clientes na página
  const sel=document.getElementById('m-cli-id');
  if(sel){
    sel.innerHTML='<option value="">– Sem cadastro –</option>'+APP.clientes.map(c=>`<option value="${c.id}">${_e(c.nome)}</option>`).join('');
  }
  // Limpar campos
  ['m-cli-nome','m-cli-tel','m-cli-doc','m-equip','m-defeito','m-diag','m-obs','m-pago','m-troco'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['m-mao-obra'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0';});
  document.getElementById('m-status').value='paga';
  document.getElementById('m-tipo').value='servico';
  // Chips de pagamento
  document.querySelectorAll('.pchip').forEach(c=>c.className='pchip');
  _curPay='';
  document.getElementById('carneConfig').style.display='none';
  document.getElementById('fiadoWarn').style.display='none';
  // Itens
  const box=document.getElementById('m-itens-rows');if(box)box.innerHTML='<p style="font-size:12px;color:var(--text-3);padding:8px 4px">Nenhum item adicionado</p>';
  document.getElementById('m-total').textContent='R$ 0,00';
  // Fotos
  const pg=document.getElementById('m-photo-grid');if(pg)pg.innerHTML='';
  // Título
  const t=document.getElementById('nova-os-title');if(t)t.textContent='Nova OS';
  // Data/hora atual
  const md=document.getElementById('m-data');
  if(md){const n=new Date();md.value=n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate())+'T'+pad(n.getHours())+':'+pad(n.getMinutes());}
  goPage('nova-os');
  setTimeout(()=>{initSig();if(window.lucide)lucide.createIcons();},150);
}

// ── Itens ─────────────────────────────────────────────────
function addOSItem() {
  const desc=gv('m-i-desc','').trim();
  const qty=gn('m-i-qty',1)||1;
  const preco=gn('m-i-preco',0);
  if(!desc){UI.toast('Descreva o item','warning');return;}
  _newItens.push({desc,qty,preco});
  document.getElementById('m-i-desc').value='';
  document.getElementById('m-i-qty').value='1';
  document.getElementById('m-i-preco').value='';
  renderOSItens();
}
function renderOSItens() {
  const box=document.getElementById('m-itens-rows');if(!box)return;
  if(!_newItens.length){box.innerHTML='<p style="font-size:12px;color:var(--text-3);padding:8px 4px;font-family:var(--mono)">Nenhum item</p>';recalcTotalOS();return;}
  box.innerHTML=_newItens.map((it,i)=>`
    <div class="it-row">
      <span style="font-size:13px">${_e(it.desc)}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">x${it.qty}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt(it.qty*it.preco)}</span>
      <button class="it-del" onclick="_newItens.splice(${i},1);renderOSItens()">✕</button>
    </div>`).join('');
  recalcTotalOS();
}
function recalcTotalOS() {
  const t=_newItens.reduce((a,i)=>a+i.qty*i.preco,0)+gn('m-mao-obra',0);
  const el=document.getElementById('m-total');if(el)el.textContent=fmt(t);
}
function addDoEstoque() {
  const sel=APP.produtos.filter(p=>p.quantidade>0);
  if(!sel.length){UI.toast('Estoque vazio','warning');return;}
  openModal('<h3 style="margin-bottom:14px;font-size:18px;font-weight:700">📦 Adicionar do Estoque</h3>'
    +sel.map(p=>`<div class="prod-item" onclick="_addItemEst('${p.id}')">
      <div style="display:flex;justify-content:space-between"><span style="font-weight:600">${_e(p.nome)}</span><span style="color:var(--green);font-family:var(--mono)">${fmt(p.preco_venda)}</span></div>
      <div style="font-size:11px;color:var(--text-2);font-family:var(--mono)">Estoque: ${p.quantidade} | Custo: ${fmt(p.preco_custo)}</div>
    </div>`).join('')
    +'<button class="btn btn-ghost btn-sm" onclick="novaOS()" style="margin-top:8px">← Voltar</button>');
}
function _addItemEst(id) {
  const p=APP.produtos.find(x=>x.id===id);if(!p)return;
  _newItens.push({desc:p.nome,qty:1,preco:p.preco_venda||0,produto_id:id,preco_custo:p.preco_custo||0});
  UI.toast('Adicionado: '+p.nome,'success');
  novaOS(); // reabrir form com estado atual
  setTimeout(renderOSItens,60);
}

// ── Pagamento (idêntico V_TEST) ───────────────────────────
function setPay(p,el) {
  _curPay=p;
  document.querySelectorAll('.pchip').forEach(c=>c.className='pchip');
  el.classList.add('p-'+p);
  document.getElementById('fiadoWarn').style.display=p==='fiado'?'block':'none';
  document.getElementById('carneConfig').style.display=p==='carne'?'block':'none';
  if(p==='carne')calcCarne();
}
function calcTrocoOS() {
  const paid=gn('m-pago',0);
  const total=_newItens.reduce((a,i)=>a+i.qty*i.preco,0)+gn('m-mao-obra',0);
  const tr=document.getElementById('m-troco');if(tr)tr.value=Math.max(0,paid-total).toFixed(2);
}
function calcCarne() {
  const total=_newItens.reduce((a,i)=>a+i.qty*i.preco,0)+gn('m-mao-obra',0);
  const n=gi('carneN',3)||3,dia=gi('carneDia',10)||10,ent=gn('carneEnt',0);
  const parc=(total-ent)/n;const hoje=new Date();let txt='';
  for(let i=1;i<=n;i++){const cd=new Date(hoje.getFullYear(),hoje.getMonth()+i,dia);txt+=`Parc ${i}/${n}: ${fmt(parc)} — ${fmtDate(cd.toISOString())}\n`;}
  const prev=document.getElementById('carnePreview');if(prev)prev.innerHTML=`<pre style="margin:0;white-space:pre-wrap">${txt}</pre>`;
}

// ── Assinatura (idêntico V_TEST) ──────────────────────────
function initSig() {
  const cv=document.getElementById('sigCanvas');if(!cv)return;
  const pr=window.devicePixelRatio||1;
  cv.width=cv.offsetWidth*pr; cv.height=cv.offsetHeight*pr;
  const ctx=cv.getContext('2d');
  ctx.scale(pr,pr); ctx.strokeStyle='#38BDF8'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
  function getP(e){const r=cv.getBoundingClientRect();if(e.touches)return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top};return{x:e.clientX-r.left,y:e.clientY-r.top};}
  cv.addEventListener('mousedown',  e=>{_sigDraw=true;const p=getP(e);_sigLX=p.x;_sigLY=p.y;});
  cv.addEventListener('mousemove',  e=>{if(!_sigDraw)return;const p=getP(e);ctx.beginPath();ctx.moveTo(_sigLX,_sigLY);ctx.lineTo(p.x,p.y);ctx.stroke();_sigLX=p.x;_sigLY=p.y;});
  cv.addEventListener('mouseup',    ()=>_sigDraw=false);
  cv.addEventListener('touchstart', e=>{e.preventDefault();_sigDraw=true;const p=getP(e);_sigLX=p.x;_sigLY=p.y;},{passive:false});
  cv.addEventListener('touchmove',  e=>{e.preventDefault();if(!_sigDraw)return;const p=getP(e);ctx.beginPath();ctx.moveTo(_sigLX,_sigLY);ctx.lineTo(p.x,p.y);ctx.stroke();_sigLX=p.x;_sigLY=p.y;},{passive:false});
  cv.addEventListener('touchend',   ()=>_sigDraw=false);
}
function clearSig(){const cv=document.getElementById('sigCanvas');if(cv)cv.getContext('2d').clearRect(0,0,cv.width,cv.height);}

// ── Fotos ─────────────────────────────────────────────────
function handlePhotos(e){Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{_newFotos.push(ev.target.result);renderPhotoGrid();};r.readAsDataURL(f);});e.target.value='';}
function renderPhotoGrid(){const g=document.getElementById('m-photo-grid');if(!g)return;g.innerHTML=_newFotos.map((f,i)=>`<div class="photo-thumb"><img src="${f}"><button class="rx" onclick="_newFotos.splice(${i},1);renderPhotoGrid()">✕</button></div>`).join('');}

// ── Salvar OS ─────────────────────────────────────────────
async function salvarOS() {
  const nome=_c(gv('m-cli-nome','').trim(),100);
  if(!nome){UI.toast('Nome do cliente é obrigatório','warning');return;}
  if(!_newItens.length&&!gn('m-mao-obra',0)){UI.toast('Adicione ao menos 1 item ou mão de obra','warning');return;}
  if(!_curPay){UI.toast('Selecione a forma de pagamento','warning');return;}
  const totalItens=_newItens.reduce((a,i)=>a+i.qty*i.preco,0);
  const maoObra=gn('m-mao-obra',0);
  const total=totalItens+maoObra;
  const status=gv('m-status','paga');
  const sig=document.getElementById('sigCanvas');
  const sigData=sig&&!isEmptySig(sig)?sig.toDataURL('image/png'):null;
  // Carnê
  let carneData=null;
  if(_curPay==='carne'){
    const n=gi('carneN',3)||3,dia=gi('carneDia',10)||10,ent=gn('carneEnt',0);
    const parc=(total-ent)/n;const hoje=new Date();
    carneData={total,entrada:ent,parcelas:n,valorParcela:parc,vencDia:dia,itens:[]};
    for(let ci=1;ci<=n;ci++){const cd=new Date(hoje.getFullYear(),hoje.getMonth()+ci,dia);carneData.itens.push({num:ci,valor:parc,venc:cd.toISOString().slice(0,10),status:'pendente'});}
  }
  // Buscar/criar cliente
  let clienteId=gv('m-cli-id','')||null;
  const tel=_c(gv('m-cli-tel',''),20);
  if(!clienteId&&(nome||tel)){
    try{const nc=await API.saveCliente(STATE.user.id,{nome,telefone:tel,cpf:_c(gv('m-cli-doc',''),20)});clienteId=nc.id;APP.clientes.push(nc);}catch(e){console.error('criar cli:',e);}
  }
  const itensJSON=JSON.stringify(_newItens.map(i=>({descricao:i.desc,quantidade:i.qty,valor_unit:i.preco,produto_id:i.produto_id||null,preco_custo:i.preco_custo||0})));
  const payload={
    cliente_id:clienteId,cliente_nome:nome,
    equipamento:_c(gv('m-equip',''),200),item:_c(gv('m-equip',''),200),
    defeito:_c(gv('m-defeito',''),500),diagnostico:_c(gv('m-diag',''),500),
    observacoes:_c(gv('m-obs',''),500),
    itens:itensJSON,valor_pecas:totalItens,valor_mao_obra:maoObra,valor_total:total,
    valor_pago:gn('m-pago',0),forma_pagamento:_curPay,
    status:_sbStBack(status),tipo:gv('m-tipo','servico'),
    assinatura:sigData,fotos:_newFotos.length?JSON.stringify(_newFotos):null,
    carne_data:carneData?JSON.stringify(carneData):null,
    hash_doc:genHash(nome+total+Date.now()),
  };
  Object.keys(payload).forEach(k=>{if(payload[k]===''||payload[k]===null)delete payload[k];});
  const btn=document.querySelector('#mbody .btn-green');
  if(btn){btn.disabled=true;btn.textContent='Salvando...';}
  try{
    const saved=await API.createOS(STATE.user.id,payload);
    // Baixar estoque
    for(const it of _newItens){
      if(it.produto_id){const p=APP.produtos.find(x=>x.id===it.produto_id);if(p&&(p.quantidade||0)>=it.qty){const nq=(p.quantidade||0)-it.qty;await API.updateEstoque(it.produto_id,nq);p.quantidade=nq;}}
    }
    // Caixa
    const dia=today();
    if(status==='paga')await API.addCaixa(STATE.user.id,{tipo:'entrada',descricao:`OS #${saved.numero} - ${nome}`,valor:total,forma:_curPay,ordem_id:saved.id,data:dia});
    else if(status==='fiado')await API.addCaixa(STATE.user.id,{tipo:'entrada',descricao:`Fiado - OS #${saved.numero} - ${nome}`,valor:0,forma:'fiado',ordem_id:saved.id,data:dia});
    else if(status==='parcial'&&carneData?.entrada>0)await API.addCaixa(STATE.user.id,{tipo:'entrada',descricao:`Entrada carnê - OS #${saved.numero} - ${nome}`,valor:carneData.entrada,forma:'carne',ordem_id:saved.id,data:dia});
    // Criar parcelas no banco
    if(carneData){
      for(const p of carneData.itens){
        await window.sb.from('parcelas').insert({dono_id:STATE.user.id,ordem_id:saved.id,numero:p.num,total:carneData.parcelas,valor:p.valor,vencimento:p.venc,pago:false}).catch(()=>{});
      }
    }
    APP.os.unshift(saved);
    UI.toast(`OS #${saved.numero} emitida! ✅`,'success');
    goBack();
    renderOS();
    setTimeout(()=>abrirComp(saved.id),400);
  }catch(e){UI.toast('Erro: '+e.message,'error');if(btn){btn.disabled=false;btn.textContent='✅ EMITIR ORDEM DE SERVIÇO';}}
}

// ── Ver OS (detalhe) ──────────────────────────────────────
async function verOS(id) {
  _verOsId = id;
  const os=APP.os.find(o=>o.id===id)||await API.getOSById(id).catch(()=>null);
  if(!os){UI.toast('OS não encontrada','error');return;}
  let itens=[];try{itens=JSON.parse(os.itens||'[]');}catch{}
  let fotos=[];try{fotos=JSON.parse(os.fotos||'[]');}catch{}
  let hist=[];try{hist=JSON.parse(os.historico||'[]');}catch{}
  const nome=os.clientes?.nome||os.cliente_nome||'–';
  const tel=os.clientes?.telefone||'';
  const st=_normSt(os.status);

  // Atualizar cabeçalho da página
  const numEl=document.getElementById('ver-os-num');if(numEl)numEl.textContent='OS #'+(os.numero||'–');
  const stEl=document.getElementById('ver-os-status');if(stEl)stEl.textContent=statusLabel(os.status);

  const itensH=itens.map(it=>`
    <div class="it-row">
      <span style="font-size:13px">${_e(it.descricao||it.desc||'')}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">x${it.quantidade||1}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt((it.quantidade||1)*(it.valor_unit||0))}</span>
      <span></span>
    </div>`).join('');

  const statusBtns=['concluido','aguardando','andamento','cancelado','fiado'].map(s=>`
    <button onclick="alterarStatusOS('${id}','${s}')" class="btn btn-${st===s?'primary':'ghost'} btn-sm">
      ${statusLabel(s)}
    </button>`).join('');

  const fotosH=fotos.length?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Fotos (${fotos.length})</div><div class="photo-grid">${fotos.map((f,i)=>`<div class="photo-thumb"><img src="${f}" onclick="verFoto('${id}',${i})"></div>`).join('')}</div></div>`:'';
  const sigH=os.assinatura?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Assinatura Digital</div><div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;text-align:center"><img src="${os.assinatura}" style="max-width:100%;max-height:60px"><div style="font-size:.72rem;color:var(--text-3);margin-top:4px;font-family:var(--mono)">${_e(nome)}</div></div></div>`:'';
  const histH=hist.length?hist.map(h=>`<div class="hist-item"><div class="hist-dot"></div><div><div class="hist-time">${fDateFull(h.at||h.criado_em)}</div><div class="hist-txt">${_e(h.txt||h.texto||'')}</div></div></div>`).join(''):'<p style="font-size:.8rem;color:var(--text-3)">Sem histórico</p>';

  const body=document.getElementById('ver-os-body');
  if(!body)return;
  body.innerHTML=`
    <div class="total-hl">
      <div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-3)">TOTAL</div>
        <div style="font-size:.82rem;color:var(--text-2)">${payLabel(os.forma_pagamento)}</div>
      </div>
      <div class="th-val">${fmt(os.valor_total)}</div>
    </div>
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Cliente</div>
      <div class="ir"><span class="irl">Nome</span><span class="irv">${_e(nome)}</span></div>
      ${tel?`<div class="ir"><span class="irl">Tel</span><span class="irv">${_e(tel)}</span></div>`:''}
      <div class="ir"><span class="irl">Data</span><span class="irv">${fDateFull(os.criado_em)}</span></div>
    </div>
    ${os.equipamento||os.item?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Equipamento</div>
      ${os.equipamento||os.item?`<div class="ir"><span class="irl">Equip.</span><span class="irv">${_e(os.equipamento||os.item||'')}</span></div>`:''}
      ${os.defeito?`<div class="ir"><span class="irl">Defeito</span><span class="irv">${_e(os.defeito)}</span></div>`:''}
      ${os.diagnostico?`<div class="ir"><span class="irl">Diag.</span><span class="irv">${_e(os.diagnostico)}</span></div>`:''}
    </div>`:''}
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Itens</div>
      ${itensH}
      ${(os.valor_mao_obra||0)>0?`<div class="it-row"><span>Mão de Obra</span><span></span><span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmt(os.valor_mao_obra)}</span><span></span></div>`:''}
      <div class="it-total-row"><span class="it-total-label">TOTAL</span><span class="it-total-val">${fmt(os.valor_total)}</span></div>
    </div>
    ${os.observacoes?`<div class="card"><div class="card-title"><div class="ct-bar"></div>Observações</div><p style="font-size:14px;line-height:1.65">${_e(os.observacoes)}</p></div>`:''}
    ${fotosH}${sigH}
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Alterar Status</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${statusBtns}</div>
    </div>
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Histórico / Notas</div>
      ${histH}
      <div class="form-group" style="margin-top:12px">
        <textarea id="nota-txt" class="form-control" placeholder="Adicionar nota..." rows="2"></textarea>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addNotaOS('${id}')">
        <i data-lucide="file-plus" style="width:13px;height:13px"></i> Salvar nota
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <button class="btn btn-ghost" onclick="enviarWA('${id}')">
        <i data-lucide="message-circle" style="width:14px;height:14px"></i> WhatsApp
      </button>
      <button class="btn btn-ghost" onclick="gerarPDF('${id}')">
        <i data-lucide="file-text" style="width:14px;height:14px"></i> PDF
      </button>
    </div>
    <button class="btn btn-danger w-full" onclick="excluirOS('${id}')">
      <i data-lucide="trash-2" style="width:14px;height:14px"></i> Excluir OS
    </button>
    <div style="height:20px"></div>`;

  goPage('ver-os');
  if(window.lucide)setTimeout(()=>lucide.createIcons(),50);
}


async function alterarStatusOS(id,novoStatus) {
  try{
    await API.updateOS(id,STATE.user.id,{status:novoStatus});
    await API.addHistorico(id,`Status alterado para: ${statusLabel(novoStatus)}`);
    const os=APP.os.find(o=>o.id===id);if(os)os.status=novoStatus;
    UI.toast('Status atualizado!','success');
    closeModal();renderOS();renderDash();
  }catch(e){UI.toast('Erro: '+e.message,'error');}
}
async function addNotaOS(id) {
  const txt=_c(gv('nota-txt','').trim(),500);
  if(!txt){UI.toast('Digite uma nota','warning');return;}
  try{await API.addHistorico(id,txt);UI.toast('Nota salva!','success');verOS(id);}
  catch(e){UI.toast('Erro: '+e.message,'error');}
}
async function excluirOS(id) {
  await UI.confirmSecure('Excluir esta OS? Isso também remove os lançamentos do caixa.', async()=>{
    try{await API.deleteOS(id,STATE.user.id);APP.os=APP.os.filter(o=>o.id!==id);UI.toast('OS excluída!','success');closeModal();renderOS();renderDash();}
    catch(e){UI.toast('Erro: '+e.message,'error');}
  });
}
function verFoto(osId,idx){const os=APP.os.find(o=>o.id===osId);if(!os)return;let f=[];try{f=JSON.parse(os.fotos||'[]');}catch{}openModal(`<div style="text-align:center"><img src="${f[idx]}" style="max-width:100%;border-radius:12px"><div style="margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--text-2)">Foto ${idx+1}/${f.length}</div></div>`);}

// ── Comprovante (V_TEST style) ────────────────────────────
let _compId=null;
function abrirComp(id) {
  _compId=id;
  const os=APP.os.find(o=>o.id===id);if(!os)return;
  const p=STATE.perfil||{};
  let itens=[];try{itens=JSON.parse(os.itens||'[]');}catch{}
  let fotos=[];try{fotos=JSON.parse(os.fotos||'[]');}catch{}
  const nome=os.clientes?.nome||os.cliente_nome||'–';
  const tel=os.clientes?.telefone||'';
  const st=_normSt(os.status);
  const hash=os.hash_doc||genHash(id+(os.valor_total||0));
  const qrId='qr'+Date.now();
  const itensH=itens.map(it=>`<div class="comp-item-r"><span>${_e(it.descricao||it.desc||'')} (x${it.quantidade||1})</span><span><b>${fmt((it.quantidade||1)*(it.valor_unit||0))}</b></span></div>`).join('');
  const fotosH=fotos.length?`<div class="comp-sec">Fotos</div><div class="comp-photos">${fotos.slice(0,6).map(f=>`<img src="${f}">`).join('')}</div>`:'';
  document.getElementById('compContent').innerHTML=`
  <div class="comp-paper" id="compPaper">
    <div class="comp-header">
      <div class="comp-store">${_e(p.empresa_nome||'NexOS')}</div>
      ${p.cnpj?`<div class="comp-sub">CNPJ: ${_e(p.cnpj)}</div>`:''}
      ${p.endereco?`<div class="comp-sub">${_e(p.endereco)}</div>`:''}
      ${p.telefone?`<div class="comp-sub">${_e(p.telefone)}</div>`:''}
    </div>
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:2px;text-transform:uppercase">ORDEM DE SERVIÇO</div>
      <div class="comp-os-num">#${os.numero||'–'}</div>
      <div class="comp-date">${fDateFull(os.criado_em)}</div>
      <div style="margin-top:6px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        <span style="background:${statusBgColor(st)};color:#fff;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase">${statusLabel(os.status)}</span>
        <span style="background:#eee;color:#555;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">${payLabel(os.forma_pagamento)}</span>
      </div>
    </div>
    <div class="comp-sec">Cliente</div>
    <div class="comp-row"><span>Nome</span><span><b>${_e(nome)}</b></span></div>
    ${tel?`<div class="comp-row"><span>Tel</span><span>${_e(tel)}</span></div>`:''}
    ${os.equipamento||os.item?`<div class="comp-sec">Equipamento</div><div class="comp-row"><span>Equip.</span><span>${_e(os.equipamento||os.item||'')}</span></div>${os.defeito?`<div class="comp-row"><span>Defeito</span><span>${_e(os.defeito)}</span></div>`:''}`:''}
    <div class="comp-sec">Itens</div>
    <div class="comp-items">${itensH}${(os.valor_mao_obra||0)>0?`<div class="comp-item-r"><span>Mão de Obra</span><span><b>${fmt(os.valor_mao_obra)}</b></span></div>`:''}</div>
    <div class="comp-total"><span>TOTAL</span><span>${fmt(os.valor_total)}</span></div>
    ${(os.valor_pago||0)>0?`<div class="comp-row"><span>Pago</span><span>${fmt(os.valor_pago)}</span></div>`:''}
    ${(os.valor_pago||0)>(os.valor_total||0)?`<div class="comp-row"><span>Troco</span><span>${fmt((os.valor_pago||0)-(os.valor_total||0))}</span></div>`:''}
    ${os.observacoes?`<div class="comp-sec">Observações</div><div style="font-size:12px;color:#555;line-height:1.6;margin-bottom:8px">${_e(os.observacoes)}</div>`:''}
    ${fotosH}
    ${os.assinatura?`<div class="comp-sec">Assinatura</div><div style="border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;margin-bottom:8px"><img src="${os.assinatura}" style="max-width:100%;max-height:55px"><div style="font-size:10px;color:#888;margin-top:3px">${_e(nome)}</div></div>`:''}
    ${p.termos?`<div class="comp-terms">${_e(p.termos)}</div>`:''}
    <div class="comp-footer">
      <div id="${qrId}" style="display:flex;justify-content:center;margin-bottom:8px"></div>
      <div><b>Código de Verificação</b></div>
      <div class="comp-hash">OS: #${os.numero} | HASH: ${hash} | ${fDateFull(os.criado_em)}</div>
      ${p.pix?`<div style="margin-top:7px"><b>PIX:</b> ${_e(p.pix)}</div>`:''}
      <div style="margin-top:8px">Obrigado pela preferência! 🙏</div>
    </div>
  </div>`;
  setTimeout(()=>{try{const el=document.getElementById(qrId);if(el&&window.QRCode)new QRCode(el,{text:'OS:#'+os.numero+'|HASH:'+hash,width:80,height:80,colorDark:'#1a6cf0',colorLight:'#ffffff'});}catch{}},200);
  document.getElementById('compView').classList.add('open');
}
function fecharComp(){document.getElementById('compView').classList.remove('open');}
function compartilharComp(){
  const os=APP.os.find(o=>o.id===_compId);if(!os)return;
  const txt=`OS #${os.numero} - ${os.clientes?.nome||os.cliente_nome||'–'}\nTotal: ${fmt(os.valor_total)}\n${fDateFull(os.criado_em)}`;
  if(navigator.share)navigator.share({title:'OS #'+os.numero,text:txt});
  else navigator.clipboard.writeText(txt).then(()=>UI.toast('Copiado!','success'));
}

function enviarWA(id) {
  const os=APP.os.find(o=>o.id===id);if(!os)return;
  const p=STATE.perfil||{};
  let itens=[];try{itens=JSON.parse(os.itens||'[]');}catch{}
  const nome=os.clientes?.nome||os.cliente_nome||'–';
  const tel=os.clientes?.telefone||'';
  const hash=os.hash_doc||genHash(id+(os.valor_total||0));
  const itensMsg=itens.map(it=>`- ${it.descricao||it.desc||''} x${it.quantidade||1} = ${fmt((it.quantidade||1)*(it.valor_unit||0))}`).join('\n');
  const msg=`*${p.empresa_nome||'NexOS'}*\n\nOS #${os.numero}\n*${nome}*\n${fDateFull(os.criado_em)}\n\nItens:\n${itensMsg}${(os.valor_mao_obra||0)>0?`\nMão de Obra: ${fmt(os.valor_mao_obra)}`:''}\n\n*TOTAL: ${fmt(os.valor_total)}*\n${payLabel(os.forma_pagamento)} | ${statusLabel(os.status)}${p.pix?'\nPIX: '+p.pix:''}${p.telefone?'\n'+p.telefone:''}\n\nHash: ${hash}`;
  window.open(API.buildWALink(tel,msg),'_blank');
}

async function gerarPDF(id) {
  const os = APP.os.find(o=>o.id===id) || await API.getOSById(id).catch(()=>null);
  if(!os){UI.toast('OS não encontrada','error');return;}

  // Verificar se jsPDF está disponível
  const jsPDFLib = window.jspdf?.jsPDF || window.jsPDF;
  if(!jsPDFLib){
    UI.toast('Biblioteca PDF não carregou. Tente pela tela de comprovante.','error');
    abrirComp(id);
    return;
  }

  UI.toast('Gerando PDF...','info');
  const p   = STATE.perfil||{};
  let itens = []; try{itens=JSON.parse(os.itens||'[]');}catch{}
  let fotos = []; try{fotos=JSON.parse(os.fotos||'[]');}catch{}
  const nome = os.clientes?.nome||os.cliente_nome||'–';
  const tel  = os.clientes?.telefone||'';
  const st   = _normSt(os.status);
  const hash = os.hash_doc||genHash(id+(os.valor_total||0));

  try {
    const doc = new jsPDFLib({unit:'mm',format:'a4'});
    const W=210, M=15; let y=M;

    // Fundo
    doc.setFillColor(10,15,30); doc.rect(0,0,W,297,'F');
    doc.setFillColor(17,24,39); doc.rect(0,0,W,44,'F');

    // Cabeçalho empresa
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(56,189,248);
    doc.text(p.empresa_nome||'NexOS', M, 16);
    doc.setFontSize(7.5); doc.setTextColor(90,112,153);
    if(p.cnpj)     doc.text('CNPJ: '+p.cnpj, M, 22);
    if(p.endereco) doc.text(p.endereco, M, 27);
    if(p.telefone) doc.text(p.telefone, M, 32);

    // Número OS
    doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.setTextColor(56,189,248);
    doc.text('#'+os.numero, W-M, 16, {align:'right'});
    doc.setFontSize(7.5); doc.setTextColor(90,112,153);
    doc.text('ORDEM DE SERVIÇO', W-M, 22, {align:'right'});
    doc.text(fDateFull(os.criado_em), W-M, 27, {align:'right'});

    // Badge status
    const scol={concluido:[0,200,100],aguardando:[255,140,66],andamento:[56,189,248],cancelado:[100,120,150],fiado:[167,139,250],retirada:[251,146,60]};
    doc.setFillColor(...(scol[st]||[56,189,248]));
    doc.roundedRect(W-M-30,32,30,8,2,2,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7);
    doc.text(statusLabel(os.status).toUpperCase(), W-M-15, 37.5, {align:'center'});
    y = 53;

    // Total destaque
    doc.setFillColor(10,35,20); doc.roundedRect(M,y,W-2*M,13,3,3,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(90,112,153);
    doc.text('TOTAL', M+4, y+9);
    doc.setFontSize(15); doc.setTextColor(0,229,160);
    doc.text(fmt(os.valor_total), W-M-2, y+9, {align:'right'});
    y += 18;

    // Helpers
    const sec = t => {
      doc.setFillColor(18,28,48); doc.rect(M,y,W-2*M,7,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(56,189,248);
      doc.text(t, M+3, y+5); y+=9;
    };
    const row = (l,v) => {
      if(!v) return;
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(90,112,153);
      doc.text(l+':', M+2, y);
      doc.setTextColor(220,232,255); doc.setFont('helvetica','bold');
      const ls = doc.splitTextToSize(String(v), W-2*M-36);
      doc.text(ls, M+38, y); y += 5.5*ls.length;
    };

    // Cliente
    sec('CLIENTE'); row('Nome',nome); row('Tel',tel);
    if(os.clientes?.cpf) row('CPF',os.clientes.cpf);
    y += 2;

    // Equipamento
    if(os.equipamento||os.item){
      sec('EQUIPAMENTO');
      row('Equip.',os.equipamento||os.item);
      row('Defeito',os.defeito);
      row('Diag.',os.diagnostico);
      y += 2;
    }

    // Itens
    sec('ITENS');
    doc.setFillColor(16,24,42); doc.rect(M,y,W-2*M,5.5,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(90,112,153);
    doc.text('Descrição',M+2,y+4); doc.text('Qtd',W-M-42,y+4); doc.text('Total',W-M-2,y+4,{align:'right'});
    y += 7;

    itens.forEach((it,i) => {
      doc.setFillColor(i%2===0?16:18, i%2===0?24:26, i%2===0?40:42);
      doc.rect(M,y-1,W-2*M,6,'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(220,232,255);
      doc.text((it.descricao||it.desc||'').slice(0,45), M+2, y+4);
      doc.setTextColor(90,112,153); doc.text('x'+(it.quantidade||1), W-M-42, y+4);
      doc.setTextColor(0,229,160); doc.setFont('helvetica','bold');
      doc.text(fmt((it.quantidade||1)*(it.valor_unit||0)), W-M-2, y+4, {align:'right'});
      y += 6;
    });

    // Mão de obra
    if((os.valor_mao_obra||0)>0) {
      doc.setFillColor(16,24,40); doc.rect(M,y-1,W-2*M,6,'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(220,232,255);
      doc.text('Mão de Obra', M+2, y+4);
      doc.setTextColor(0,229,160); doc.setFont('helvetica','bold');
      doc.text(fmt(os.valor_mao_obra), W-M-2, y+4, {align:'right'});
      y += 6;
    }

    // Total linha
    doc.setFillColor(12,30,18); doc.rect(M,y,W-2*M,7,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0,229,160);
    doc.text('TOTAL', M+2, y+5);
    doc.text(fmt(os.valor_total), W-M-2, y+5, {align:'right'});
    y += 10;

    // Pagamento
    if(os.forma_pagamento){
      sec('PAGAMENTO');
      row('Forma', payLabel(os.forma_pagamento));
      if((os.valor_pago||0)>0) row('Pago', fmt(os.valor_pago));
      y += 2;
    }

    // Observações
    if(os.observacoes){
      sec('OBSERVAÇÕES');
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(220,232,255);
      const ls2 = doc.splitTextToSize(os.observacoes, W-2*M-4);
      doc.text(ls2, M+2, y); y += ls2.length*5+4;
    }

    // Fotos (até 3)
    if(fotos.length){
      if(y>215){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
      sec('FOTOS ('+fotos.length+')');
      const pw=(W-2*M-8)/3;
      for(let fi=0;fi<Math.min(fotos.length,3);fi++){
        try{doc.addImage(fotos[fi],'JPEG',M+fi*(pw+4),y,pw,pw*.75,'','FAST');}catch{}
      }
      y += pw*.75+5;
    }

    // Assinatura
    if(os.assinatura){
      if(y>235){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
      sec('ASSINATURA DIGITAL');
      try{doc.addImage(os.assinatura,'PNG',M,y,70,20,'','FAST');}catch{}
      y += 25;
      doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(90,112,153);
      doc.text(nome+' - '+fDateFull(os.criado_em), M, y); y += 7;
    }

    // Termos
    if(p.termos){
      if(y>245){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
      sec('TERMOS');
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(90,112,153);
      const tl = doc.splitTextToSize(p.termos, W-2*M-4);
      doc.text(tl, M+2, y); y += tl.length*4.5+4;
    }

    // Rodapé com hash
    if(y>260){doc.addPage();doc.setFillColor(10,15,30);doc.rect(0,0,W,297,'F');y=M;}
    doc.setFillColor(16,22,38); doc.rect(M,y,W-2*M,20,'F');
    doc.setFont('courier','bold'); doc.setFontSize(7); doc.setTextColor(56,189,248);
    doc.text('DOCUMENTO VÁLIDO — NexOS v4.0', M+3, y+6);
    doc.setFont('courier','normal'); doc.setFontSize(6.5); doc.setTextColor(90,112,153);
    doc.text('OS: #'+os.numero+' | '+fDateFull(os.criado_em), M+3, y+11);
    doc.text('HASH: '+hash, M+3, y+16);
    if(p.pix) doc.text('PIX: '+p.pix, W-M-2, y+13, {align:'right'});

    doc.save('OS_'+os.numero+'_'+nome.replace(/\s+/g,'_')+'.pdf');
    UI.toast('PDF gerado! ✅','success');
  } catch(e) {
    console.error('PDF erro:', e);
    UI.toast('Erro ao gerar PDF: '+e.message,'error');
  }
}



// ════════════════════════════════════════════════════════════
// CLIENTES, ESTOQUE, CAIXA, AGENDA, CONFIG, CARNÊS
// ════════════════════════════════════════════════════════════
function renderClientes() {
  const box = document.getElementById('cli-list'); if(!box) return;
  const q = gv('cli-search','').toLowerCase();
  const list = APP.clientes.filter(c=>!q||c.nome.toLowerCase().includes(q)||(c.telefone||'').includes(q));
  if(!list.length){box.innerHTML='<div class="empty"><span class="empty-ico">👥</span><h3>Nenhum cliente</h3><p>Toque em + para adicionar</p></div>';return;}
  box.innerHTML = list.map(c=>`
    <div class="card" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:13px 15px" onclick="editarCliente('${c.id}')">
      <div>
        <div style="font-size:14px;font-weight:600">${esc(c.nome)}</div>
        <div style="font-family:monospace;font-size:11px;color:var(--muted);margin-top:3px">${esc(c.telefone||'–')} ${c.cpf_cnpj?'| '+esc(c.cpf_cnpj):''}</div>
      </div>
      <button onclick="excluirCliente(event,'${c.id}')" style="background:none;border:none;color:var(--muted2);cursor:pointer;font-size:18px;padding:4px">🗑️</button>
    </div>`).join('');
}

function novoCliente() {
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">👤 Novo Cliente</h3>
    <input type="hidden" id="form-cli-id" value="">
    <label class="req">Nome</label><input type="text" id="form-cli-nome" placeholder="Nome completo">
    <label>Telefone</label><input type="tel" id="form-cli-tel" placeholder="(00) 00000-0000">
    <label>CPF / CNPJ</label><input type="text" id="form-cli-doc" placeholder="000.000.000-00">
    <button class="btn btn-green" style="margin-top:4px" onclick="salvarCliente()">✅ Salvar</button>
  `);
}

function editarCliente(id) {
  const c = APP.clientes.find(x=>x.id===id); if(!c) return;
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">✏️ Editar Cliente</h3>
    <input type="hidden" id="form-cli-id" value="${c.id}">
    <label class="req">Nome</label><input type="text" id="form-cli-nome" value="${esc(c.nome)}">
    <label>Telefone</label><input type="tel" id="form-cli-tel" value="${esc(c.telefone||'')}">
    <label>CPF / CNPJ</label><input type="text" id="form-cli-doc" value="${esc(c.cpf_cnpj||'')}">
    <button class="btn btn-green" style="margin-top:4px" onclick="salvarCliente()">✅ Salvar</button>
  `);
}

async function salvarCliente() {
  const nome = clean(gv('form-cli-nome','').trim(), 100);
  if (!nome) { UI.toast('Nome obrigatório','w'); return; }
  const d = { id:gv('form-cli-id','')||undefined, nome, telefone:clean(gv('form-cli-tel',''),20), cpf_cnpj:clean(gv('form-cli-doc',''),20) };
  try {
    const saved = await API.saveCliente(STATE.user.id, d);
    if (d.id) { const i=APP.clientes.findIndex(x=>x.id===d.id); if(i!==-1)APP.clientes[i]=saved; }
    else APP.clientes.push(saved);
    UI.toast('Cliente salvo!','s');
    closeModal();
    renderClientes();
  } catch(e) { UI.toast('Erro: '+e.message,'e'); }
}

async function excluirCliente(e, id) {
  e.stopPropagation();
  if (!confirm('Excluir este cliente?')) return;
  try {
    await API.deleteCliente(STATE.user.id, id);
    APP.clientes = APP.clientes.filter(c=>c.id!==id);
    UI.toast('Cliente excluído!','s');
    renderClientes();
  } catch(err) { UI.toast('Erro: '+err.message,'e'); }
}

// ════════════════════════════════════════════════════════
// ESTOQUE
// ════════════════════════════════════════════════════════
function renderEstoque() {
  const box = document.getElementById('est-list'); if(!box) return;
  const q = gv('est-search','').toLowerCase();
  const list = APP.produtos.filter(p=>p.ativo!==false&&(!q||p.nome.toLowerCase().includes(q)||(p.codigo||'').toLowerCase().includes(q)));
  if(!list.length){box.innerHTML='<div class="empty"><span class="empty-ico">📦</span><h3>Nenhum produto</h3><p>Toque em + para adicionar</p></div>';return;}
  box.innerHTML = list.map(p=>`
    <div class="prod-item" onclick="editarProduto('${p.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(p.nome)}</div>
          <div style="font-family:monospace;font-size:10px;color:var(--muted)">${p.codigo?'#'+esc(p.codigo)+' · ':''}</div>
        </div>
        <div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--green)">${fmtBRL(p.preco_venda)}</div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <span style="font-family:monospace;font-size:11px;color:${(p.quantidade||0)<=(p.estoque_min||0)?'var(--red)':'var(--green)'}">Est: ${p.quantidade||0} (min:${p.estoque_min||0})</span>
        ${p.preco_custo>0?`<span style="font-family:monospace;font-size:11px;color:var(--blue)">Mg: ${calcMg(p.preco_custo,p.preco_venda)}%</span>`:''}
        <span style="font-family:monospace;font-size:11px;color:var(--muted)">Custo: ${fmtBRL(p.preco_custo)}</span>
      </div>
    </div>`).join('');
}

function novoProduto() {
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">📦 Novo Produto</h3>
    <input type="hidden" id="form-prd-id" value="">
    <label class="req">Nome</label><input type="text" id="form-prd-nome" placeholder="Nome do produto">
    <label>Código / SKU</label><input type="text" id="form-prd-cod" placeholder="SKU-001">
    <div class="frow">
      <div><label>Custo R$</label><input type="number" id="form-prd-custo" step="0.01" oninput="updMg()"></div>
      <div><label>Venda R$</label><input type="number" id="form-prd-venda" step="0.01" oninput="updMg()"></div>
    </div>
    <div id="mg-prev" style="font-family:monospace;font-size:11px;color:var(--blue);margin-bottom:10px"></div>
    <div class="frow">
      <div><label>Quantidade</label><input type="number" id="form-prd-qtd" value="0" min="0"></div>
      <div><label>Estoque Mín.</label><input type="number" id="form-prd-min" value="0" min="0"></div>
    </div>
    <button class="btn btn-green" style="margin-top:4px" onclick="salvarProduto()">✅ Salvar</button>
  `);
}

function editarProduto(id) {
  const p = APP.produtos.find(x=>x.id===id); if(!p) return;
  openModal(`
    <h3 style="margin-bottom:14px;font-size:18px;font-weight:700">✏️ ${esc(p.nome)}</h3>
    <input type="hidden" id="form-prd-id" value="${p.id}">
    <div class="card"><div class="card-title"><div class="ct-bar"></div>Resumo</div>
      <div class="ir"><span class="irl">Venda</span><span class="irv" style="color:var(--green)">${fmtBRL(p.preco_venda)}</span></div>
      <div class="ir"><span class="irl">Custo</span><span class="irv">${fmtBRL(p.preco_custo)}</span></div>
      <div class="ir"><span class="irl">Margem</span><span class="irv" style="color:var(--blue)">${calcMg(p.preco_custo,p.preco_venda)}%</span></div>
      <div class="ir"><span class="irl">Estoque</span><span class="irv" style="color:${(p.quantidade||0)<=(p.estoque_min||0)?'var(--red)':'var(--green)'}">${p.quantidade||0}</span></div>
    </div>
    <label>Nome</label><input type="text" id="form-prd-nome" value="${esc(p.nome)}">
    <label>Código</label><input type="text" id="form-prd-cod" value="${esc(p.codigo||'')}">
    <div class="frow">
      <div><label>Custo R$</label><input type="number" id="form-prd-custo" value="${p.preco_custo||0}" step="0.01" oninput="updMg()"></div>
      <div><label>Venda R$</label><input type="number" id="form-prd-venda" value="${p.preco_venda||0}" step="0.01" oninput="updMg()"></div>
    </div>
    <div id="mg-prev" style="font-family:monospace;font-size:11px;color:var(--blue);margin-bottom:10px"></div>
    <div class="frow">
      <div><label>Quantidade</label><input type="number" id="form-prd-qtd" value="${p.quantidade||0}" min="0"></div>
      <div><label>Estoque Mín.</label><input type="number" id="form-prd-min" value="${p.estoque_min||0}" min="0"></div>
    </div>
    <div class="brow" style="margin-top:8px">
      <button class="btn btn-green" onclick="salvarProduto()">✅ Salvar</button>
      <button class="btn btn-red btn-sm" style="flex:.4" onclick="excluirProduto('${p.id}')">🗑️</button>
    </div>
  `);
  setTimeout(updMg, 50);
}

function updMg() {
  const c=parseFloat(gv('form-prd-custo',0)); const v=parseFloat(gv('form-prd-venda',0));
  const el=document.getElementById('mg-prev');
  if(el&&c>0&&v>0) el.textContent=`Margem: ${calcMg(c,v)}% | Lucro: ${fmtBRL(v-c)}`;
  else if(el) el.textContent='';
}

async function salvarProduto() {
  const nome = clean(gv('form-prd-nome','').trim(), 100);
  if(!nome){UI.toast('Nome obrigatório','w');return;}
  const d = { id:gv('form-prd-id','')||undefined, nome, codigo:clean(gv('form-prd-cod',''),50), preco_custo:gv('form-prd-custo',0), preco_venda:gv('form-prd-venda',0), quantidade:gi('form-prd-qtd',0), estoque_min:gi('form-prd-min',0) };
  try {
    const saved = await API.saveProduto(STATE.user.id, d);
    if(d.id){const i=APP.produtos.findIndex(x=>x.id===d.id);if(i!==-1)APP.produtos[i]=saved;}
    else APP.produtos.push(saved);
    UI.toast('Produto salvo!','s'); closeModal(); renderEstoque();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

async function excluirProduto(id) {
  if(!confirm('Excluir produto?'))return;
  try {
    await API.deleteProduto(STATE.user.id, id);
    APP.produtos = APP.produtos.filter(p=>p.id!==id);
    UI.toast('Produto excluído!','s'); closeModal(); renderEstoque();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

// ════════════════════════════════════════════════════════
// CAIXA — direto como V_TEST
// ════════════════════════════════════════════════════════
async function renderCaixa() {
  const dataSel = gv('cx-date', today()) || today();
  try {
    const movs = await API.getCaixa(STATE.user.id, dataSel, dataSel);
    const ent  = movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+(m.valor||0),0);
    const said = movs.filter(m=>m.tipo==='saida').reduce((a,m)=>a+(m.valor||0),0);
    const fiad = movs.filter(m=>m.tipo==='fiado').reduce((a,m)=>a+(m.valor||0),0);

    const cx = document.getElementById('cx-cards');
    if(cx) cx.innerHTML=`
      <div class="cx-card c-green"><div class="cx-num">${fmtBRL(ent)}</div><div class="cx-label">Entradas</div></div>
      <div class="cx-card c-red"><div class="cx-num">${fmtBRL(said)}</div><div class="cx-label">Saídas</div></div>
      <div class="cx-card c-blue"><div class="cx-num">${fmtBRL(ent-said)}</div><div class="cx-label">Saldo</div></div>
      <div class="cx-card c-yellow"><div class="cx-num">${fmtBRL(fiad)}</div><div class="cx-label">Fiado</div></div>`;

    // Por pagamento
    const pp={};
    movs.filter(m=>m.tipo==='entrada').forEach(m=>{pp[m.forma]=(pp[m.forma]||0)+(m.valor||0);});
    const pg = document.getElementById('cx-pags');
    if(pg) pg.innerHTML = Object.keys(pp).length
      ? Object.entries(pp).map(([k,v])=>`<div class="mov-item"><span class="pay-pill pp-${k}">${pagLabel(k)}</span><span class="mov-val mv-e">${fmtBRL(v)}</span></div>`).join('')
      : '<div style="font-size:12px;color:var(--muted2);font-family:monospace">Nenhuma entrada</div>';

    // Movimentações
    const mv = document.getElementById('cx-movs');
    if(mv) mv.innerHTML = movs.length
      ? movs.sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em)).map(m=>`
        <div class="mov-item">
          <div>
            <div class="mov-desc">${esc(m.descricao||'')}</div>
            <div class="mov-meta">${fTime(m.criado_em)}${m.forma?' – '+pagLabel(m.forma):''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mov-val mv-${m.tipo==='saida'?'s':m.tipo==='fiado'?'f':'e'}">${m.tipo==='saida'?'–':'+'}${fmtBRL(m.valor)}</span>
            <button onclick="excluirMov('${m.id}')" style="background:none;border:none;color:var(--muted2);cursor:pointer;font-size:14px">🗑️</button>
          </div>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--muted2);font-family:monospace">Nenhuma movimentação</div>';
  } catch(e) { console.error(e); }
}

async function registrarSaida() {
  const desc = clean(gv('cx-saida-desc','').trim(), 200);
  const val  = parseFloat(gv('cx-saida-val',''));
  if(!desc){UI.toast('Descreva a saída','w');return;}
  if(!val||val<=0){UI.toast('Valor inválido','w');return;}
  const data = gv('cx-date',today())||today();
  try {
    await API.addCaixa(STATE.user.id,{tipo:'saida',descricao:desc,valor:val,forma:'dinheiro',data});
    document.getElementById('cx-saida-desc').value='';
    document.getElementById('cx-saida-val').value='';
    UI.toast('Saída registrada!','s');
    renderCaixa();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

async function excluirMov(id) {
  if(!confirm('Excluir esta movimentação?'))return;
  try {
    await API.deleteCaixa(STATE.user.id, id);
    APP.movs = APP.movs.filter(m=>m.id!==id);
    UI.toast('Excluído!','s'); renderCaixa();
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

// ════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ════════════════════════════════════════════════════════
function renderConfig() {
  const p = STATE.perfil||{};
  document.getElementById('cfg-nome').value    = p.empresa_nome||'';
  document.getElementById('cfg-cnpj').value    = p.cnpj||'';
  document.getElementById('cfg-tel').value     = p.telefone||'';
  document.getElementById('cfg-end').value     = p.endereco||'';
  document.getElementById('cfg-pix').value     = p.pix||'';
  document.getElementById('cfg-termos').value  = p.termos||'';
}

async function salvarConfig() {
  const d = {
    empresa_nome: clean(gv('cfg-nome',''),100),
    cnpj:    clean(gv('cfg-cnpj',''),20),
    telefone:clean(gv('cfg-tel',''),20),
    endereco:clean(gv('cfg-end',''),200),
    pix:     clean(gv('cfg-pix',''),100),
    termos:  clean(gv('cfg-termos',''),800),
  };
  if(!d.empresa_nome){UI.toast('Nome da empresa obrigatório','w');return;}
  try {
    STATE.perfil = await API.upsertPerfil(STATE.user.id, d);
    App._ui();
    UI.toast('Configurações salvas! ✅','s');
  } catch(e){UI.toast('Erro: '+e.message,'e');}
}

// ── Menu usuário ──────────────────────────────────────────
function toggleUserMenu() {
  const ex = document.getElementById('user-menu-dd'); if(ex){ex.remove();return;}
  const p = STATE.perfil||{};
  const m = document.createElement('div'); m.id='user-menu-dd';
  m.style.cssText='position:fixed;bottom:72px;left:10px;right:10px;background:var(--s1);border:1px solid var(--b2);border-radius:16px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:500';
  m.innerHTML=`
    <div style="padding:10px 12px 12px;border-bottom:1px solid var(--b1);margin-bottom:6px">
      <div style="font-size:.88rem;font-weight:700">${esc(p.empresa_nome||'NexOS')}</div>
      <div style="font-size:.72rem;color:var(--muted)">Proprietário</div>
    </div>
    <div class="dropdown-item" id="_cfg_dd">⚙️ Configurações</div>
    <div class="dropdown-sep"></div>
    <div class="dropdown-item danger" id="_out_dd">🚪 Sair</div>`;
  document.body.appendChild(m);
  document.getElementById('_cfg_dd')?.addEventListener('click',()=>{goPage('config');m.remove();});
  document.getElementById('_out_dd')?.addEventListener('click',()=>{m.remove();Auth.logout();});
  setTimeout(()=>{document.addEventListener('click',function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h);}});},50);
}

window.UI = UI;
window.App = App;
async function salvarPIN() {
  const p1=gv('cfg-pin-new',''), p2=gv('cfg-pin-conf','');
  if(p1.length!==4||!/^\d{4}$/.test(p1)){UI.toast('PIN deve ter 4 dígitos','warning');return;}
  if(p1!==p2){UI.toast('PINs não coincidem','warning');return;}
  const pin_hash=btoa(p1);
  try{STATE.perfil=await API.upsertPerfil(STATE.user.id,{pin_hash});UI.toast('PIN salvo! ✅','success');document.getElementById('cfg-pin-new').value='';document.getElementById('cfg-pin-conf').value='';}
  catch(e){UI.toast('Erro: '+e.message,'error');}
}

function updMgPrd(){
  const c=parseFloat(gv('form-prd-custo',0)), v2=parseFloat(gv('form-prd-venda',0));
  const el=document.getElementById('mg-prev');
  if(el&&c>0&&v2>0) el.textContent='Margem: '+calcMargem(c,v2)+'% | Lucro: '+fmt(v2-c);
  else if(el) el.textContent='';
}

// ── Notificações ───────────────────────────────────────────
async function requestNotifPermission() {
  if('Notification'in window && Notification.permission==='default') {
    await Notification.requestPermission().catch(()=>{});
  }
}

// ════════════════════════════════════════════════════════════
// AGENDA
// ════════════════════════════════════════════════════════════
async function renderAgenda() {
  const from = gv('ag-date', today()) || today();
  try {
    const eventos = await API.getAgenda(STATE.user.id, from + 'T00:00:00', from + 'T23:59:59');
    const box = document.getElementById('ag-list'); if (!box) return;
    if (!eventos.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sem compromissos neste dia</div></div>';
      return;
    }
    box.innerHTML = eventos.map(e => `
      <div class="card" style="cursor:pointer" onclick="editarEvento('${e.id}')">
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
  document.getElementById('form-ev-id').value = '';
  document.getElementById('form-ev-data').value = today();
  document.getElementById('form-ev-cor').value = '#38BDF8';
  const sel = document.getElementById('form-ev-cli');
  if (sel) sel.innerHTML = '<option value="">Sem cliente</option>' + APP.clientes.map(c => `<option value="${c.id}">${_e(c.nome)}</option>`).join('');
  const t = document.getElementById('form-ev-title'); if (t) t.textContent = 'Novo Evento';
  goPage('novo-evento');
}

function editarEvento(id) {
  const e = APP.agenda.find(x => x.id === id); if (!e) return;
  document.getElementById('form-ev-id').value    = e.id;
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
  if (!titulo) { UI.toast('Título obrigatório', 'warning'); return; }
  const d = {
    id: gv('form-ev-id', '') || undefined,
    titulo,
    hora:        gv('form-ev-hora', '') || null,
    data_inicio: gv('form-ev-data', today()) + 'T' + (gv('form-ev-hora', '') || '00:00'),
    cliente_id:  gv('form-ev-cli', '') || null,
    cor:         gv('form-ev-cor', '#38BDF8'),
    descricao:   _c(gv('form-ev-desc', ''), 300),
  };
  try {
    const saved = await API.saveEvento(STATE.user.id, d);
    if (d.id) { const i = APP.agenda.findIndex(x => x.id === d.id); if (i !== -1) APP.agenda[i] = saved; }
    else APP.agenda.push(saved);
    UI.toast('Evento salvo! ✅', 'success');
    goBack();
    renderAgenda();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

async function excluirEvento(e, id) {
  e.stopPropagation();
  if (!confirm('Excluir evento?')) return;
  try {
    await API.deleteEvento(STATE.user.id, id);
    APP.agenda = APP.agenda.filter(x => x.id !== id);
    UI.toast('Evento excluído!', 'success');
    renderAgenda();
  } catch(err) { UI.toast('Erro: ' + err.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
// CARNÊS
// ════════════════════════════════════════════════════════════
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
      return `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--blue)">${os ? 'OS #' + os.numero : '–'}</div>
            <div style="font-size:15px;font-weight:600">${_e(nome)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:15px;font-weight:700;color:var(--green)">${fmt(p.valor)}</div>
            <div style="font-size:11px;color:${venc ? 'var(--red)' : 'var(--text-2)'};font-family:var(--mono)">Venc: ${fmtDate(p.vencimento)}</div>
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
  if (!confirm('Confirmar pagamento de ' + fmt(valor) + '?')) return;
  try {
    await API.pagarParcela(STATE.user.id, id, valor, ordemId || null);
    UI.toast('Parcela paga! ✅', 'success');
    renderCarnes();
  } catch(e) { UI.toast('Erro: ' + e.message, 'error'); }
}

function cobrarWA(id, tel, nome, valor, venc) {
  const p   = STATE.perfil || {};
  const msg = `Olá *${nome}*! 👋\n\nPassando para lembrá-lo(a) do pagamento pendente:\n\n💰 *Valor:* ${valor}\n📅 *Vencimento:* ${venc}${p.pix ? '\n\n🔑 *PIX:* ' + p.pix : ''}\n\n_${p.empresa_nome || 'NexOS'}_`;
  const num = (tel || '').replace(/\D/g, '');
  const fone = num.startsWith('55') ? num : '55' + num;
  window.open('https://wa.me/' + fone + '?text=' + encodeURIComponent(msg), '_blank');
}

// ── QR Reader ─────────────────────────────────────────────
let _qrStream = null;
function openQrReader() {
  const w = document.getElementById('qrReaderWrap'); if (!w) return;
  w.classList.add('open');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => { _qrStream = stream; document.getElementById('qrVideo').srcObject = stream; _scanQR(); })
    .catch(() => { UI.toast('Sem acesso à câmera', 'error'); closeQrReader(); });
}
function closeQrReader() {
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  document.getElementById('qrReaderWrap')?.classList.remove('open');
}
function _scanQR() {
  const video = document.getElementById('qrVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  function scan() {
    if (!_qrStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (window.jsQR) {
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
        if (code) {
          closeQrReader();
          const mo = code.data.match(/OS:#(\d+)/);
          if (mo) {
            const num = parseInt(mo[1]);
            const os = APP.os.find(o => o.numero === num);
            if (os) { UI.toast('OS #' + num + ' encontrada!', 'success'); verOS(os.id); }
            else UI.toast('OS #' + num + ' não encontrada', 'warning');
          } else { UI.toast('QR: ' + code.data.slice(0, 40), 'info'); }
          return;
        }
      }
    }
    requestAnimationFrame(scan);
  }
  requestAnimationFrame(scan);
}

// ── Global search ─────────────────────────────────────────
function globalSearch(q) {
  if (!q || q.length < 2) return;
  if (APP._page === 'os' || APP._page === 'dashboard') {
    const el = document.getElementById('os-search'); if (el) { el.value = q; renderOS(); }
  } else if (APP._page === 'clientes') {
    const el = document.getElementById('cli-search'); if (el) { el.value = q; renderClientes(); }
  } else if (APP._page === 'estoque') {
    const el = document.getElementById('est-search'); if (el) { el.value = q; renderEstoque(); }
  }
}

// ── Preencher cliente na Nova OS ──────────────────────────
function preencherCliente(id) {
  const c = APP.clientes.find(x => x.id === id); if (!c) return;
  const nome = document.getElementById('m-cli-nome'); if (nome) nome.value = c.nome;
  const tel  = document.getElementById('m-cli-tel');  if (tel)  tel.value  = c.telefone || '';
  const doc  = document.getElementById('m-cli-doc');  if (doc)  doc.value  = c.cpf || '';
}
Id('est-search'); if (el) { el.value = q; renderEstoque(); }
  }
}

// ── Preencher cliente na Nova OS ──────────────────────────
function preencherCliente(id) {
  const c = APP.clientes.find(x => x.id === id); if (!c) return;
  const nome = document.getElementById('m-cli-nome'); if (nome) nome.value = c.nome;
  const tel  = document.getElementById('m-cli-tel');  if (tel)  tel.value  = c.telefone || '';
  const doc  = document.getElementById('m-cli-doc');  if (doc)  doc.value  = c.cpf || '';
}
