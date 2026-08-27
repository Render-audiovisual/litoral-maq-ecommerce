-- Checkout Pro desacoplado del frontend. Los secretos y la confirmación del
-- pago viven exclusivamente en Edge Functions; la vuelta del navegador nunca
-- aprueba una orden.

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in (
    'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back'
  ));

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders (id) on delete cascade,
  provider text not null default 'mercadopago',
  external_reference text not null,
  preference_id text unique,
  payment_id text unique,
  amount numeric not null check (amount >= 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back')
  ),
  status_detail text,
  checkout_url text,
  live_mode boolean,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx
  on public.payments (status, updated_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago',
  event_key text not null,
  provider_event_id text,
  payment_id text,
  action text,
  live_mode boolean,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, event_key)
);

create index if not exists payment_events_payment_idx
  on public.payment_events (payment_id, received_at desc);

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists payments_select_own_or_admin on public.payments;
create policy payments_select_own_or_admin on public.payments
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders
      where orders.id = payments.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin on public.payment_events
  for select using (public.is_admin());

grant select on public.payments to authenticated;
grant select on public.payment_events to authenticated;

-- Reemplaza la versión extendida en 0007 para conservar las mismas garantías
-- al sumar los estados definitivos de Mercado Pago. Los empleados pueden
-- gestionar el estado operativo del pedido, pero no alterar ningún dato de
-- cobro ni de entrega confirmado por backend.
create or replace function public.restrict_employee_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_employee() and not public.is_admin() then
    new.customer_id := old.customer_id;
    new.customer_name := old.customer_name;
    new.email := old.email;
    new.lines := old.lines;
    new.total := old.total;
    new.shipping := old.shipping;
    new.delivery_method := old.delivery_method;
    new.address := old.address;
    new.created_at := old.created_at;
    new.payment_reference := old.payment_reference;
    new.payment_status := old.payment_status;
    new.phone := old.phone;
    new.postal_code := old.postal_code;
    new.province := old.province;
    new.locality := old.locality;
    new.street := old.street;
    new.street_number := old.street_number;
    new.floor := old.floor;
    new.apartment := old.apartment;
    new.address_reference := old.address_reference;
    new.shipping_quote_id := old.shipping_quote_id;
    new.shipping_provider := old.shipping_provider;
    new.shipping_carrier := old.shipping_carrier;
    new.shipping_service := old.shipping_service;
    new.shipping_delivery_type := old.shipping_delivery_type;
    new.shipping_branch_id := old.shipping_branch_id;
    new.shipping_branch_name := old.shipping_branch_name;
    new.shipping_branch_address := old.shipping_branch_address;
    new.shipping_status := old.shipping_status;
    new.shipping_tracking_number := old.shipping_tracking_number;
    new.shipping_label_ready := old.shipping_label_ready;
  end if;
  return new;
end;
$$;
