/**
 * nexos_plan_control.js
 * Controle de acesso por plano de assinatura — NexOS.
 *
 * Uso:
 *   await NexOSPlans.init(tenantId);          // carrega plano do Supabase
 *   NexOSPlans.can('os:create');              // boolean
 *   await NexOSPlans.enforce('os:create');   // lança erro se não pode
 *   NexOSPlans.getLimit('os_per_month');      // número ou Infinity
 */

// ─────────────────────────────────────────────
// DEFINIÇÃO DOS PLANOS
// ─────────────────────────────────────────────

const PLAN_DEFINITIONS = {
  trial: {
    label: 'Trial',
    features: ['os:create', 'os:view', 'client:create', 'client:view', 'product:view'],
    limits: {
      os_per_month: 10,
      clients: 10,
      users: 1,
    },
  },
  basico: {
    label: 'Básico',
    features: [
      'os:create', 'os:view', 'os:edit', 'os:delete',
      'client:create', 'client:view', 'client:edit',
      'product:create', 'product:view', 'product:edit',
      'dashboard:basic',
    ],
    limits: {
      os_per_month: 100,
      clients: 50,
      users: 1,
    },
  },
  pro: {
    label: 'Profissional',
    features: [
      'os:create', 'os:view', 'os:edit', 'os:delete',
      'client:create', 'client:view', 'client:edit', 'client:delete',
      'product:create', 'product:view', 'product:edit', 'product:delete',
      'transaction:create', 'transaction:view',
      'report:export',
      'dashboard:advanced',
      'users:manage',
      'financial:view',
    ],
    limits: {
      os_per_month: Infinity,
      clients: Infinity,
      users: 5,
    },
  },
  premium: {
    label: 'Premium',
    features: [
      'os:create', 'os:view', 'os:edit', 'os:delete',
      'client:create', 'client:view', 'client:edit', 'client:delete',
      'product:create', 'product:view', 'product:edit', 'product:delete',
      'transaction:create', 'transaction:view',
      'report:export',
      'dashboard:advanced',
      'users:manage',
      'financial:view',
      'api:access',
      'whitelabel',
      'multitenant',
      'support:priority',
    ],
    limits: {
      os_per_month: Infinity,
      clients: Infinity,
      users: Infinity,
    },
  },
};

// ─────────────────────────────────────────────
// ESTADO INTERNO
// ─────────────────────────────────────────────

let _state = {
  initialized: false,
  tenantId: null,
  plan: null,       // nome do plano: 'basico' | 'pro' | 'premium' | 'trial'
  status: null,     // 'active' | 'trial' | 'past_due' | 'cancelled' | 'expired'
  expiresAt: null,
  definition: null, // referência ao PLAN_DEFINITIONS[plan]
};

// ─────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────

const NexOSPlans = {

  /**
   * Carrega a assinatura ativa do tenant a partir do Supabase.
   * Deve ser chamado logo após o login do usuário.
   */
  async init(tenantId) {
    if (!tenantId) throw new Error('tenantId é obrigatório');
    _state.tenantId = tenantId;

    const sub = await _fetchSubscription(tenantId);

    _state.plan       = sub?.plan     ?? 'trial';
    _state.status     = sub?.status   ?? 'trial';
    _state.expiresAt  = sub?.expires_at ?? null;
    _state.definition = PLAN_DEFINITIONS[_state.plan] ?? PLAN_DEFINITIONS.trial;
    _state.initialized = true;

    _applyUiLocks();
    return _state;
  },

  /**
   * Verifica se a feature está disponível no plano atual.
   * @param {string} feature - ex: 'os:create', 'report:export'
   * @returns {boolean}
   */
  can(feature) {
    _requireInit();
    if (_state.status === 'cancelled' || _state.status === 'expired') return false;
    return _state.definition.features.includes(feature);
  },

  /**
   * Lança erro se a feature não estiver disponível.
   * Use antes de qualquer operação protegida.
   */
  enforce(feature) {
    if (!this.can(feature)) {
      const err = new Error(
        `Recurso indisponível no plano ${_state.definition.label}. Faça upgrade para acessar.`
      );
      err.code = 'PLAN_LIMIT';
      err.feature = feature;
      throw err;
    }
  },

  /**
   * Retorna o limite numérico para uma métrica.
   * @param {'os_per_month'|'clients'|'users'} metric
   * @returns {number} - Infinity = ilimitado
   */
  getLimit(metric) {
    _requireInit();
    return _state.definition.limits[metric] ?? 0;
  },

  /**
   * Verifica se o tenant atingiu um limite.
   * @param {'os_per_month'|'clients'|'users'} metric
   * @param {number} currentCount - valor atual
   * @returns {boolean}
   */
  isAtLimit(metric, currentCount) {
    const lim = this.getLimit(metric);
    return lim !== Infinity && currentCount >= lim;
  },

  /**
   * Retorna estado completo da assinatura.
   */
  getState() {
    return { ..._state };
  },

  /**
   * Plano e status atuais (útil para exibição na UI).
   */
  get planName() { return _state.definition?.label ?? '—'; },
  get status()   { return _state.status ?? '—'; },
  get isActive() {
    return ['active', 'trial'].includes(_state.status);
  },

  /**
   * Redireciona para a página de planos.
   */
  redirectToUpgrade() {
    window.dispatchEvent(new CustomEvent('nexos:navigate', { detail: { page: 'plans' } }));
  },
};

