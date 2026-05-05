/**
 * Referência de webhook unificado (Stripe/Asaas/Mercado Pago).
 * Coloque em Edge Function/Backend com SERVICE_ROLE.
 */

export async function handleBillingWebhook({ gateway, eventId, eventType, payload, supabaseAdmin }) {
  await supabaseAdmin.from('billing_webhook_events').upsert({
    gateway,
    event_id: eventId || null,
    event_type: eventType,
    payload,
  }, { onConflict: 'gateway,event_id' });

  const mapped = normalizeBillingEvent(gateway, eventType, payload);
  if (!mapped?.tenant_id) return { ok: true, ignored: true };

  await supabaseAdmin.from('subscriptions').upsert({
    tenant_id: mapped.tenant_id,
    gateway,
    gateway_subscription_id: mapped.gateway_subscription_id,
    gateway_customer_id: mapped.gateway_customer_id,
    plan: mapped.plan || 'basico',
    billing_cycle: mapped.billing_cycle || 'monthly',
    status: mapped.status,
    expires_at: mapped.expires_at || null,
    metadata: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'gateway_subscription_id' });

  return { ok: true };
}

export function normalizeBillingEvent(gateway, eventType, payload) {
  if (gateway === 'stripe') {
    const obj = payload?.data?.object || {};
    if (eventType === 'customer.subscription.deleted') {
      return {
        tenant_id: obj.metadata?.tenant_id,
        gateway_subscription_id: obj.id,
        gateway_customer_id: obj.customer,
        status: 'cancelled',
        plan: obj.metadata?.plan,
        billing_cycle: obj.metadata?.billing_cycle,
        expires_at: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
      };
    }
    if (eventType.startsWith('customer.subscription')) {
      return {
        tenant_id: obj.metadata?.tenant_id,
        gateway_subscription_id: obj.id,
        gateway_customer_id: obj.customer,
        status: obj.status === 'active' ? 'active' : (obj.status || 'trial'),
        plan: obj.metadata?.plan,
        billing_cycle: obj.metadata?.billing_cycle,
        expires_at: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
      };
    }
  }
  return null;
}
