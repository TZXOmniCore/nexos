// ═══════════════════════════════════════════════════════════
// NEXOS v2.0 — API.JS
// ══════════════════════════════════════════════════════════

const SUPA_URL = 'https://twxotfzlronfjfjyaklx.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eG90Znpscm9uZmpmanlha2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzA5NjAsImV4cCI6MjA4ODE0Njk2MH0.QqOg_dFtoGJfNJ_-l58AMeWeynYJL8wIczO5QU-nY1A';

window.sb = supabase.createClient(SUPA_URL, SUPA_KEY);

// ── helpers internos ──
const _eid = () => window.STATE?.empresa?.id;
const _uid = () => window.STATE?.user?.id;

// ═══════════════════════════════════════════════════════════
const API = {

  // ─────────────────────
  // AUTH
  // ─────────────────────
  auth: {
    getSession:  ()                  => sb.auth.getSession(),
    getUser:     ()                  => sb.auth.getUser(),
    signIn:      (email, pw)         => sb.auth.signInWithPassword({ email, password: pw }),
    signUp:      (email, pw, meta)   => sb.auth.signUp({ email, password: pw, options: { data: meta } }),
    signOut:     ()                  => sb.auth.signOut(),
    resetPw:     (email, url)        => sb.auth.resetPasswordForEmail(email, { redirectTo: url }),
    google:      (url)               => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: url } }),
    onChange:    (cb)                => sb.auth.onAuthStateChange(cb),
  },

  // ─────────────────────
  // PERFIL / EMPRESA
  // ─────────────────────
  perfil: {
    get: (userId) =>
      sb.from('usuarios')
        .select('*,empresas(*,planos(*))')
        .eq('id', userId)
        .single(),

    updateAcesso: (userId) =>
      sb.from('usuarios')
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq('id', userId),

    registrarEmpresa: (nomeEmpresa, nomeUsuario, userId) =>
      sb.rpc('registrar_empresa', {
        p_nome_empresa: nomeEmpresa,
        p_nome_usuario: nomeUsuario,
        p_user_id:      userId,
      }),
  },

  empresa: {
    update: (dados) =>
      sb.from('empresas').update(dados).eq('id', _eid()),

    getPlanos: () =>
      sb.from('planos').select('*').eq('ativo', true),

    alterarPlano: (empresaId, planoId) =>
      sb.from('empresas').update({
        plano_id:       planoId,
        plano_vence_em: new Date(Date.now() + 30 * 864e5).toISOString(),
      }).eq('id', empresaId),

    bloquear: (empresaId, bloquear) =>
      sb.from('empresas').update({
        bloqueada:       bloquear,
        motivo_bloqueio: bloquear ? 'Bloqueado pelo admin' : null,
      }).eq('id', empresaId),
  },

  // ─────────────────────
  // ORDENS DE SERVIÇO
  // ─────────────────────
  os: {
    listar: () =>
      sb.from('ordens')
        .select('*')
        .eq('empresa_id', _eid())
        .order('criado_em', { ascending: false })
        .limit(200),

    inserir: (dados) =>
      sb.from('ordens').insert(dados).select().single(),

    atualizar: (id, dados) =>
      sb.from('ordens').update(dados).eq('id', id),

    deletar: (id) =>
      sb.from('ordens').delete().eq('id', id),

    historico: {
      listar: (osId) =>
        sb.from('ordens_historico')
          .select('*')
          .eq('ordem_id', osId)
          .order('criado_em', { ascending: false }),

      inserir: (osId, acao, descricao) =>
        sb.from('ordens_historico').insert({
          ordem_id:     osId,
          usuario_id:   _uid(),
          usuario_nome: window.STATE?.perfil?.nome,
          acao,
          descricao,
        }),
    },
  },

  // ─────────────────────
  // PARCELAS (CARNÊ)
  // ─────────────────────
  parcelas: {
    listar: (osId) =>
      sb.from('parcelas')
        .select('*')
        .eq('ordem_id', osId)
        .order('numero'),

    inserir: (lista) =>
      sb.from('parcelas').insert(lista),

    pagar: (parcId) =>
      sb.from('parcelas').update({
        pago:     true,
        pago_em:  new Date().toISOString(),
        pago_por: _uid(),
      }).eq('id', parcId),
  },

  // ─────────────────────
  // CAIXA
  // ─────────────────────
  caixa: {
    listar: () =>
      sb.from('caixa')
        .select('*')
        .eq('empresa_id', _eid())
        .order('criado_em', { ascending: false })
        .limit(500),

    inserir: (dados) =>
      sb.from('caixa').insert({
        empresa_id: _eid(),
        usuario_id: _uid(),
        ...dados,
      }),
  },

  // ─────────────────────
  // PRODUTOS / ESTOQUE
  // ─────────────────────
  produtos: {
    listar: () =>
      sb.from('produtos')
        .select('*')
        .eq('empresa_id', _eid())
        .eq('ativo', true)
        .order('nome'),

    inserir: (dados) =>
      sb.from('produtos').insert({ empresa_id: _eid(), ...dados }),

    atualizar: (id, dados) =>
      sb.from('produtos').update(dados).eq('id', id),

    desativar: (id) =>
      sb.from('produtos').update({ ativo: false }).eq('id', id),
  },

  // ─────────────────────
  // CLIENTES
  // ─────────────────────
  clientes: {
    listar: () =>
      sb.from('clientes')
        .select('*')
        .eq('empresa_id', _eid())
        .order('nome'),

    inserir: (dados) =>
      sb.from('clientes').insert({ empresa_id: _eid(), ...dados }),

    atualizar: (id, dados) =>
      sb.from('clientes').update(dados).eq('id', id),
  },

  // ─────────────────────
  // NOTIFICAÇÕES
  // ─────────────────────
  notifs: {
    listar: () =>
      sb.from('notificacoes')
        .select('*')
        .eq('usuario_id', _uid())
        .order('criado_em', { ascending: false })
        .limit(30),

    marcarLida: (id) =>
      sb.from('notificacoes').update({ lida: true }).eq('id', id),

    marcarTodasLidas: () =>
      sb.from('notificacoes').update({ lida: true }).eq('usuario_id', _uid()),
  },

  // ─────────────────────
  // WHATSAPP CONFIG
  // ─────────────────────
  whatsapp: {
    get: () =>
      sb.from('whatsapp_config')
        .select('*')
        .eq('empresa_id', _eid())
        .single(),

    salvar: (dados) =>
      sb.from('whatsapp_config').upsert(
        { empresa_id: _eid(), ...dados },
        { onConflict: 'empresa_id' }
      ),
  },

  // ─────────────────────
  // MASTER ADMIN
  // ─────────────────────
  master: {
    listarEmpresas: () =>
      sb.from('empresas')
        .select('*,planos(*)')
        .order('criado_em', { ascending: false }),

    listarEntradas: () =>
      sb.from('caixa').select('valor,tipo').eq('tipo', 'entrada'),
  },

  // ─────────────────────
  // IA — via Edge Function (chave fica no servidor)
  // ─────────────────────
  ia: {
    chamar: async (prompt, maxTokens = 600) => {
      try {
        const res = await fetch(`${SUPA_URL}/functions/v1/ia-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${SUPA_KEY}`,
          },
          body: JSON.stringify({ prompt, maxTokens }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.error ? null : (data.text ?? null);
      } catch {
        return null;
      }
    },
  },

  // ─────────────────────
  // REALTIME
  // ─────────────────────
  realtime: {
    iniciar: (empresaId, userId, callbacks) =>
      sb.channel('nexos-rt')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'ordens',
          filter: `empresa_id=eq.${empresaId}`,
        }, callbacks.onOS)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'caixa',
          filter: `empresa_id=eq.${empresaId}`,
        }, callbacks.onCaixa)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notificacoes',
          filter: `usuario_id=eq.${userId}`,
        }, callbacks.onNotif)
        .subscribe(),
  },

};

window.API = API;
