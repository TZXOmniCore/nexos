/**
 * nexos_gateway.js
 * Camada de abstração de gateway de pagamento para NexOS.
 * Troque GATEWAY_PROVIDER para mudar o gateway sem alterar o resto do código.
 *
 * Suportados: 'mercadopago' | 'asaas' | 'stripe'
 */

// ─────────────────────────────────────────────
// CONFIGURAÇÃO  ← só mude aqui
// ─────────────────────────────────────────────
const GATEWAY_CONFIG = {
  provider: 'asaas',          // 'mercadopago' | 'asaas' | 'stripe'

  // Chave pública (segura para o frontend)
  publicKey: 'SUA_PUBLIC_KEY_AQUI',

  // Endpoint da Supabase Edge Function que faz a ponte com o Asaas.
  // Troque <project-ref> pelo seu Project Reference ID (Supabase Dashboard → Settings → General).
  backendUrl: 'https://<project-ref>.supabase.co/functions/v1/payments',

  // Planos (IDs criados no painel do gateway escolhido)
  planIds: {
    basico:   { monthly: 'PLAN_BASICO_MENSAL',   annual: 'PLAN_BASICO_ANUAL'   },
    pro:      { monthly: 'PLAN_PRO_MENSAL',       annual: 'PLAN_PRO_ANUAL'       },
    premium:  { monthly: 'PLAN_PREMIUM_MENSAL',   annual: 'PLAN_PREMIUM_ANUAL'   },
  },

  // Período de trial em dias
  trialDays: 7,
};

// ─────────────────────────────────────────────
// INTERFACE PÚBLICA
// ─────────────────────────────────────────────

const NexOSGateway = {

  /**
   * Inicia o checkout de assinatura.
   * @param {object} opts
   * @param {string} opts.plan    - 'basico' | 'pro' | 'premium'
   * @param {string} opts.billing - 'monthly' | 'annual'
   * @param {object} opts.customer - { name, email, cpfCnpj, phone? }
   */
  async checkout({ plan, billing, customer }) {
    const planId = GATEWAY_CONFIG.planIds[plan]?.[billing];
    if (!planId) throw new Error(`Plano inválido: ${plan}/${billing}`);

    const provider = PROVIDERS[GATEWAY_CONFIG.provider];
    if (!provider) throw new Error(`Gateway não suportado: ${GATEWAY_CONFIG.provider}`);

    return provider.checkout({ planId, customer, config: GATEWAY_CONFIG });
  },

  /**
   * Consulta assinatura ativa do tenant.
   * @param {string} tenantId
   * @returns {{ active: boolean, plan: string, expiresAt: string, status: string }}
   */
  async getSubscription(tenantId) {
    const res = await _post('/subscription/status', { tenantId });
    return res;
  },

  /**
   * Cancela assinatura (entra em vigor no fim do ciclo).
   * @param {string} subscriptionId
   */
  async cancel(subscriptionId) {
    return _post('/subscription/cancel', { subscriptionId });
  },

  /**
   * Atualiza plano (upgrade/downgrade).
   */
  async changePlan({ subscriptionId, newPlan, newBilling }) {
    const planId = GATEWAY_CONFIG.planIds[newPlan]?.[newBilling];
    return _post('/subscription/change', { subscriptionId, planId });
  },

  /**
   * Retorna URL do portal de gerenciamento (faturas, cartão etc.)
   */
  async getBillingPortalUrl(customerId) {
    const res = await _post('/billing/portal', { customerId });
    return res.url;
  },

  /** Gateway ativo */
  get provider() { return GATEWAY_CONFIG.provider; },
};

// ─────────────────────────────────────────────
// IMPLEMENTAÇÕES POR GATEWAY
// ─────────────────────────────────────────────

