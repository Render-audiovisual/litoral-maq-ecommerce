-- Etapa 5 — políticas RLS de mínimo privilegio.
-- No ejecutar contra un proyecto real todavía. Depende de public.is_admin()
-- definida en 0002_profiles_trigger.sql.

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.carts enable row level security;
alter table public.audit_log enable row level security;

-- profiles: cada quien ve/edita su propio perfil; admin ve/edita todos.
-- No hay policy de INSERT: la crea el trigger handle_new_user (security
-- definer), nunca el cliente. No hay policy de DELETE.
create policy profiles_select_own_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy profiles_update_own_or_admin on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- products: catálogo público de solo lectura (solo activos); admin ve y
-- escribe todo, incluidos inactivos.
create policy products_select_public_active on public.products
  for select using (active = true);

create policy products_select_admin_all on public.products
  for select using (public.is_admin());

create policy products_write_admin_only on public.products
  for insert with check (public.is_admin());

create policy products_update_admin_only on public.products
  for update using (public.is_admin());

create policy products_delete_admin_only on public.products
  for delete using (public.is_admin());

-- orders: el dueño (autenticado real o anónimo) ve y crea sus propios
-- pedidos; nunca los de otro. auth.uid() es NULL para un request sin
-- sesión, por lo que un insert sin identidad (ni siquiera anónima) nunca
-- puede satisfacer "auth.uid() = customer_id". Solo admin cambia el estado.
create policy orders_select_own_or_admin on public.orders
  for select using (auth.uid() = customer_id or public.is_admin());

create policy orders_insert_own_or_admin on public.orders
  for insert with check (auth.uid() = customer_id or public.is_admin());

create policy orders_update_admin_only on public.orders
  for update using (public.is_admin());

create policy orders_delete_admin_only on public.orders
  for delete using (public.is_admin());

-- carts: exclusivamente el dueño, sin excepción admin (no hace falta que el
-- panel vea carritos ajenos).
create policy carts_owner_only on public.carts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- audit_log: solo admin lee o inserta. Sin policies de update/delete →
-- denegado por defecto para todos, incluido admin (rastro inmutable).
create policy audit_log_select_admin_only on public.audit_log
  for select using (public.is_admin());

create policy audit_log_insert_admin_only on public.audit_log
  for insert with check (public.is_admin());
