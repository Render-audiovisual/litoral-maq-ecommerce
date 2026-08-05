-- Etapa 8 — Agregar rol Employee para empleados con acceso limitado.
-- Employee puede ver y cambiar estado de órdenes, pero no acceder a productos,
-- categorías, configuración, ni auditoría.

-- Expandir el check constraint de roles en profiles para incluir 'employee'.
alter table public.profiles
drop constraint if exists profiles_role_check,
add constraint profiles_role_check check (role in ('admin', 'customer', 'employee'));

-- Helper de autorización para employee (análogo a is_admin).
create or replace function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employee'
  );
$$;

-- Helper combinado para validar admin O employee (ambos pueden modificar órdenes).
create or replace function public.is_admin_or_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'employee')
  );
$$;
