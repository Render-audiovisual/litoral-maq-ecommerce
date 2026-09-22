-- Ciclo comercial de pedidos sin pago:
-- 1 h: quedan listos para seguimiento manual desde el panel.
-- 24 h: se cancelan y dejan de mezclarse con ventas activas.

alter table public.orders
  add column if not exists follow_up_at timestamptz,
  add column if not exists expires_at timestamptz;

update public.orders
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.orders
  alter column expires_at set default (now() + interval '24 hours');

create index if not exists orders_pending_lifecycle_idx
  on public.orders (payment_status, status, expires_at)
  where payment_status = 'pending' and status = 'pendiente';

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
  update public.orders
  set follow_up_at = now()
  where payment_status = 'pending'
    and status = 'pendiente'
    and follow_up_at is null
    and created_at <= now() - interval '1 hour'
    and coalesce(expires_at, created_at + interval '24 hours') > now();
  get diagnostics follow_up_count = row_count;

  update public.orders
  set
    status = 'cancelado',
    payment_status = 'cancelled'
  where payment_status = 'pending'
    and status = 'pendiente'
    and coalesce(expires_at, created_at + interval '24 hours') <= now();
  get diagnostics expired_count = row_count;

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
