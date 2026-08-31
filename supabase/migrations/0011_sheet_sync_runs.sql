-- Registro de sincronizaciones con el Google Sheet.
--
-- El Sheet es la fuente del stock: cuando el catálogo web y el Sheet quedan
-- desalineados hay que poder responder "¿cuándo fue la última corrida buena
-- y qué pasó en la que falló?" sin abrir los logs de la Edge Function. Cada
-- corrida deja fila, la que falla también — es justamente la que interesa.

create table if not exists public.sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'error')),
  source text,
  created integer not null default 0,
  updated integer not null default 0,
  removed integer not null default 0,
  skipped integer not null default 0,
  errors integer not null default 0,
  -- Detalle técnico para diagnóstico: mensaje de Google, filas rechazadas,
  -- advertencias del parser. jsonb y no texto para poder consultarlo.
  detail jsonb not null default '{}',
  triggered_by uuid references public.profiles (id)
);

create index if not exists sheet_sync_runs_started_at_idx
  on public.sheet_sync_runs (started_at desc);

alter table public.sheet_sync_runs enable row level security;

-- Solo lectura, solo admin. La escritura pasa exclusivamente por la Edge
-- Function con service_role, que salteo RLS: ningún cliente puede inventar
-- una sincronización exitosa que nunca ocurrió.
create policy sheet_sync_runs_select_admin_only on public.sheet_sync_runs
  for select using (public.is_admin());

grant select on public.sheet_sync_runs to authenticated;
revoke insert, update, delete on public.sheet_sync_runs from authenticated, anon;

-- Aplicación atómica del catálogo validado.
--
-- El upsert por tandas desde la Edge Function no es una transacción: si la
-- tanda 3 falla, las dos primeras ya quedaron escritas y el catálogo queda
-- a mitad de camino entre dos versiones del Sheet. Una sola sentencia sí es
-- atómica: entra todo o no entra nada.
--
-- Nunca borra. Los productos ausentes del Sheet llegan acá con active=false
-- e incomplete conteniendo 'sheet-absent', decidido por el parser.
create or replace function public.apply_sheet_catalog(payload jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with upserted as (
    insert into public.products (
      id, slug, code, name, price, raw_price, category, brand, image, images,
      stock, low_stock_threshold, purchase_limit, active, featured,
      description, variants, source, source_row, incomplete,
      shipping_weight_kg, shipping_height_cm, shipping_width_cm,
      shipping_length_cm, shipping_enabled, updated_at
    )
    select
      sheet.id, sheet.slug, sheet.code, sheet.name, sheet.price,
      sheet.raw_price, sheet.category, sheet.brand, sheet.image,
      coalesce(sheet.images, '{}'), sheet.stock, sheet.low_stock_threshold,
      coalesce(sheet.purchase_limit, 3), sheet.active, sheet.featured,
      sheet.description, coalesce(sheet.variants, '{}'), sheet.source,
      sheet.source_row, coalesce(sheet.incomplete, '{}'),
      sheet.shipping_weight_kg, sheet.shipping_height_cm,
      sheet.shipping_width_cm, sheet.shipping_length_cm,
      coalesce(sheet.shipping_enabled, false), now()
    from jsonb_to_recordset(payload) as sheet (
      id text, slug text, code text, name text, price numeric,
      raw_price text, category text, brand text, image text, images text[],
      stock integer, low_stock_threshold integer, purchase_limit integer,
      active boolean, featured boolean, description text, variants text[],
      source text, source_row integer, incomplete text[],
      shipping_weight_kg numeric, shipping_height_cm numeric,
      shipping_width_cm numeric, shipping_length_cm numeric,
      shipping_enabled boolean
    )
    on conflict (id) do update set
      slug = excluded.slug,
      code = excluded.code,
      name = excluded.name,
      price = excluded.price,
      raw_price = excluded.raw_price,
      category = excluded.category,
      brand = excluded.brand,
      image = excluded.image,
      images = excluded.images,
      stock = excluded.stock,
      low_stock_threshold = excluded.low_stock_threshold,
      purchase_limit = excluded.purchase_limit,
      active = excluded.active,
      featured = excluded.featured,
      description = excluded.description,
      variants = excluded.variants,
      source = excluded.source,
      source_row = excluded.source_row,
      incomplete = excluded.incomplete,
      shipping_weight_kg = excluded.shipping_weight_kg,
      shipping_height_cm = excluded.shipping_height_cm,
      shipping_width_cm = excluded.shipping_width_cm,
      shipping_length_cm = excluded.shipping_length_cm,
      shipping_enabled = excluded.shipping_enabled,
      updated_at = now()
    returning 1
  )
  select count(*)::integer from upserted;
$$;

revoke all on function public.apply_sheet_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.apply_sheet_catalog(jsonb) to service_role;
