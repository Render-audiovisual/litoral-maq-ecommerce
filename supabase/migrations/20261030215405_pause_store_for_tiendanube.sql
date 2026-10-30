-- Temporary closure requested by the owner. Additive and reversible: no
-- existing orders, payments, RLS policies or authentication settings change.
-- Reject direct REST inserts too, including stale browser sessions.
create function public.block_new_orders_during_remodeling()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Estamos renovando nuestra tienda. Las compras online están pausadas temporalmente.';
end;
$$;

create trigger orders_block_during_remodeling
before insert on public.orders
for each row execute function public.block_new_orders_during_remodeling();

comment on function public.block_new_orders_during_remodeling() is
  'Temporary Tiendanube migration closure. Remove the trigger in an explicit reopening migration.';
