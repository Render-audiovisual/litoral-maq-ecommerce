-- Etapa 9 — Campos de envío Andreani en orders.
-- Reutiliza delivery_method (método de entrega) y shipping (tarifa cotizada,
-- ver checkout/page.tsx) que ya existen — solo se agregan los campos que
-- aporta Andreani y que hoy no tienen dónde guardarse.
--
-- Estas columnas se escriben EXCLUSIVAMENTE desde las Edge Functions de
-- supabase/functions/andreani-*, autenticadas con SUPABASE_SERVICE_ROLE_KEY.
-- Verificado: is_employee()/is_admin() (0004/0005) evalúan false para esa
-- sesión (no existe fila en profiles con id = auth.uid() de service_role),
-- así que el trigger restrict_employee_order_update (0005) no revierte estas
-- columnas — su whitelist solo aplica a sesiones de employee reales.
--
-- RLS: no se agrega ninguna policy nueva a propósito. orders NO tiene (y
-- nunca tuvo, ver 0003_rls_policies.sql) una policy de SELECT pública —
-- orders_select_own_or_admin exige auth.uid() = customer_id o is_admin();
-- 0005 suma is_employee(). Un anónimo no puede leer ninguna columna de
-- ninguna fila de orders, así que andreani_label_url/tracking_url tampoco
-- quedan expuestos "al público" por este cambio.
--
-- andreani_contract sí necesitaba tratamiento aparte: un customer autenticado
-- puede leer SU pedido, y RLS filtra filas y no columnas, así que se le
-- habría ido el contrato. Se resuelve con REVOKE por columna más abajo.
alter table public.orders
  add column if not exists andreani_contract text,
  add column if not exists andreani_shipment_number text,
  -- Estado que informa Andreani (texto libre externo — TO VERIFY el set de
  -- valores real, por eso sin check constraint acá).
  add column if not exists andreani_status text,
  add column if not exists andreani_tracking_url text,
  -- Referencia TEMPORAL a la etiqueta, no una URL permanente: no está
  -- confirmado con Andreani si vencen ni en cuánto (ver README). Se guarda
  -- para trazabilidad; el panel resuelve la etiqueta on-demand contra la API
  -- en vez de servir esta columna. Contiene datos personales -> revocada
  -- para anon/authenticated más abajo, igual que el contrato.
  add column if not exists andreani_label_url text,
  -- Estado interno del claim de creación (nuestro, no de Andreani) — este sí
  -- tiene un set de valores cerrado y conocido, de ahí el check constraint:
  --   null              -> sin intento en curso.
  --   'claimed'         -> reservado, todavía no se llamó a Andreani (o la
  --                        llamada falló antes de obtener un número). Se
  --                        puede reclamar si queda viejo (ver claimed_at).
  --   'created_unsaved' -> Andreani PUDO haber generado el envío pero no
  --                        tenemos su número confirmado. Cubre dos casos:
  --                        (a) Andreani respondió OK pero falló el guardado;
  --                        (b) Andreani devolvió 5xx o hubo timeout, y no
  --                            sabemos si creó el envío igual.
  --                        NUNCA se reclama automáticamente aunque pase el
  --                        TTL — reclamarlo llamaría a Andreani de nuevo y
  --                        podría duplicar un envío (y un cargo) real.
  --                        Requiere revisión manual hasta confirmar con
  --                        Andreani que su API permite buscar por referencia
  --                        externa / idOrdenOrigen o acepta idempotency key
  --                        (ver andreani-shipment/index.ts y el pedido de
  --                        documentación pendiente).
  add column if not exists andreani_claim_state text
    check (andreani_claim_state in ('claimed', 'created_unsaved')),
  add column if not exists andreani_claimed_at timestamptz;

-- Contrato y código de cliente son datos INTERNOS de la cuenta comercial de
-- Andreani. No son una contraseña, pero no tienen por qué llegar al browser:
-- RLS filtra FILAS, no columnas, así que un customer leyendo su propio
-- pedido con select("*") se llevaría el contrato. Se revoca por columna.
--
-- Los GRANT de tabla de 0006 (select on public.orders to anon/authenticated)
-- siguen valiendo para el resto de las columnas; esto solo recorta una.
-- service_role no se ve afectado (bypassea grants), que es justamente quien
-- necesita leerla desde las Edge Functions.
--
-- Contrapartida deliberada: a partir de acá `select("*")` sobre orders
-- FALLA para anon/authenticated con "permission denied". El adapter ya lista
-- las columnas explícitamente (ORDER_COLUMNS en supabase-adapter.ts) — si
-- alguna vez vuelve un select("*") sobre orders, se rompe de forma visible
-- en vez de filtrar la columna en silencio.
revoke select (andreani_contract) on public.orders from anon;
revoke select (andreani_contract) on public.orders from authenticated;
revoke update (andreani_contract) on public.orders from authenticated;

-- La etiqueta se revoca por un motivo distinto pero igual de concreto:
-- contiene DATOS PERSONALES del destinatario (nombre, domicilio), y su URL
-- es una referencia temporal de vencimiento no confirmado. Sin este revoke,
-- un customer leyendo su propio pedido se llevaría la URL de su etiqueta y
-- podría quedar guardada o compartida indefinidamente. El panel admin la
-- obtiene on-demand vía la Edge Function (GET ?type=label), que la resuelve
-- contra Andreani en el momento.
revoke select (andreani_label_url) on public.orders from anon;
revoke select (andreani_label_url) on public.orders from authenticated;
revoke update (andreani_label_url) on public.orders from authenticated;

-- Resguardo a nivel DB: dos números de envío guardados no pueden repetirse.
-- La idempotencia real (no llamar dos veces a la API de Andreani) la hace el
-- claim atómico + máquina de estados en andreani-shipment/index.ts; esto es
-- el backstop de integridad.
create unique index if not exists orders_andreani_shipment_number_key
  on public.orders (andreani_shipment_number)
  where andreani_shipment_number is not null;

-- No aplicada a ningún proyecto Supabase remoto todavía (ver diagnóstico) —
-- entregada como archivo versionado para revisión, igual que 0001-0006.

-- ---------------------------------------------------------------------
-- ROLLBACK (ejecutar a mano si hace falta revertir; no hay tooling de
-- "down migrations" en este proyecto — mismo criterio que 0001-0006):
--
-- -- Los REVOKE por columna desaparecen solos al dropear la columna, pero
-- -- si se revierte SIN dropearla, hay que devolver los permisos de 0006:
-- grant select (andreani_contract) on public.orders to anon;
-- grant select (andreani_contract) on public.orders to authenticated;
-- grant update (andreani_contract) on public.orders to authenticated;
-- grant select (andreani_label_url) on public.orders to anon;
-- grant select (andreani_label_url) on public.orders to authenticated;
-- grant update (andreani_label_url) on public.orders to authenticated;
--
-- drop index if exists public.orders_andreani_shipment_number_key;
-- alter table public.orders
--   drop column if exists andreani_contract,
--   drop column if exists andreani_shipment_number,
--   drop column if exists andreani_status,
--   drop column if exists andreani_tracking_url,
--   drop column if exists andreani_label_url,
--   drop column if exists andreani_claim_state,
--   drop column if exists andreani_claimed_at;
-- ---------------------------------------------------------------------
