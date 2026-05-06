/**
 * NexOS — Edge Function: /api/payments-webhook
 * Recebe eventos do Asaas e atualiza o status da assinatura no Supabase.
 *
 * Deploy:  supabase functions deploy payments-webhook
 * URL:     https://<project>.supabase.co/functions/v1/payments-webhook
 *
 * Configure essa URL no painel do Asaas:
 *   Configurações → Notificações → Webhook URL
 *
 * Variáveis de ambiente necessárias:
 *   ASAAS_WEBHOOK_TOKEN      → token definido por você no painel Asaas
 *   SUPABASE_SERVICE_ROLE_KEY → (automático)
 *   SUPABASE_URL              → (automático)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // ── 1. Validar token do webhook ──────────────────────────────
  const token = req.headers.get('asaas-access-token') ?? '';
  if (token !== Deno.env.get('ASAAS_WEBHOOK_TOKEN')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const event   = payload?.event ?? '';
  const sub     = payload?.subscription ?? payload?.payment ?? {};

  console.log('[webhook] evento:', event, '| externalRef:', sub.externalReference);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const tenantId = sub.externalReference; // foi gravado na criação
  if (!tenantId) {
    console.warn('[webhook] externalReference ausente — ignorando');
    return new Response('ok', { status: 200 });
  }

  // ── 2. Mapear evento → ação ──────────────────────────────────
  switch (event) {

    // Pagamento confirmado → assinatura ativa
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      const expiresAt = _nextCycle(sub.dueDate, sub.cycle);
      await supabase.from('subscriptions').upsert({
        tenant_id:               tenantId,
        status:                  'active',
        expires_at:              expiresAt,
        gateway_subscription_id: sub.subscription ?? sub.id,
      }, { onConflict: 'tenant_id' });
      break;
    }

    // Pagamento vencido / falhou
    case 'PAYMENT_OVERDUE':
    case 'PAYMENT_DELETED': {
      await supabase.from('subscriptions')
        .update({ status: 'past_due' })
        .eq('tenant_id', tenantId);
      break;
    }

    // Assinatura cancelada
    case 'SUBSCRIPTION_DELETED':
    case 'PAYMENT_REFUNDED': {
      await supabase.from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('tenant_id', tenantId);
      break;
    }

    default:
      console.log('[webhook] evento não tratado:', event);
  }

  return new Response('ok', { status: 200 });
});

// ── Calcular próximo vencimento ──────────────────────────────
function _nextCycle(dueDate: string, cycle: string): string {
  const d = new Date(dueDate ?? new Date());
  if (cycle === 'YEARLY')  d.setFullYear(d.getFullYear() + 1);
  else                     d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
