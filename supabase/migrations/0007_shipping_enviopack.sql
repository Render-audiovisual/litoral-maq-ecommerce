-- Integración logística desacoplada. Envíopack es el primer proveedor, pero
-- las tablas guardan `provider` para poder sumar Andreani sin cambiar pedidos,
-- checkout ni seguimiento.

alter table public.products
  add column if not exists shipping_weight_kg numeric,
  add column if not exists shipping_height_cm integer,
  add column if not exists shipping_width_cm integer,
  add column if not exists shipping_length_cm integer,
  add column if not exists shipping_enabled boolean not null default false;

alter table public.products
  drop constraint if exists products_shipping_dimensions_positive;
alter table public.products
  add constraint products_shipping_dimensions_positive check (
    (shipping_weight_kg is null or shipping_weight_kg > 0) and
    (shipping_height_cm is null or shipping_height_cm > 0) and
    (shipping_width_cm is null or shipping_width_cm > 0) and
    (shipping_length_cm is null or shipping_length_cm > 0)
  );

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  request_hash text not null,
  carrier_id text not null,
  carrier_name text not null,
  dispatch_mode text not null check (dispatch_mode in ('D', 'S')),
  delivery_mode text not null check (delivery_mode in ('D', 'S')),
  service text not null,
  amount numeric not null check (amount >= 0),
  eta_hours integer,
  branch_id text,
  branch_name text,
  branch_address text,
  packages jsonb not null,
  destination jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shipping_quotes_customer_idx
  on public.shipping_quotes (customer_id, created_at desc);
create index if not exists shipping_quotes_expires_idx
  on public.shipping_quotes (expires_at);

alter table public.orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists phone text,
  add column if not exists postal_code text,
  add column if not exists province text,
  add column if not exists locality text,
  add column if not exists street text,
  add column if not exists street_number text,
  add column if not exists floor text,
  add column if not exists apartment text,
  add column if not exists address_reference text,
  add column if not exists shipping_quote_id uuid,
  add column if not exists shipping_provider text,
  add column if not exists shipping_carrier text,
  add column if not exists shipping_service text,
  add column if not exists shipping_delivery_type text,
  add column if not exists shipping_branch_id text,
  add column if not exists shipping_branch_name text,
  add column if not exists shipping_branch_address text,
  add column if not exists shipping_status text,
  add column if not exists shipping_tracking_number text,
  add column if not exists shipping_label_ready boolean not null default false;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'approved', 'rejected', 'refunded'));
alter table public.orders drop constraint if exists orders_shipping_delivery_type_check;
alter table public.orders add constraint orders_shipping_delivery_type_check
  check (shipping_delivery_type is null or shipping_delivery_type in ('domicilio', 'sucursal'));
alter table public.orders drop constraint if exists orders_shipping_status_check;
alter table public.orders add constraint orders_shipping_status_check check (
  shipping_status is null or shipping_status in (
    'manual_quote', 'quoted', 'creating', 'processing', 'ready',
    'in_transit', 'delivered', 'cancelled', 'error'
  )
);

-- Un comprador puede crear su pedido, pero jamás autoconfirmar el pago ni
-- inyectar datos que indiquen que ya existe una guía. El administrador conserva
-- la excepción necesaria para altas operativas.
drop policy if exists orders_insert_own_or_admin on public.orders;
create policy orders_insert_own_or_admin on public.orders
  for insert with check (
    public.is_admin() or (
      auth.uid() = customer_id and
      payment_status = 'pending' and
      shipping_tracking_number is null and
      shipping_label_ready = false and
      (shipping_status is null or shipping_status in ('manual_quote', 'quoted'))
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_quote_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_shipping_quote_id_fkey
      foreign key (shipping_quote_id) references public.shipping_quotes (id);
  end if;
end $$;

create table if not exists public.shipping_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders (id) on delete cascade,
  provider text not null,
  external_order_id text not null,
  provider_order_id text,
  provider_shipment_id text,
  carrier_id text,
  carrier_name text,
  service text,
  status text not null default 'creating' check (
    status in ('creating', 'processing', 'ready', 'in_transit', 'delivered', 'cancelled', 'error')
  ),
  provider_condition text,
  provider_subcondition text,
  tracking_number text,
  label_ready boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shipping_shipments_provider_id_key
  on public.shipping_shipments (provider, provider_shipment_id)
  where provider_shipment_id is not null;
create index if not exists shipping_shipments_status_idx
  on public.shipping_shipments (status, updated_at);

create table if not exists public.shipping_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  provider_shipment_id text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, dedupe_key)
);

alter table public.shipping_quotes enable row level security;
alter table public.shipping_shipments enable row level security;
alter table public.shipping_events enable row level security;

drop policy if exists shipping_quotes_select_own_or_admin on public.shipping_quotes;
create policy shipping_quotes_select_own_or_admin on public.shipping_quotes
  for select using (customer_id = auth.uid() or public.is_admin());

drop policy if exists shipping_shipments_select_own_or_admin on public.shipping_shipments;
create policy shipping_shipments_select_own_or_admin on public.shipping_shipments
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders
      where orders.id = shipping_shipments.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists shipping_events_select_admin on public.shipping_events;
create policy shipping_events_select_admin on public.shipping_events
  for select using (public.is_admin());

grant select on public.shipping_quotes to authenticated;
grant select on public.shipping_shipments to authenticated;
grant select on public.shipping_events to authenticated;

-- Corrección aditiva: el trigger de 0005 (restrict_employee_order_update)
-- solo protegía las columnas que existían antes de esta migración. Sin este
-- agregado, un empleado (no admin) podía, vía UPDATE permitido por
-- orders_update_employee, aprobar el pago, inventar un tracking o marcar una
-- etiqueta lista. CREATE OR REPLACE: no toca 0005, solo extiende la función.
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
