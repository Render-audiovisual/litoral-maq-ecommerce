-- Casos borde del ocultamiento por stock bajo (auditoría):
-- 1. Si alguien oculta a mano un producto (cambia `active` sin tocar el
--    stock), deja de ser "oculto por el automatismo": no se reactiva solo.
-- 2. Si el stock pasa a "sin confirmar", un producto auto-oculto se libera
--    (auto_hidden = false) en vez de quedar oculto con una etiqueta engañosa.

create or replace function public.apply_low_stock_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  LOW_STOCK_HIDE_AT constant integer := 3;
begin
  -- Ocultar a mano sin cambiar el stock = decisión de una persona.
  if tg_op = 'UPDATE'
     and new.active is distinct from old.active
     and new.stock is not distinct from old.stock
     and not new.active then
    new.auto_hidden := false;
  end if;

  -- Sin stock confirmado no hay dato para decidir: se libera lo auto-oculto
  -- y no se toca nada más.
  if 'stock' = any(coalesce(new.incomplete, '{}')) then
    new.auto_hidden := false;
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
