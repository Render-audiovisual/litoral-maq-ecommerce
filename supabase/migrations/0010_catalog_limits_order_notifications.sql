-- Catálogo productivo + outbox de correos operativos.
-- Idempotente: se puede ejecutar más de una vez sin duplicar eventos.

alter table public.products
  add column if not exists purchase_limit integer not null default 3;

alter table public.products drop constraint if exists products_purchase_limit_check;
alter table public.products add constraint products_purchase_limit_check
  check (purchase_limit between 1 and 99);

-- "listo" separa preparación en curso de pedido efectivamente preparado.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in ('pendiente', 'pago_simulado', 'preparando', 'listo', 'enviado', 'entregado', 'cancelado')
);

create or replace function public.enforce_order_purchase_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested record;
  product_record record;
begin
  if jsonb_typeof(new.lines) <> 'array' or jsonb_array_length(new.lines) = 0 then
    raise exception 'El pedido no contiene productos válidos.' using errcode = '23514';
  end if;

  for requested in
    select
      line ->> 'productId' as product_id,
      sum(case
        when (line ->> 'quantity') ~ '^[0-9]+$' then (line ->> 'quantity')::integer
        else 0
      end)::integer as quantity,
      bool_and((line ->> 'quantity') ~ '^[1-9][0-9]*$') as valid_quantity
    from jsonb_array_elements(new.lines) as line
    group by line ->> 'productId'
  loop
    if requested.product_id is null or requested.product_id = '' or not requested.valid_quantity then
      raise exception 'El pedido contiene cantidades inválidas.' using errcode = '23514';
    end if;

    select id, name, active, purchase_limit
      into product_record
      from public.products
      where id = requested.product_id;

    if product_record.id is null or not product_record.active then
      raise exception 'Uno de los productos ya no está disponible.' using errcode = '23514';
    end if;
    if requested.quantity > product_record.purchase_limit then
      raise exception 'El límite por compra de % es %.', product_record.name, product_record.purchase_limit
        using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_enforce_purchase_limits on public.orders;
create trigger orders_enforce_purchase_limits
  before insert or update of lines on public.orders
  for each row execute function public.enforce_order_purchase_limits();

create table if not exists public.order_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  event_type text not null check (event_type in (
    'customer_order_received',
    'team_new_order',
    'customer_payment_approved',
    'customer_payment_rejected',
    'customer_order_ready',
    'customer_order_shipped',
    'customer_order_delivered'
  )),
  event_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists order_notification_outbox_pending_idx
  on public.order_notification_outbox (status, available_at, created_at);
create index if not exists order_notification_outbox_order_idx
  on public.order_notification_outbox (order_id, created_at);

alter table public.order_notification_outbox enable row level security;
revoke all on public.order_notification_outbox from anon, authenticated;

create or replace function public.enqueue_order_notification_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_notification_outbox (order_id, event_type, event_key)
    values
      (new.id, 'customer_order_received', 'order:' || new.id || ':received'),
      (new.id, 'team_new_order', 'order:' || new.id || ':team-new')
    on conflict (event_key) do nothing;
    return new;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'approved' then
      insert into public.order_notification_outbox (order_id, event_type, event_key)
      values (new.id, 'customer_payment_approved', 'order:' || new.id || ':payment-approved')
      on conflict (event_key) do nothing;
    elsif new.payment_status = 'rejected' then
      insert into public.order_notification_outbox (order_id, event_type, event_key)
      values (new.id, 'customer_payment_rejected', 'order:' || new.id || ':payment-rejected')
      on conflict (event_key) do nothing;
    end if;
  end if;

  if new.status is distinct from old.status and new.status = 'listo' then
    insert into public.order_notification_outbox (order_id, event_type, event_key)
    values (new.id, 'customer_order_ready', 'order:' || new.id || ':ready')
    on conflict (event_key) do nothing;
  end if;

  if (new.status is distinct from old.status and new.status = 'enviado')
    or (new.shipping_status is distinct from old.shipping_status and new.shipping_status = 'in_transit') then
    insert into public.order_notification_outbox (order_id, event_type, event_key)
    values (new.id, 'customer_order_shipped', 'order:' || new.id || ':shipped')
    on conflict (event_key) do nothing;
  end if;

  if (new.status is distinct from old.status and new.status = 'entregado')
    or (new.shipping_status is distinct from old.shipping_status and new.shipping_status = 'delivered') then
    insert into public.order_notification_outbox (order_id, event_type, event_key)
    values (new.id, 'customer_order_delivered', 'order:' || new.id || ':delivered')
    on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enqueue_notification_events on public.orders;
create trigger orders_enqueue_notification_events
  after insert or update of status, payment_status, shipping_status, shipping_tracking_number
  on public.orders
  for each row execute function public.enqueue_order_notification_events();

create or replace function public.claim_order_notifications(
  requested_order_id text default null,
  batch_size integer default 10
)
returns setof public.order_notification_outbox
language sql
security definer
set search_path = public
as $$
  update public.order_notification_outbox as outbox
  set
    status = 'sending',
    attempts = attempts + 1,
    updated_at = now()
  where outbox.id in (
    select candidate.id
    from public.order_notification_outbox as candidate
    where (
        candidate.status in ('pending', 'failed')
        or (candidate.status = 'sending' and candidate.updated_at < now() - interval '10 minutes')
      )
      and candidate.available_at <= now()
      and candidate.attempts < 8
      and (requested_order_id is null or candidate.order_id = requested_order_id)
    order by candidate.created_at
    for update skip locked
    limit greatest(1, least(batch_size, 25))
  )
  returning outbox.*;
$$;

revoke all on function public.claim_order_notifications(text, integer) from public, anon, authenticated;
grant execute on function public.claim_order_notifications(text, integer) to service_role;
