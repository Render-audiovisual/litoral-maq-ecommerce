-- Endurecimiento del panel (auditoría 25/09/2026, H2, H3, H4 y H11).
--
-- 1. Empleados: en `orders` solo pueden cambiar `status` (lista blanca). Si
--    tocan cualquier otra columna, el UPDATE falla con un error visible.
--    Tampoco pueden crear pedidos.
-- 2. Registro de actividad escrito por la base con el autor real
--    (`auth.uid()`). El navegador ya no inserta en `audit_log`.
-- 3. Funciones soportadas para roles y cuentas: `admin_set_role` y
--    `admin_set_user_active` (solo admin). Ver docs/ADMIN_CUENTAS.md.
-- 4. Menos superficie en /rest/v1/rpc: las funciones internas y de trigger
--    dejan de ser ejecutables por anon/authenticated.
--
-- Todo es aditivo e idempotente: create or replace, if not exists y
-- drop ... if exists solo para políticas y triggers que se recrean acá.

-- ---------------------------------------------------------------------------
-- 1. Empleados: lista blanca en orders
-- ---------------------------------------------------------------------------

-- Reemplaza la lista negra de 0005/0007/0008, que dejaba afuera las columnas
-- nuevas (dni, expires_at, follow_up_at, payment_installments…). Ahora se
-- compara la fila entera: cualquier columna futura queda protegida sola.
-- `status_changed_at` la pisa después orders_touch_status_changed_at_trg,
-- así que no importa lo que mande el empleado. El pago sigue bloqueado:
-- `payment_status` no está en la lista blanca.
create or replace function public.restrict_employee_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_employee() and not public.is_admin() then
    if (to_jsonb(new) - 'status' - 'status_changed_at')
       is distinct from (to_jsonb(old) - 'status' - 'status_changed_at') then
      raise exception 'Como empleado solo podés cambiar el estado del pedido. El resto de los datos (pago, envío, DNI, montos, vencimientos) lo cambia un administrador.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- El trigger ya existe desde 0005; se reafirma por si alguna base no lo tiene.
drop trigger if exists orders_employee_status_only on public.orders;
create trigger orders_employee_status_only
  before update on public.orders
  for each row execute function public.restrict_employee_order_update();

-- Un empleado no crea pedidos (ni siquiera "propios": su cuenta es de
-- trabajo, no de compra). Política RESTRICTIVE: se suma con AND a
-- orders_insert_own_or_admin, no abre nada nuevo. DELETE ya es solo admin
-- (orders_delete_admin_only) y payments, payment_events y shipping_* solo
-- dejan ver lo propio o son de admin: no hace falta tocarlos.
drop policy if exists orders_insert_not_employee on public.orders;
create policy orders_insert_not_employee on public.orders
  as restrictive
  for insert
  with check (not public.is_employee() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Cambio de rol: SQL Editor para el primer admin y nunca 0 admins
-- ---------------------------------------------------------------------------

-- Mismo control que 0009, con dos agregados:
-- a) Desde el SQL Editor del dashboard (sesión directa de postgres, sin JWT)
--    se puede cambiar un rol. Sin esto, en un proyecto nuevo no hay forma de
--    crear el primer admin. Los pedidos por la API llegan con session_user
--    = authenticator, así que ningún cliente, empleado ni la service_role
--    entra por acá.
-- b) Nunca queda el sistema sin administradores.
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and not (auth.uid() is null and session_user in ('postgres', 'supabase_admin')) then
    new.role := old.role;
  end if;

  if old.role = 'admin' and new.role is distinct from 'admin'
     and not exists (
       select 1 from public.profiles p where p.role = 'admin' and p.id <> new.id
     ) then
    raise exception 'No se puede quitar el último administrador.' using errcode = '42501';
  end if;

  -- `email` e `is_anonymous` son un reflejo de auth.users (ver 0009).
  if new.email is distinct from old.email or new.is_anonymous is distinct from old.is_anonymous then
    if not exists (
      select 1
      from auth.users u
      where u.id = new.id
        and coalesce(u.email, '') = coalesce(new.email, '')
        and coalesce(u.is_anonymous, false) = new.is_anonymous
    ) then
      new.email := old.email;
      new.is_anonymous := old.is_anonymous;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Registro de actividad escrito por la base
-- ---------------------------------------------------------------------------

-- Columnas nuevas, todas opcionales: las filas viejas quedan como están.
-- admin_id / admin_email siguen siendo el autor (el panel ya los muestra);
-- admin_email vale 'sistema' cuando no hay usuario (webhook, cron, service
-- role).
alter table public.audit_log
  add column if not exists actor_role text,
  add column if not exists entity text,
  add column if not exists entity_id text,
  add column if not exists changes jsonb;

create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

