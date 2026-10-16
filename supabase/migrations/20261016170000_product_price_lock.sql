-- El panel puede fijar el precio de un producto. Mientras `price_locked` sea
-- true, el sync desde el Sheet no pisa precio ni raw_price; sí sigue
-- actualizando nombre, stock y presencia en el catálogo.
alter table public.products
  add column if not exists price_locked boolean not null default false;

create or replace function public.sync_catalog_from_sheet(
  p_admin_id uuid,
  p_products jsonb,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_retired integer := 0;
  v_total integer := 0;
  v_finished_at timestamptz;
  v_admin_email text;
begin
  perform pg_advisory_xact_lock(hashtext('litoral_catalog_sheet_sync'));

  select email into v_admin_email
  from public.profiles
  where id = p_admin_id and role = 'admin';
  if v_admin_email is null then
    raise exception 'La sincronización requiere un administrador válido.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) < 100 then
    raise exception 'El catálogo recibido está vacío o incompleto.' using errcode = '22023';
  end if;

  create temporary table catalog_sheet_rows (
    code text primary key,
    name text not null,
    price numeric not null check (price >= 0),
    raw_price text not null,
    source_row integer not null check (source_row >= 2),
    slug text not null,
    stock integer check (stock is null or stock >= 0)
  ) on commit drop;

  insert into catalog_sheet_rows (code, name, price, raw_price, source_row, slug, stock)
  select
    btrim(item ->> 'code'),
    btrim(item ->> 'name'),
    (item ->> 'price')::numeric,
    item ->> 'raw_price',
    (item ->> 'source_row')::integer,
    btrim(item ->> 'slug'),
    (item ->> 'stock')::integer
  from jsonb_array_elements(p_products) as item;

  if exists (
    select 1 from catalog_sheet_rows
    where code = '' or name = '' or slug = '' or raw_price is null
  ) then
    raise exception 'El catálogo contiene campos obligatorios vacíos.' using errcode = '22023';
  end if;
  select count(*) into v_total from catalog_sheet_rows;
  if v_total <> jsonb_array_length(p_products) then
    raise exception 'El catálogo contiene códigos duplicados.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from catalog_sheet_rows incoming
    join public.products current on current.id = incoming.code
    where current.code <> incoming.code
  ) then
    raise exception 'Un código del Sheet entra en conflicto con un identificador existente.' using errcode = '23505';
  end if;

  select count(*) into v_created
  from catalog_sheet_rows incoming
  left join public.products current on current.code = incoming.code
  where current.id is null;

  select count(*) into v_updated
  from catalog_sheet_rows incoming
  join public.products current on current.code = incoming.code
  where current.name is distinct from incoming.name
     or (not current.price_locked and (current.price is distinct from incoming.price
         or current.raw_price is distinct from incoming.raw_price))
     or (incoming.stock is not null and current.stock is distinct from incoming.stock)
     or current.source is distinct from 'google-sheet'
     or current.incomplete @> array['sheet-absent']::text[];

  select count(*) into v_unchanged
  from catalog_sheet_rows incoming
  join public.products current on current.code = incoming.code
  where not (
    current.name is distinct from incoming.name
    or (not current.price_locked and (current.price is distinct from incoming.price
        or current.raw_price is distinct from incoming.raw_price))
    or (incoming.stock is not null and current.stock is distinct from incoming.stock)
    or current.source is distinct from 'google-sheet'
    or current.incomplete @> array['sheet-absent']::text[]
  );

  update public.products current
  set
    name = incoming.name,
    price = case when current.price_locked then current.price else incoming.price end,
    raw_price = case when current.price_locked then current.raw_price else incoming.raw_price end,
    source = 'google-sheet',
    source_row = incoming.source_row,
    stock = coalesce(incoming.stock, current.stock),
    incomplete = case
      when incoming.stock is not null
        then array_remove(array_remove(array_remove(array_remove(current.incomplete, 'code'), 'price'), 'sheet-absent'), 'stock')
      else array_remove(array_remove(array_remove(current.incomplete, 'code'), 'price'), 'sheet-absent')
    end,
    updated_at = now()
  from catalog_sheet_rows incoming
  where current.code = incoming.code;

  insert into public.products (
    id, slug, code, name, price, raw_price, category, brand, image, images,
    stock, low_stock_threshold, purchase_limit, active, featured, description,
    variants, source, source_row, incomplete, shipping_enabled
  )
  select
    incoming.code,
    incoming.slug,
    incoming.code,
    incoming.name,
    incoming.price,
    incoming.raw_price,
    'Otros',
    'Sin marca informada',
    null,
    '{}',
    coalesce(incoming.stock, 0),
    5,
    3,
    false,
    false,
    null,
    '{}',
    'google-sheet',
    incoming.source_row,
    case when incoming.stock is null then array['image', 'stock', 'description'] else array['image', 'description'] end,
    false
  from catalog_sheet_rows incoming
  left join public.products current on current.code = incoming.code
  where current.id is null;

  with retired as (
    update public.products current
    set
      active = false,
      featured = false,
      incomplete = case
        when current.incomplete @> array['sheet-absent']::text[] then current.incomplete
        else array_append(current.incomplete, 'sheet-absent')
      end,
      updated_at = now()
    where current.source = 'google-sheet'
      and not exists (select 1 from catalog_sheet_rows incoming where incoming.code = current.code)
      and (current.active or current.featured or not current.incomplete @> array['sheet-absent']::text[])
    returning 1
  )
  select count(*) into v_retired from retired;

  v_finished_at := now();
  insert into public.catalog_sync_runs (
    admin_id, status, source, total, created, updated, unchanged, retired, finished_at
  ) values (
    p_admin_id, 'succeeded', p_source, v_total, v_created, v_updated, v_unchanged, v_retired, v_finished_at
  );

  insert into public.audit_log (admin_id, admin_email, action, detail)
  values (
    p_admin_id,
    v_admin_email,
    'catalog.sheet_sync',
    format('%s productos: %s nuevos, %s actualizados, %s sin cambios, %s retirados.',
      v_total, v_created, v_updated, v_unchanged, v_retired)
  );

  return jsonb_build_object(
    'total', v_total,
    'created', v_created,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'removed', v_retired,
    'source', p_source,
    'lastSyncedAt', v_finished_at
  );
end;
$$;
