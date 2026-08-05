-- Etapa 5 — creación automática de perfil al registrarse (real o anónimo),
-- y protección contra que un usuario se auto-asigne el rol admin.
-- No ejecutar contra un proyecto real todavía.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email, is_anonymous)
  values (
    new.id,
    'customer',
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper de autorización, reutilizado acá y en las policies de 0003.
-- security definer para poder leer profiles sin recursión de RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- El rol admin nunca lo asigna un trigger automático: se setea a mano en el
-- proyecto real (ver supabase/README.md, sección 8). Este trigger evita que
-- un usuario autenticado se auto-eleve editando su propia fila.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();
