-- NexOS hardening: RLS por dono_id + billing/subscription base
-- Execute no SQL editor do Supabase com role de admin.

create extension if not exists pgcrypto;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid,
    nullif(auth.jwt() ->> 'dono_id', '')::uuid,
    auth.uid()
  );
$$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  gateway text not null check (gateway in ('stripe','asaas','mercadopago')),
  gateway_customer_id text,
  gateway_subscription_id text unique,
  plan text not null check (plan in ('trial','basico','pro','premium')),
  billing_cycle text not null check (billing_cycle in ('monthly','annual')),
  status text not null check (status in ('trial','active','past_due','cancelled','expired','unpaid')),
  starts_at timestamptz default now(),
  expires_at timestamptz,
  cancel_at_period_end boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_tenant_status on public.subscriptions(tenant_id, status);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_owner on public.subscriptions;
create policy subscriptions_select_owner on public.subscriptions
for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists subscriptions_update_owner on public.subscriptions;
create policy subscriptions_update_owner on public.subscriptions
for update to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

revoke insert, delete on public.subscriptions from authenticated, anon;

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_id text,
  event_type text not null,
  payload jsonb not null,
  processed boolean default false,
  processed_at timestamptz,
  error text,
  created_at timestamptz default now(),
  unique (gateway, event_id)
);

alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from anon, authenticated;

-- Exemplo para aplicar em cada tabela com dono_id:
-- alter table public.clientes enable row level security;
-- create policy clientes_owner_all on public.clientes
--   for all to authenticated
--   using (dono_id = public.current_tenant_id())
--   with check (dono_id = public.current_tenant_id());
