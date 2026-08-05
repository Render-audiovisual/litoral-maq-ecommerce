-- Etapa 8 — RLS para el rol Employee.
-- Employee puede VER todas las órdenes y CAMBIAR SOLO su estado.
-- No se agregan policies para products/categorías/configuración/audit_log:
-- quedan denegadas por defecto para employee, igual que para customer.
-- Depende de public.is_employee() definida en 0004_add_employee_role.sql.

-- SELECT: employee ve todas las órdenes (no es "dueño" de ninguna, a
-- diferencia de un customer). Esta policy se suma a
-- orders_select_own_or_admin (0003) — en Postgres, múltiples policies
-- permissive para el mismo comando se combinan con OR.
create policy orders_select_employee on public.orders
  for select using (public.is_employee());

-- UPDATE: employee puede iniciar un update, pero el trigger de abajo
-- restringe qué columnas puede realmente cambiar (solo status). Sin esa
-- restricción, USING/WITH CHECK de RLS no distinguen columnas.
create policy orders_update_employee on public.orders
  for update using (public.is_employee());

-- Protección a nivel de columna: si quien actualiza es employee (no admin),
-- revertir cualquier columna que no sea "status" a su valor anterior. Mismo
-- patrón que prevent_role_self_escalation en 0002.
create or replace function public.restrict_employee_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_employee() and not public.is_admin() then
    new.customer_id := old.customer_id;
    new.customer_name := old.customer_name;
    new.email := old.email;
    new.lines := old.lines;
    new.total := old.total;
    new.shipping := old.shipping;
    new.delivery_method := old.delivery_method;
    new.address := old.address;
    new.created_at := old.created_at;
    new.payment_reference := old.payment_reference;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_employee_status_only on public.orders;
create trigger orders_employee_status_only
  before update on public.orders
  for each row execute function public.restrict_employee_order_update();
