-- DNI requerido para facturación y logística en nuevos pedidos.
alter table public.orders add column if not exists dni text;

alter table public.orders drop constraint if exists orders_dni_format_check;
alter table public.orders add constraint orders_dni_format_check
  check (dni is null or dni ~ '^[0-9]{7,8}$');

comment on column public.orders.dni is
  'DNI argentino del comprador. Obligatorio en la aplicación para pedidos nuevos; nullable para conservar pedidos históricos.';
