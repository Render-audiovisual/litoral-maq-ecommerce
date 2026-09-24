-- Correos automáticos del ciclo de pedidos sin pago:
-- 1 h: además de marcar follow_up_at, se encola un recordatorio al cliente
--      (customer_payment_reminder).
-- 24 h: además de cancelar, se encola el aviso de vencimiento
--      (customer_order_expired).
--
-- Guarda de 48 h: solo se encolan correos para pedidos creados (recordatorio)
-- o vencidos (vencimiento) en las últimas 48 h. La primera corrida después de
-- aplicar esta migración va a barrer pedidos viejos que siguen pendientes; sin
-- la guarda, clientes con pedidos de hace semanas recibirían un correo fuera de
-- contexto. El event_key único por pedido evita duplicados entre ticks.

alter table public.order_notification_outbox
  drop constraint if exists order_notification_outbox_event_type_check;
alter table public.order_notification_outbox
  add constraint order_notification_outbox_event_type_check check (event_type in (
    'customer_order_received',
    'team_new_order',
    'customer_payment_approved',
    'customer_payment_rejected',
    'customer_order_ready',
    'customer_order_shipped',
    'customer_order_delivered',
    'customer_payment_reminder',
    'customer_order_expired'
  ));

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

revoke all on function public.process_pending_order_lifecycle() from public, anon, authenticated;
grant execute on function public.process_pending_order_lifecycle() to service_role;
