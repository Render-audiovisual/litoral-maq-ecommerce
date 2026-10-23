-- Un producto con stock confirmado de 3 unidades o menos se oculta de la web
-- solo; cuando el stock vuelve a superar 3 (p. ej. por el Sheet) se muestra
-- de nuevo, pero únicamente si lo ocultó este automatismo (`auto_hidden`).
-- Vive en un trigger para cubrir todos los caminos: sync del Sheet, panel y SQL.
-- El umbral (3) está en LOW_STOCK_HIDE_AT abajo y en src/lib/product-availability.ts.

alter table public.products
  add column if not exists auto_hidden boolean not null default false;

create or replace function public.apply_low_stock_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  LOW_STOCK_HIDE_AT constant integer := 3;
begin
  -- Sin stock confirmado no hay dato para decidir: no se toca nada.
  if 'stock' = any(coalesce(new.incomplete, '{}')) then
    return new;
  end if;

  if new.stock <= LOW_STOCK_HIDE_AT then
    if new.active then
      new.active := false;
      new.auto_hidden := true;
    end if;
  elsif new.auto_hidden then
    new.auto_hidden := false;
    new.active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists products_low_stock_visibility on public.products;
create trigger products_low_stock_visibility
  before insert or update of stock, active, incomplete on public.products
  for each row execute function public.apply_low_stock_visibility();

-- Aplica la regla a lo que ya está publicado.
update public.products
set stock = stock
where active
  and stock <= 3
  and not ('stock' = any(incomplete));
