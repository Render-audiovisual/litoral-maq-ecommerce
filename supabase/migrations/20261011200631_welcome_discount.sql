-- Additive promotion ledger. No Auth, profiles, roles or payment configuration changes.
create table public.welcome_discount_claims (
  customer_id uuid primary key,
  order_id text not null unique references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.welcome_discount_claims enable row level security;
revoke all on public.welcome_discount_claims from public, anon, authenticated;
grant all on public.welcome_discount_claims to service_role;
alter table public.orders add column if not exists welcome_discount_amount numeric not null default 0 check (welcome_discount_amount >= 0);

-- Only a server-verified payment preparation may set this metadata.
create function public.protect_welcome_discount_amount() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('service_role', 'postgres') then
    if tg_op = 'INSERT' then new.welcome_discount_amount := 0;
    else new.welcome_discount_amount := old.welcome_discount_amount;
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_protect_welcome_discount before insert or update on public.orders
for each row execute function public.protect_welcome_discount_amount();

create function public.welcome_discount_status(p_customer uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select case
    when exists(select 1 from public.orders where customer_id=p_customer and payment_status in ('approved','refunded','charged_back')) then jsonb_build_object('eligible',false,'reason','used')
    when exists(select 1 from public.welcome_discount_claims where customer_id=p_customer) then jsonb_build_object('eligible',true,'pendingOrderId',(select order_id from public.welcome_discount_claims where customer_id=p_customer))
    else jsonb_build_object('eligible',true)
  end;
$$;
revoke all on function public.welcome_discount_status(uuid) from public, anon, authenticated;
grant execute on function public.welcome_discount_status(uuid) to service_role;

create function public.reserve_welcome_discount(p_customer uuid,p_order text) returns boolean
language plpgsql security invoker set search_path = public as $$
declare existing_order text;
begin
  -- Serialize this account across two tabs and concurrent Edge Function calls.
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text, 0));
  if not exists(select 1 from public.orders where id=p_order and customer_id=p_customer and payment_status='pending' and status <> 'cancelado') then
    raise exception 'Pedido inválido para este beneficio';
  end if;
  if exists(select 1 from public.orders where customer_id=p_customer and payment_status in ('approved','refunded','charged_back')) then return false; end if;
  select order_id into existing_order from public.welcome_discount_claims where customer_id=p_customer;
  if existing_order = p_order then return true; end if;
  if existing_order is not null then
    -- An issued preference may contain a delayed payment. Never hand the same
    -- benefit to another payable order merely because the browser was closed.
    -- Release only an expired reservation that NEVER reached Mercado Pago.
    if exists(select 1 from public.orders o where o.id=existing_order and (o.status='cancelado' or o.expires_at <= now())
      and not exists(select 1 from public.payments p where p.order_id=o.id)) then
      update public.welcome_discount_claims set order_id=p_order,created_at=now() where customer_id=p_customer;
      return true;
    end if;
    raise exception 'El beneficio está reservado en el pedido %', existing_order;
  end if;
  insert into public.welcome_discount_claims(customer_id,order_id) values(p_customer,p_order);
  return true;
end;
$$;
revoke all on function public.reserve_welcome_discount(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_welcome_discount(uuid,text) to service_role;
