-- =============================================================================
-- Datos de prueba de STAGING. Ficticios, mínimos e idempotentes.
--
-- NUNCA correr esto contra el proyecto de producción: crea un administrador
-- con contraseña conocida. Está pensado para el stack local
-- (`npx supabase start` / `npx supabase db reset`), donde las claves ya son
-- públicas y fijas por diseño.
--
-- Idempotencia: el bloque de limpieza de abajo borra únicamente lo que este
-- mismo archivo (o los E2E) crean — productos con código `E2E-%`, pedidos con
-- email `@e2e.litoralmaq.test` y los invitados anónimos que quedaron sin
-- pedidos. Nada más se toca, así que se puede reejecutar sobre una base que
-- ya tenga otros datos.
-- =============================================================================

-- 1. Limpieza acotada ---------------------------------------------------------

-- Pedidos de prueba (el outbox de notificaciones cae por ON DELETE CASCADE).
delete from public.orders
where email like '%@e2e.litoralmaq.test';

-- Productos de prueba. Se borran después de los pedidos por la FK implícita
-- que valida el trigger de límites de compra.
delete from public.products
where code like 'E2E-%';

-- Invitados anónimos huérfanos: cada corrida de los E2E crea uno nuevo con
-- signInAnonymously. Si ya no tiene pedidos asociados, no queda nada que
-- referenciar. `profiles` y `carts` caen por ON DELETE CASCADE.
delete from auth.users u
where coalesce(u.is_anonymous, false)
  and not exists (select 1 from public.orders o where o.customer_id = u.id);

-- 2. Administrador de staging -------------------------------------------------
-- Mismas credenciales que el admin del modo local (services/mock.ts), para que
-- las specs de Playwright no necesiten dos juegos de fixtures.

do $$
declare
  admin_id constant uuid := '00000000-0000-4000-8000-000000000001';
  admin_email constant text := 'admin@litoralmaq.com';
begin
  -- Las columnas de token van en cadena vacía, no en NULL: GoTrue las lee
  -- como `string` de Go y un NULL le hace devolver 500 "Database error
  -- querying schema" en cada intento de login.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_anonymous,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
    admin_email, extensions.crypt('admin123', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin Staging"}'::jsonb,
    false,
    '', '', '', '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password,
        email = excluded.email,
        email_confirmed_at = now(),
        updated_at = now(),
        confirmation_token = '', recovery_token = '', email_change = '',
        email_change_token_new = '', email_change_token_current = '',
        phone_change = '', phone_change_token = '', reauthentication_token = '';

  -- Sin la identidad `email`, GoTrue no resuelve signInWithPassword.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    admin_id::text, admin_id,
    jsonb_build_object(
      'sub', admin_id::text, 'email', admin_email,
      'email_verified', true, 'phone_verified', false
    ),
    'email', now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  -- El rol admin no lo asigna ningún trigger automático y
  -- `profiles_identity_guard` (migración 0009) revierte cualquier cambio de
  -- rol que no venga de una sesión ya-admin. Acá corremos como superusuario,
  -- que es el único camino previsto para crear el primer administrador.
  alter table public.profiles disable trigger profiles_identity_guard;

  insert into public.profiles (id, role, name, email, is_anonymous)
  values (admin_id, 'admin', 'Admin Staging', admin_email, false)
  on conflict (id) do update
    set role = 'admin',
        name = excluded.name,
        email = excluded.email,
        is_anonymous = false,
        updated_at = now();

  alter table public.profiles enable trigger profiles_identity_guard;
end $$;

-- 3. Catálogo ficticio mínimo -------------------------------------------------
-- Tres productos alcanzan para todo lo que cubren los E2E: uno se compra, otro
-- se edita y se borra, y el tercero valida que el panel ve los inactivos que el
-- catálogo público no muestra.

insert into public.products (
  id, slug, code, name, price, category, brand,
  stock, low_stock_threshold, purchase_limit, active, featured,
  description, source, incomplete
)
values
  ('e2e-prod-0001', 'e2e-motosierra-de-prueba', 'E2E-0001',
   'Motosierra de prueba E2E', 150000, 'Herramientas E2E', 'Marca E2E',
   10, 2, 3, true, true,
   'Producto ficticio de staging. No existe y no se vende.', 'manual', '{}'),
  ('e2e-prod-0002', 'e2e-producto-editable', 'E2E-0002',
   'Producto editable E2E', 90000, 'Herramientas E2E', 'Marca E2E',
   5, 1, 3, true, false,
   'Producto ficticio de staging usado para editar y borrar.', 'manual', '{}'),
  ('e2e-prod-0003', 'e2e-producto-oculto', 'E2E-0003',
   'Producto oculto E2E', 42000, 'Herramientas E2E', 'Marca E2E',
   0, 1, 3, false, false,
   'Producto ficticio inactivo: visible solo desde el panel.', 'manual', '{}')
on conflict (id) do update
  set slug = excluded.slug,
      code = excluded.code,
      name = excluded.name,
      price = excluded.price,
      category = excluded.category,
      brand = excluded.brand,
      stock = excluded.stock,
      low_stock_threshold = excluded.low_stock_threshold,
      purchase_limit = excluded.purchase_limit,
      active = excluded.active,
      featured = excluded.featured,
      description = excluded.description,
      source = excluded.source,
      incomplete = excluded.incomplete,
      updated_at = now();
