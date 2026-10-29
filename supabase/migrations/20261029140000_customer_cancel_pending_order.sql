-- 1) El cliente puede cancelar (arrepentimiento) su propio pedido sin pagar.
-- 2) El beneficio de bienvenida deja de quedar trabado por un pedido que ya no
--    se puede pagar (cancelado o vencido), aunque haya llegado a Mercado Pago.

create or replace function public.cancel_own_pending_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión para cancelar el pedido.' using errcode = '28000';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and customer_id = v_uid
   for update;
  if not found then
    raise exception 'No encontramos ese pedido en tu cuenta.' using errcode = 'P0002';
  end if;
  -- Solo un pedido que todavía no se pagó. Uno acreditado lo gestiona el equipo.
  if v_order.payment_status <> 'pending' or v_order.status <> 'pendiente' then
    raise exception 'Este pedido ya no se puede cancelar desde acá. Escribinos por WhatsApp.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'cancelado', payment_status = 'cancelled'
   where id = p_order_id;
  update public.payments
     set status = 'cancelled', updated_at = now()
   where order_id = p_order_id and status = 'pending';
  -- El beneficio vuelve a estar disponible para la próxima compra.
  delete from public.welcome_discount_claims where order_id = p_order_id;

  return jsonb_build_object('id', p_order_id, 'status', 'cancelado');
end;
$$;

revoke all on function public.cancel_own_pending_order(text) from public, anon;
grant execute on function public.cancel_own_pending_order(text) to authenticated;

-- El estado del beneficio solo informa "pedido pendiente" si ese pedido todavía
-- se puede pagar. Antes bastaba con que existiera la reserva y el checkout
-- quedaba bloqueado para siempre aunque el pedido hubiera vencido.
create or replace function public.welcome_discount_status(p_customer uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select case
    when exists(select 1 from public.orders where customer_id=p_customer and payment_status in ('approved','refunded','charged_back')) then jsonb_build_object('eligible',false,'reason','used')
    when exists(
      select 1 from public.welcome_discount_claims c
      join public.orders o on o.id = c.order_id
      where c.customer_id = p_customer
        and o.status <> 'cancelado' and o.payment_status = 'pending'
        and coalesce(o.expires_at, o.created_at + interval '24 hours') > now()
    ) then jsonb_build_object('eligible',true,'pendingOrderId',(select order_id from public.welcome_discount_claims where customer_id=p_customer))
    else jsonb_build_object('eligible',true)
  end;
$$;
revoke all on function public.welcome_discount_status(uuid) from public, anon, authenticated;
grant execute on function public.welcome_discount_status(uuid) to service_role;

-- Un pedido cancelado o vencido libera la reserva salvo que tenga un pago
-- acreditado o en curso. Antes alcanzaba con que existiera cualquier intento de
-- pago (aunque estuviera cancelado) para retenerla.
create or replace function public.reserve_welcome_discount(p_customer uuid,p_order text) returns boolean
language plpgsql security invoker set search_path = public as $$
declare existing_order text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text, 0));
  if not exists(select 1 from public.orders where id=p_order and customer_id=p_customer and payment_status='pending' and status <> 'cancelado') then
    raise exception 'Pedido inválido para este beneficio';
  end if;
  if exists(select 1 from public.orders where customer_id=p_customer and payment_status in ('approved','refunded','charged_back')) then return false; end if;
  select order_id into existing_order from public.welcome_discount_claims where customer_id=p_customer;
  if existing_order = p_order then return true; end if;
  if existing_order is not null then
    if exists(select 1 from public.orders o where o.id=existing_order and (o.status='cancelado' or o.expires_at <= now())
      and not exists(select 1 from public.payments p where p.order_id=o.id and p.status in ('pending','approved'))) then
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