const PROVIDERS = {

  // ── ASAAS ──────────────────────────────────
  asaas: {
    async checkout({ planId, customer, config }) {
      /**
       * Asaas não tem checkout hospedado nativo para assinaturas recorrentes via frontend.
       * O fluxo é: backend cria o cliente + assinatura → retorna link de pagamento.
       * Documentação: https://docs.asaas.com/reference/criar-nova-assinatura
       */
      const res = await _post('/subscription/create', {
        gateway: 'asaas',
        planId,
        trialDays: config.trialDays,
        customer: {
          name: customer.name,
          email: customer.email,
          cpfCnpj: customer.cpfCnpj,
          phone: customer.phone,
        },
      });

      if (res.invoiceUrl) {
        window.location.href = res.invoiceUrl;
      }
      return res;
    },
  },

  // ── MERCADO PAGO ───────────────────────────
  mercadopago: {
    async checkout({ planId, customer, config }) {
      /**
       * Mercado Pago Subscriptions API.
       * Backend cria a preapproval_plan e retorna init_point.
       * Documentação: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/landing
       */
      const res = await _post('/subscription/create', {
        gateway: 'mercadopago',
        planId,
        trialDays: config.trialDays,
        customer: {
          name: customer.name,
          email: customer.email,
          cpfCnpj: customer.cpfCnpj,
        },
      });

      if (res.initPoint) {
        window.location.href = res.initPoint;
      }
      return res;
    },
  },

  // ── STRIPE ─────────────────────────────────
  stripe: {
    async checkout({ planId, customer, config }) {
      /**
       * Stripe Checkout Session.
       * Backend cria a session e retorna a URL.
       * Documentação: https://stripe.com/docs/billing/subscriptions/checkout
       */
      const res = await _post('/subscription/create', {
        gateway: 'stripe',
        planId,
        trialDays: config.trialDays,
        customer: {
          name: customer.name,
          email: customer.email,
        },
        // Stripe não exige CPF/CNPJ na criação, mas você pode adicionar como metadata
      });

      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
      return res;
    },
  },
};

// ─────────────────────────────────────────────
// WEBHOOK HANDLER (referência — roda no backend)
// ─────────────────────────────────────────────
/**
 * Cole isso na sua Supabase Edge Function ou servidor Node:
 *
 * import { createClient } from '@supabase/supabase-js';
 *
 * export default async function handler(req) {
 *   const payload = await req.json();
 *
 *   // Valide a assinatura do webhook conforme o gateway
 *   // Asaas: header 'asaas-access-token'
 *   // Mercado Pago: header 'x-signature'
 *   // Stripe: stripe.webhooks.constructEvent(body, sig, secret)
 *
 *   const event = normalizeWebhookEvent(payload);
 *
 *   const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
 *
 *   switch (event.type) {
 *     case 'subscription.activated':
 *       await supabase.from('subscriptions').upsert({
 *         tenant_id: event.tenantId,
 *         plan: event.plan,
 *         status: 'active',
 *         expires_at: event.expiresAt,
 *         gateway_subscription_id: event.subscriptionId,
 *       });
 *       break;
 *     case 'subscription.payment_failed':
 *       await supabase.from('subscriptions').update({ status: 'past_due' })
 *         .eq('gateway_subscription_id', event.subscriptionId);
 *       break;
 *     case 'subscription.cancelled':
 *       await supabase.from('subscriptions').update({ status: 'cancelled' })
 *         .eq('gateway_subscription_id', event.subscriptionId);
 *       break;
 *   }
 *
 *   return new Response('ok', { status: 200 });
 * }
 */

// ─────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────

async function _post(path, body) {
  const url = GATEWAY_CONFIG.backendUrl + path;

  // Envia o JWT do usuário autenticado para a Edge Function validar
  const session = window.SUPABASE_CLIENT
    ? (await window.SUPABASE_CLIENT.auth.getSession())?.data?.session
    : null;
  const token = session?.access_token ?? '';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Erro no gateway de pagamento');
  }

  return res.json();
}

// ─────────────────────────────────────────────
// EXPORTAÇÃO
// ─────────────────────────────────────────────
// Se usar módulos ES6:
// export default NexOSGateway;

// Se usar script tag global:
window.NexOSGateway = NexOSGateway;
