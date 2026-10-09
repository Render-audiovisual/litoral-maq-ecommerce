-- Retira exclusivamente los dos pedidos de prueba que el dueño autorizó
-- eliminar el 2026-10-09. Los perfiles y las cuentas de Auth se conservan.
--
-- Las validaciones hacen que la migración falle completa si los datos reales
-- no coinciden exactamente con lo revisado en el panel administrativo.
do $$
declare
  franco_order_count integer;
  abba_order_count integer;
begin
  select count(*)
    into franco_order_count
  from public.orders as orders
  join public.profiles as profiles on profiles.id = orders.customer_id
  where lower(trim(profiles.name)) = 'franco'
    and coalesce(trim(profiles.email), '') = ''
    and regexp_replace(coalesce(profiles.phone, ''), '[^0-9]', '', 'g') = '3794530578'
    and orders.total = 1000
    and orders.status <> 'pago_simulado'
    and (orders.payment_status = 'approved' or orders.status = 'entregado')
    and (orders.created_at at time zone 'America/Argentina/Cordoba')::date = date '2026-09-07';

  select count(*)
    into abba_order_count
  from public.orders as orders
  join public.profiles as profiles on profiles.id = orders.customer_id
  where lower(trim(profiles.name)) = 'abba distribuidora'
    and lower(trim(profiles.email)) = 'abbadistribuidora2@gmail.com'
    and regexp_replace(coalesce(profiles.phone, ''), '[^0-9]', '', 'g') = '3794009782'
    and orders.total = 1000
    and orders.status <> 'pago_simulado'
    and (orders.payment_status = 'approved' or orders.status = 'entregado')
    and (orders.created_at at time zone 'America/Argentina/Cordoba')::date = date '2026-09-07';

  if franco_order_count <> 1 then
    raise exception
      'Se esperaba exactamente 1 pedido de prueba de Franco y se encontraron %; no se eliminó nada.',
      franco_order_count;
  end if;

  if abba_order_count <> 1 then
    raise exception
      'Se esperaba exactamente 1 pedido de prueba de Abba Distribuidora y se encontraron %; no se eliminó nada.',
      abba_order_count;
  end if;

  delete from public.orders
  where id in (
    select orders.id
    from public.orders as orders
    join public.profiles as profiles on profiles.id = orders.customer_id
    where orders.total = 1000
      and orders.status <> 'pago_simulado'
      and (orders.payment_status = 'approved' or orders.status = 'entregado')
      and (orders.created_at at time zone 'America/Argentina/Cordoba')::date = date '2026-09-07'
      and (
        (
          lower(trim(profiles.name)) = 'franco'
          and coalesce(trim(profiles.email), '') = ''
          and regexp_replace(coalesce(profiles.phone, ''), '[^0-9]', '', 'g') = '3794530578'
        )
        or (
          lower(trim(profiles.name)) = 'abba distribuidora'
          and lower(trim(profiles.email)) = 'abbadistribuidora2@gmail.com'
          and regexp_replace(coalesce(profiles.phone, ''), '[^0-9]', '', 'g') = '3794009782'
        )
      )
  );
end;
$$;
