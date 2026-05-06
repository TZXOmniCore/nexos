/**
 * NexOS — Edge Function: /api/payments
 * Cria assinaturas no Asaas e retorna o link de pagamento.
 *
 * Deploy:  supabase functions deploy payments
 * URL:     https://<project>.supabase.co/functions/v1/payments
 *
 * Variáveis de ambiente necessárias (Supabase Dashboard → Settings → Edge Functions):
 *   ASAAS_API_KEY        → chave secreta do Asaas (começa com $aact_...)
 *   ASAAS_ENV            → 'sandbox' ou 'production'
 *   SUPABASE_URL         → (disponível automaticamente)
 *   SUPABASE_SERVICE_ROLE_KEY → (disponível automaticamente)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ASAAS_BASE = {
  sandbox:    'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/api/v3',
};

// ── CORS ────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. Autenticar o usuário via JWT do Supabase
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) {
      return _error('Não autorizado', 401);
    }

    const body = await req.json();
    const url  = new URL(req.url);
    const path = url.pathname.replace('/functions/v1/payments', '');

    // 2. Rotear chamadas
    if (path === '/subscription/create') {
      return await _createSubscription(body, user.id, supabase);
    }
    if (path === '/subscription/status') {
      return await _getStatus(body, user.id, supabase);
    }
    if (path === '/subscription/cancel') {
      return await _cancelSubscription(body, user.id, supabase);
    }

    return _error('Rota não encontrada', 404);

  } catch (e) {
    console.error('[payments]', e);
    return _error(e.message, 500);
  }
});

// ── Criar assinatura ─────────────────────────────────────────
async function _createSubscription(body: any, tenantId: string, supabase: any) {
  const { customer, planId, trialDays } = body;

  const apiKey = Deno.env.get('ASAAS_API_KEY')!;
  const env    = (Deno.env.get('ASAAS_ENV') ?? 'sandbox') as 'sandbox' | 'production';
  const base   = ASAAS_BASE[env];

  // 2a. Criar ou buscar cliente no Asaas
  const custRes = await fetch(`${base}/customers`, {
    method:  'POST',
    headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:     customer.name,
      email:    customer.email,
      cpfCnpj: customer.cpfCnpj,
      phone:    customer.phone ?? undefined,
      externalReference: tenantId, // ← liga o cliente Asaas ao tenant do NexOS
    }),
  });
  const cust = await custRes.json();
  if (!custRes.ok) return _error(cust.errors?.[0]?.description ?? 'Erro ao criar cliente', 422);

  // 2b. Criar assinatura
  const today = new Date().toISOString().split('T')[0];
  const subRes = await fetch(`${base}/subscriptions`, {
    method:  'POST',
    headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer:         cust.id,
      billingType:      'CREDIT_CARD',
      nextDueDate:      today,
      value:            _planPrice(planId),
      cycle:            _planCycle(planId),
      description:      `NexOS — ${planId}`,
      externalReference: tenantId,
      trialDays:        trialDays ?? 7,
    }),
  });
  const sub = await subRes.json();
  if (!subRes.ok) return _error(sub.errors?.[0]?.description ?? 'Erro ao criar assinatura', 422);

  // 2c. Salvar referência no Supabase (status 'trial' até webhook confirmar pagamento)
  await supabase.from('subscriptions').upsert({
    tenant_id:               tenantId,
    plan:                    _planName(planId),
    status:                  'trial',
    gateway_subscription_id: sub.id,
    gateway_customer_id:     cust.id,
    expires_at:              _trialExpiry(trialDays ?? 7),
  }, { onConflict: 'tenant_id' });

  // 2d. Retornar link de pagamento
  const invoiceUrl = sub.invoiceUrl ?? sub.bankSlipUrl ?? null;
  return _ok({ invoiceUrl, subscriptionId: sub.id });
}

// ── Status da assinatura ─────────────────────────────────────
async function _getStatus(body: any, tenantId: string, supabase: any) {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, expires_at')
    .eq('tenant_id', tenantId)
    .single();

  return _ok(data ?? { status: 'trial', plan: 'trial' });
}

// ── Cancelar assinatura ──────────────────────────────────────
async function _cancelSubscription(body: any, tenantId: string, supabase: any) {
  const { data } = await supabase
    .from('subscriptions')
    .select('gateway_subscription_id')
    .eq('tenant_id', tenantId)
    .single();

  if (!data?.gateway_subscription_id) return _error('Assinatura não encontrada', 404);

  const apiKey = Deno.env.get('ASAAS_API_KEY')!;
  const env    = (Deno.env.get('ASAAS_ENV') ?? 'sandbox') as 'sandbox' | 'production';
  await fetch(`${ASAAS_BASE[env]}/subscriptions/${data.gateway_subscription_id}`, {
    method:  'DELETE',
    headers: { 'access_token': apiKey },
  });

  await supabase.from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId);

  return _ok({ cancelled: true });
}

// ── Helpers ─────────────────────────────────────────────────
function _planPrice(planId: string): number {
  // Ajuste os preços conforme sua tabela
  if (planId.includes('BASICO_ANUAL'))   return 29.90 * 10; // 2 meses grátis
  if (planId.includes('BASICO'))         return 29.90;
  if (planId.includes('PRO_ANUAL'))      return 79.90 * 10;
  if (planId.includes('PRO'))            return 79.90;
  if (planId.includes('PREMIUM_ANUAL'))  return 149.90 * 10;
  return 149.90;
}

function _planCycle(planId: string): string {
  return planId.includes('ANUAL') ? 'YEARLY' : 'MONTHLY';
}

function _planName(planId: string): string {
  if (planId.includes('BASICO'))  return 'basico';
  if (planId.includes('PRO'))     return 'pro';
  return 'premium';
}

function _trialExpiry(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function _ok(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function _error(msg: string, status = 400) {
  return new Response(JSON.stringify({ message: msg }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
