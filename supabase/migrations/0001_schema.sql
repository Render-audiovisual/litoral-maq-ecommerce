-- Etapa 5 — esquema base.
-- No ejecutar contra un proyecto real todavía: entregado como diseño
-- versionado. Ver supabase/README.md para el detalle de cada tabla.

create extension if not exists "pgcrypto";

-- profiles: perfil de app 1:1 con auth.users. Reemplaza "accounts" +
-- "customers" del modelo demo. Nunca contiene contraseñas: eso lo maneja
-- Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer' check (role in ('admin', 'customer')),
  name text,
  email text,
  phone text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_key
  on public.profiles (email)
  where email is not null;

-- products
create table if not exists public.products (
  id text primary key,
  slug text not null,
  code text not null,
  name text not null,
  price numeric,
  raw_price text,
  category text not null,
  brand text not null,
  image text,
  images text[] not null default '{}',
  stock integer not null default 0,
  low_stock_threshold integer not null default 0,
  active boolean not null default true,
  featured boolean not null default false,
  description text,
  variants text[] not null default '{}',
  source text not null default 'manual',
  source_row integer,
  incomplete text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_code_key on public.products (code);
create unique index if not exists products_slug_key on public.products (slug);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_active_idx on public.products (active);

-- orders
create table if not exists public.orders (
  id text primary key,
  customer_id uuid not null references public.profiles (id),
  customer_name text not null,
  email text not null,
  lines jsonb not null default '[]',
  total numeric not null,
  shipping numeric not null default 0,
  delivery_method text not null check (delivery_method in ('envio', 'retiro')),
  address text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'pago_simulado', 'preparando', 'enviado', 'entregado', 'cancelado')),
  created_at timestamptz not null default now(),
  payment_reference text
);

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_email_idx on public.orders (email);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- carts: un blob de líneas por dueño (perfil autenticado o anónimo)
create table if not exists public.carts (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  lines jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- audit_log: append-only, sin UPDATE/DELETE permitidos para nadie (ver RLS)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  admin_id uuid references public.profiles (id),
  admin_email text not null,
  action text not null,
  detail text not null
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_admin_id_idx on public.audit_log (admin_id);
