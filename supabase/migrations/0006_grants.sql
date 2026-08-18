-- Grants de tabla faltantes para anon/authenticated.
-- RLS (0003, 0005) ya define el acceso real fila por fila; sin estos GRANT,
-- PostgREST corta con 401 "permission denied" ANTES de evaluar RLS, incluso
-- para queries que la policy habría dejado pasar (o devuelto vacías). Los
-- grants de abajo solo abren la puerta de tabla que la policy ya exigía;
-- no amplían qué filas se pueden leer o escribir.

-- products: catálogo público de solo lectura para anon (auth.uid() IS NULL);
-- authenticated cubre customer/employee/admin, diferenciados por RLS.
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;

-- orders: anon nunca pasa auth.uid() = customer_id (siempre NULL), así que
-- RLS igual devuelve 0 filas para anon — el select se otorga solo para que
-- el fetch inicial de la store (store.tsx, antes de que exista sesión) no
-- reciba 401 en vez de un array vacío.
grant select on public.orders to anon;
grant select, insert, update on public.orders to authenticated;

-- profiles: mismo motivo que orders (auth.uid() = id nunca matchea para anon).
grant select on public.profiles to anon;
grant select, update on public.profiles to authenticated;
-- Insert lo hace únicamente el trigger handle_new_user (security definer,
-- corre con privilegios de su dueño) — no se otorga insert a ningún rol.

-- audit_log: mismo motivo (is_admin() es false para anon sin sesión).
grant select on public.audit_log to anon;
grant select, insert on public.audit_log to authenticated;

-- carts: nunca se consulta sin ownerId (ver loadCart en supabase-adapter.ts),
-- así que anon jamás dispara esta query — no necesita grant.
grant select, insert, update on public.carts to authenticated;
