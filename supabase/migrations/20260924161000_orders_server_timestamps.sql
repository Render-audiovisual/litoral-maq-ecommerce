-- Las fechas de un pedido nuevo las pone el servidor, no el navegador.
-- La política de insert (0007_shipping_enviopack.sql) no restringe
-- created_at, expires_at ni follow_up_at: un cliente que llamara directo a la
-- API REST podía crear un pedido que no vence nunca (expires_at = 2099),
-- estirar su propia reserva de 24 h o fecharlo hacia atrás. Mismo criterio que
-- orders_touch_status_changed_at (20260924160000): en el INSERT manda now().
-- Ningún alta legítima depende de fechas propias: el checkout manda
-- created_at con la hora del navegador y recibe de vuelta la fila guardada.
-- Solo INSERT: los UPDATE (ciclo de vida, panel, webhook) no se tocan.

create or replace function public.orders_force_server_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.follow_up_at := null;
  return new;
end;
$$;

drop trigger if exists orders_force_server_timestamps_trg on public.orders;
create trigger orders_force_server_timestamps_trg
  before insert on public.orders
  for each row
  execute function public.orders_force_server_timestamps();