// ─────────────────────────────────────────────
// SUPABASE — busca assinatura
// ─────────────────────────────────────────────

async function _fetchSubscription(tenantId) {
  // Requer window.SUPABASE_CLIENT inicializado no app principal
  const client = window.SUPABASE_CLIENT;
  if (!client) {
    console.warn('[NexOSPlans] SUPABASE_CLIENT não encontrado. Usando trial como fallback.');
    return null;
  }

  const { data, error } = await client
    .from('subscriptions')
    .select('plan, status, expires_at, gateway_subscription_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('[NexOSPlans] Erro ao buscar assinatura:', error);
  }

  // Verifica expiração
  if (data?.expires_at) {
    const expired = new Date(data.expires_at) < new Date();
    if (expired) return { ...data, status: 'expired' };
  }

  return data;
}

// ─────────────────────────────────────────────
// UI LOCKS — desabilita elementos sem permissão
// ─────────────────────────────────────────────

function _applyUiLocks() {
  /**
   * Qualquer elemento com data-requires="feature:name" é automaticamente
   * desabilitado ou ocultado se o plano não contemplar a feature.
   *
   * Exemplo de uso no HTML:
   *   <button data-requires="report:export" id="btn-export">Exportar</button>
   *   <a data-requires="api:access" href="/api-docs">API</a>
   */
  document.querySelectorAll('[data-requires]').forEach(el => {
    const feature = el.getAttribute('data-requires');
    if (!NexOSPlans.can(feature)) {
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
        el.disabled = true;
        el.title = `Disponível a partir do plano Profissional`;
      } else {
        el.style.opacity = '0.4';
        el.style.pointerEvents = 'none';
        el.title = `Disponível a partir do plano Profissional`;
      }
      // Adiciona cadeado
      const lock = document.createElement('span');
      lock.textContent = ' 🔒';
      lock.style.fontSize = '12px';
      el.appendChild(lock);
    }
  });

  // Banner de status para inadimplência
  if (_state.status === 'past_due') {
    _showBanner('⚠️ Pagamento pendente. Regularize sua assinatura para manter o acesso.', 'warning');
  }
  if (_state.status === 'expired' || _state.status === 'cancelled') {
    _showBanner('🔒 Sua assinatura expirou. Renove para continuar usando o NexOS.', 'error');
  }
}

function _showBanner(msg, type) {
  const existing = document.getElementById('nexos-plan-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'nexos-plan-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    padding: 12px 20px; text-align: center;
    font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer;
    background: ${type === 'error' ? '#ff4d6d' : '#f5c842'};
    color: ${type === 'error' ? '#fff' : '#0a0b0e'};
  `;
  banner.textContent = msg + ' (Clique para ver planos)';
  banner.onclick = () => NexOSPlans.redirectToUpgrade();
  document.body.prepend(banner);
}

// ─────────────────────────────────────────────
// GUARDS PARA USO EM FUNÇÕES DO NEXOS
// ─────────────────────────────────────────────

/**
 * Use como interceptador antes de salvar OS, cliente, etc.
 *
 * Exemplo:
 *   async function createOS(data) {
 *     await planGuard('os:create', 'os_per_month', currentOsCount);
 *     // ... lógica de criação
 *   }
 */
async function planGuard(feature, limitMetric, currentCount) {
  NexOSPlans.enforce(feature);

  if (limitMetric && NexOSPlans.isAtLimit(limitMetric, currentCount)) {
    const limit = NexOSPlans.getLimit(limitMetric);
    const err = new Error(
      `Limite atingido: ${limit} ${limitMetric.replace('_', ' ')} no plano ${NexOSPlans.planName}. Faça upgrade para continuar.`
    );
    err.code = 'PLAN_LIMIT';
    throw err;
  }
}

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

function _requireInit() {
  if (!_state.initialized) throw new Error('[NexOSPlans] Chame NexOSPlans.init(tenantId) primeiro.');
}

// ─────────────────────────────────────────────
// EXPORTAÇÃO
// ─────────────────────────────────────────────
window.NexOSPlans = NexOSPlans;
window.planGuard  = planGuard;
