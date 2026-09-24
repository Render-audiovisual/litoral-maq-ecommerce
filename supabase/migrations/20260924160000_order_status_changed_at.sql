-- Cuándo cambió por última vez el estado (o el pago) de cada pedido.
-- El panel marca como "demorado" un pedido que lleva demasiado tiempo en el
-- mismo paso (pagado sin preparar, listo sin retirar, enviado sin cerrar) y
-- `orders` solo tenía created_at. Lo mantiene un trigger, así cuenta igual
-- venga el cambio del panel, del webhook de Mercado Pago o del cron.
-- Los grants de `orders` son por tabla (0006_grants.sql): la columna nueva
-- queda cubierta sin tocar RLS ni permisos.

alter table public.orders
  add column if not exists status_changed_at timestamptz;

update public.orders
set status_changed_at = created_at
where status_changed_at is null;

alter table public.orders
  alter column status_changed_at set default now();

create or replace function public.orders_touch_status_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, now());
  elsif new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_touch_status_changed_at_trg on public.orders;
create trigger orders_touch_status_changed_at_trg
  before insert or update on public.orders
  for each row
  execute function public.orders_touch_status_changed_at();
