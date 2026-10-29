-- Carga peso y medidas embaladas desde la planilla de medidas de envío.
-- Solo toca productos cuyo código aparece con los 4 datos completos; el resto
-- conserva lo cargado a mano en Admin → Productos.
create or replace function public.sync_shipping_dimensions(p_rows jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.products p
     set shipping_weight_kg = r.weight_kg,
         shipping_height_cm = r.height_cm,
         shipping_width_cm = r.width_cm,
         shipping_length_cm = r.length_cm,
         shipping_enabled = true,
         updated_at = now()
    from jsonb_to_recordset(p_rows) as r(
      code text, weight_kg numeric, height_cm integer, width_cm integer, length_cm integer
    )
   where p.code = r.code
     and r.weight_kg > 0 and r.height_cm > 0 and r.width_cm > 0 and r.length_cm > 0
     and (p.shipping_weight_kg is distinct from r.weight_kg
       or p.shipping_height_cm is distinct from r.height_cm
       or p.shipping_width_cm is distinct from r.width_cm
       or p.shipping_length_cm is distinct from r.length_cm
       or not p.shipping_enabled);
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.sync_shipping_dimensions(jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_shipping_dimensions(jsonb)
  to service_role;
