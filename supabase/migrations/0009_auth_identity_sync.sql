-- Cuentas de cliente — sincronización de identidad y endurecimiento del
-- perfil.
--
-- Contexto: hasta acá `profiles` solo se llenaba en el INSERT de
-- `auth.users` (trigger `handle_new_user`, 0002). Todo lo que pasa DESPUÉS
-- sobre la misma fila de `auth.users` —vincular un email a un invitado
-- anónimo, confirmar ese email, vincular una identidad de Google— es un
-- UPDATE, y ahí `profiles` quedaba con el estado viejo: `email` en null y
-- `is_anonymous` en true para siempre.
--
-- Antes eso lo escribía el navegador (`profiles.update({ is_anonymous:
-- false, email })` desde el adaptador). Dos problemas: (a) cualquier
-- cliente podía marcarse como cuenta permanente sin confirmar nada, porque
-- RLS le permite actualizar su propia fila; (b) podía escribir un email
-- ajeno y, por el índice único de `profiles.email`, bloquear la conversión
-- real de esa persona.
--
-- Solución: la base sincroniza sola, y el cliente pierde la posibilidad de
-- inventar esos dos campos.

-- 1. Espejo de auth.users → profiles en cada cambio de identidad.
create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set email = new.email,
      is_anonymous = coalesce(new.is_anonymous, false),
      -- El nombre lo elige la persona y puede haberse editado desde el
      -- checkout o el panel; solo se completa si todavía está vacío (caso
      -- típico: invitado anónimo que recién ahora declara su nombre).
      name = case
               when coalesce(p.name, '') = ''
                 then coalesce(new.raw_user_meta_data ->> 'name', p.name)
               else p.name
             end,
      updated_at = now()
  where p.id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_identity_changed on auth.users;
create trigger on_auth_user_identity_changed
  after update of email, is_anonymous, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth_user();

-- 2. Guardia de columnas de identidad en profiles.
-- Reemplaza a `prevent_role_self_escalation` (0002): mismo control de rol,
-- más el de email / is_anonymous. Se mantiene como BEFORE UPDATE para poder
-- revertir el valor en vez de fallar: un UPDATE parcialmente malicioso no
-- rompe el resto de la operación (por ejemplo, guardar el teléfono desde el
-- checkout sigue funcionando).
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El rol admin nunca lo asigna un registro público, ni OAuth, ni la
  -- metadata del navegador: se setea a mano en el proyecto (README §8).
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;

  -- `email` e `is_anonymous` son un reflejo de auth.users, no datos que el
  -- cliente elija. Se acepta el cambio únicamente si coincide con lo que
  -- auth.users YA tiene — que es exactamente el caso del trigger de arriba.
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

drop trigger if exists profiles_role_guard on public.profiles;
drop trigger if exists profiles_identity_guard on public.profiles;
create trigger profiles_identity_guard
  before update on public.profiles
  for each row execute function public.guard_profile_identity_columns();

drop function if exists public.prevent_role_self_escalation();

-- 3. Reafirma el default de rol para altas nuevas.
-- `handle_new_user` (0002) ya escribe 'customer' literal, sin leer la
-- metadata del usuario: un signup con `data: { role: 'admin' }` o un login
-- de Google que traiga cualquier claim NO puede elevar el rol. Este comment
-- deja el motivo escrito en la base para quien audite el esquema.
comment on function public.handle_new_user() is
  'Crea el perfil con role=customer literal. Nunca lee raw_user_meta_data->>role: el registro público y OAuth no pueden crear administradores.';