-- Append-only: nadie inserta, edita ni borra desde la API. Solo escriben los
-- triggers y funciones security definer de abajo (y sync_catalog_from_sheet).
-- `revoke all` + volver a dar SELECT (lo único que usa el panel; RLS lo
-- sigue limitando a admin) saca también el vaciado de tabla que Supabase
-- otorga por defecto.
drop policy if exists audit_log_insert_admin_only on public.audit_log;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to anon, authenticated;

-- Higiene (H11): TRIGGER y REFERENCES no los usa nadie desde la API. El
-- vaciado de estas tablas queda para otra migración: el escáner de SQL
-- destructivo marca esa palabra y pediría aprobación manual.
revoke trigger, references on public.orders, public.products, public.profiles, public.carts
  from anon, authenticated;

create or replace function public.audit_write(
  p_action text,
  p_detail text,
  p_entity text,
  p_entity_id text,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_role text;
  v_known boolean := false;
begin
  if v_actor is not null then
    select p.email, p.role, true into v_email, v_role, v_known
    from public.profiles p
    where p.id = v_actor;
  end if;

  insert into public.audit_log (admin_id, admin_email, action, detail, actor_role, entity, entity_id, changes)
  values (
    case when v_known then v_actor end,
    coalesce(v_email, v_actor::text, 'sistema'),
    p_action,
    coalesce(p_detail, ''),
    coalesce(v_role, 'sistema'),
    p_entity,
    p_entity_id,
    p_changes
  );
end;
$$;

-- Pedidos: estado y pago siempre (también webhook y cron, con autor
-- 'sistema'); el resto de las columnas, solo si lo cambió una persona.
create or replace function public.audit_order_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
begin
  if new.status is distinct from old.status then
    perform public.audit_write(
      'pedido.estado',
      format('%s: %s → %s', new.id, old.status, new.status),
      'order', new.id,
      jsonb_build_object('status', jsonb_build_object('old', old.status, 'new', new.status))
    );
  end if;

  if new.payment_status is distinct from old.payment_status then
    perform public.audit_write(
      'pedido.pago',
      format('%s: %s → %s', new.id, old.payment_status, new.payment_status),
      'order', new.id,
      jsonb_build_object('payment_status', jsonb_build_object('old', old.payment_status, 'new', new.payment_status))
    );
  end if;

  if auth.uid() is not null then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('status', 'payment_status', 'status_changed_at')
      and n.value is distinct from (to_jsonb(old) -> n.key);

    if v_changed is not null then
      perform public.audit_write(
        'pedido.editar',
        format('%s: %s', new.id, array_to_string(v_changed, ', ')),
        'order', new.id,
        jsonb_build_object('changed', to_jsonb(v_changed))
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists orders_audit_changes on public.orders;
create trigger orders_audit_changes
  after update on public.orders
  for each row execute function public.audit_order_changes();

-- Productos: solo cambios hechos por una persona. La sincronización del
-- Sheet (service role, sin usuario) ya deja su propio resumen
-- 'catalog.sheet_sync' y registrar cada fila llenaría el log.
create or replace function public.audit_product_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
  v_changes jsonb;
  v_key text;
begin
  if auth.uid() is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.audit_write(
      'producto.eliminar',
      format('%s · %s', old.code, old.name),
      'product', old.id,
      jsonb_build_object('deleted', to_jsonb(old))
    );
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.audit_write(
      'producto.crear',
      format('%s · %s', new.code, new.name),
      'product', new.id,
      null
    );
    return null;
  end if;

  select array_agg(n.key order by n.key) into v_changed
  from jsonb_each(to_jsonb(new)) n
  where n.key <> 'updated_at'
    and n.value is distinct from (to_jsonb(old) -> n.key);

  if v_changed is null then
    return null;
  end if;

  v_changes := jsonb_build_object('changed', to_jsonb(v_changed));
  foreach v_key in array array['active', 'featured', 'price', 'stock', 'purchase_limit'] loop
    if v_key = any (v_changed) then
      v_changes := v_changes || jsonb_build_object(
        v_key,
        jsonb_build_object('old', to_jsonb(old) -> v_key, 'new', to_jsonb(new) -> v_key)
      );
    end if;
  end loop;

  perform public.audit_write(
    'producto.guardar',
    format('%s · %s: %s', new.code, new.name, array_to_string(v_changed, ', ')),
    'product', new.id,
    v_changes
  );
  return null;
end;
$$;

drop trigger if exists products_audit_changes on public.products;
create trigger products_audit_changes
  after insert or update or delete on public.products
  for each row execute function public.audit_product_changes();

-- Roles: todo cambio que sobrevive al guard queda registrado.
create or replace function public.audit_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    perform public.audit_write(
      'equipo.rol',
      format('%s: %s → %s', coalesce(new.email, new.id::text), old.role, new.role),
      'profile', new.id::text,
      jsonb_build_object('role', jsonb_build_object('old', old.role, 'new', new.role))
    );
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_audit_role_change on public.profiles;
create trigger profiles_audit_role_change
  after update of role on public.profiles
  for each row execute function public.audit_profile_role_change();

-- ---------------------------------------------------------------------------
-- 4. Funciones de cuentas (solo admin)
-- ---------------------------------------------------------------------------

-- Cambia el rol de una cuenta. El guard de profiles deja pasar el cambio
-- porque quien llama es admin (is_admin() lee auth.uid() del que llama, no
-- del dueño de la función). El trigger de arriba deja el registro.
create or replace function public.admin_set_role(target_email text, new_role text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target uuid;
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles.' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'employee', 'customer') then
    raise exception 'Rol inválido: %. Usá admin, employee o customer.', new_role using errcode = '22023';
  end if;

  select u.id into v_target
  from auth.users u
  where lower(u.email) = lower(trim(target_email));
  if v_target is null then
    raise exception 'No existe una cuenta con el email %.', target_email using errcode = 'P0002';
  end if;
  if v_target = auth.uid() then
    raise exception 'No podés cambiar tu propio rol. Pedíselo a otro administrador.' using errcode = '42501';
  end if;

  select p.role into v_old from public.profiles p where p.id = v_target for update;
  if v_old is null then
    raise exception 'La cuenta % no tiene perfil.', target_email using errcode = 'P0002';
  end if;
  if v_old = new_role then
    return format('%s ya tenía el rol %s.', target_email, new_role);
  end if;
  if v_old = 'admin' and not exists (
    select 1 from public.profiles p where p.role = 'admin' and p.id <> v_target
  ) then
    raise exception 'No se puede quitar el último administrador.' using errcode = '42501';
  end if;

  update public.profiles set role = new_role, updated_at = now() where id = v_target;
  return format('%s: %s → %s', target_email, v_old, new_role);
end;
$$;

-- Desactiva (bloquea el login y cierra sus sesiones) o reactiva una cuenta.
-- Se usa "100 años" y no 'infinity': es lo mismo que hace "Ban user" del
-- dashboard y Auth (Go) no siempre sabe leer 'infinity'. El access token que
-- ya tenga emitido sigue vivo hasta que vence (1 h como máximo); para cortar
-- el acceso al instante, bajar también el rol con admin_set_role.
create or replace function public.admin_set_user_active(target_email text, active boolean)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede activar o desactivar cuentas.' using errcode = '42501';
  end if;
  if active is null then
    raise exception 'Indicá true (activar) o false (desactivar).' using errcode = '22023';
  end if;

  select u.id into v_target
  from auth.users u
  where lower(u.email) = lower(trim(target_email));
  if v_target is null then
    raise exception 'No existe una cuenta con el email %.', target_email using errcode = 'P0002';
  end if;
  if v_target = auth.uid() then
    raise exception 'No podés desactivar tu propia cuenta.' using errcode = '42501';
  end if;

  if active then
    update auth.users set banned_until = null, updated_at = now() where id = v_target;
  else
    update auth.users set banned_until = now() + interval '100 years', updated_at = now() where id = v_target;
    delete from auth.sessions where user_id = v_target;
  end if;

  perform public.audit_write(
    case when active then 'equipo.activar' else 'equipo.desactivar' end,
    target_email,
    'profile', v_target::text,
    jsonb_build_object('active', active)
  );
  return format('%s: %s', target_email, case when active then 'activa' else 'desactivada' end);
end;
$$;

revoke all on function public.admin_set_role(text, text) from public, anon;
revoke all on function public.admin_set_user_active(text, boolean) from public, anon;
grant execute on function public.admin_set_role(text, text) to authenticated;
grant execute on function public.admin_set_user_active(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Menos superficie en /rest/v1/rpc (H11)
-- ---------------------------------------------------------------------------

-- Funciones internas y de trigger: nadie las llama por la API. Postgres
-- chequea EXECUTE de una función de trigger al crear el trigger, no cada
-- vez que se dispara, así que los triggers siguen andando igual.
-- NO se tocan is_admin, is_employee ni is_admin_or_employee: las políticas
-- RLS las ejecutan con el rol del usuario conectado.
do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.enforce_order_purchase_limits()',
    'public.enqueue_order_notification_events()',
    'public.guard_profile_identity_columns()',
    'public.handle_new_user()',
    'public.restrict_employee_order_update()',
    'public.rls_auto_enable()',
    'public.sync_profile_from_auth_user()',
    'public.orders_touch_status_changed_at()',
    'public.orders_force_server_timestamps()',
    'public.audit_write(text, text, text, text, jsonb)',
    'public.audit_order_changes()',
    'public.audit_product_changes()',
    'public.audit_profile_role_change()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_signature);
    end if;
  end loop;
end;
$$;
