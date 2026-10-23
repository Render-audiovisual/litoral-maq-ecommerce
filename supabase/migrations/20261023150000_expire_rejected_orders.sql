-- Los pedidos con pago rechazado quedaban en "pendiente" para siempre y
-- engordaban el contador del panel. Ahora se cancelan al vencer (24 h).
create or replace function public.process_pending_order_lifecycle()
returns table (follow_up_marked integer, expired_cancelled integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  follow_up_count integer := 0;
  expired_count integer := 0;
begin
  with marked as (
    update public.orders
    set follow_up_at = now()
    where payment_status = 'pending'
      and status = 'pendiente'
      and follow_up_at is null
      and created_at <= now() - interval '1 hour'
      and coalesce(expires_at, created_at + interval '24 hours') > now()
    returning id, created_at, email
  ), queued as (
    insert into public.order_notification_outbox (order_id, event_type, event_key)
    select id, 'customer_payment_reminder', 'order:' || id || ':reminder'
    from marked
    where created_at > now() - interval '48 hours'
      and nullif(btrim(email), '') is not null
    on conflict (event_key) do nothing
    returning 1
  )
  select count(*) into follow_up_count from marked;

  with cancelled as (
    update public.orders
    set
      status = 'cancelado',
      payment_status = 'cancelled'
    where payment_status = 'pending'
      and status = 'pendiente'
      and coalesce(expires_at, created_at + interval '24 hours') <= now()
    returning id, created_at, expires_at, email
  ), queued as (
    insert into public.order_notification_outbox (order_id, event_type, event_key)
    select id, 'customer_order_expired', 'order:' || id || ':expired'
    from cancelled
    where coalesce(expires_at, created_at + interval '24 hours') > now() - interval '48 hours'
      and nullif(btrim(email), '') is not null
    on conflict (event_key) do nothing
    returning 1
  )
  select count(*) into expired_count from cancelled;

  -- Pagos rechazados que nadie reintentó: se cierran al vencer igual que los
  -- pendientes, pero en silencio (el cliente ya sabe que su pago falló y puede
  -- haber vuelto a comprar). Conservan payment_status = 'rejected'.
  update public.orders
  set status = 'cancelado'
  where payment_status = 'rejected'
    and status = 'pendiente'
    and coalesce(expires_at, created_at + interval '24 hours') <= now();

  update public.payments
  set status = 'cancelled', updated_at = now()
  where status = 'pending'
    and order_id in (
      select id from public.orders
      where payment_status = 'cancelled' and status = 'cancelado'
    );

  return query select follow_up_count, expired_count;
end;
$$;
