# Auditoría RLS previa al chatbot (2026-10-23)

Proyecto Supabase `bhtaecnzpuotlsenbdlz`. Script: `scripts/audit-anon-rls.mjs` (solo lectura, clave pública, sin sesión).

## Resultado como visitante anónimo

| Tabla | Resultado |
| --- | --- |
| `profiles`, `orders`, `audit_log` | HTTP 200, 0 filas (RLS filtra) |
| `products` | HTTP 200, solo filas `active = true` (catálogo público) |
| `carts`, `payments`, `payment_events`, `shipping_*`, `order_notification_outbox`, `catalog_sync_runs`, `system_*`, `customer_checkout_details`, `welcome_discount_claims` | HTTP 401 `permission denied` (sin GRANT) |
| RPC `admin_set_role`, `admin_set_user_active` | HTTP 401 `permission denied` |

Conclusión: **sin fugas**. Las dos capas funcionan (GRANT y RLS). Las 14 advertencias "anon policies" del advisor son falsos positivos: todas las políticas filtran por `auth.uid()` o `is_admin()`.

## Hallazgos menores (no bloquean el chatbot)

1. **`TRUNCATE` concedido a `anon`** en 10 tablas (default de Supabase). PostgREST no expone TRUNCATE, así que no es explotable por la API, pero conviene revocar. Propuesta en `supabase/migrations/` (pendiente de aprobar).
2. ~~`orders_insert_not_employee`~~: **falsa alarma**. La política es `RESTRICTIVE` (verificado en `pg_policies` y en `20260925120000_admin_hardening.sql:55`), así que se suma a `orders_insert_own_or_admin` con AND. Sin cambios.
3. **`products` expone a anon** columnas internas: `source`, `source_row`, `raw_price`, `price_locked`, `auto_hidden`, `incomplete`. No hay costos ni proveedor. El chatbot debe devolver solo los campos necesarios, no `select *`.
4. Políticas con rol `{public}` en vez de `{authenticated}` (`orders`, `profiles`, `carts`, etc.). Sin efecto práctico hoy; ordenar si se toca esa área.

## Pendiente fuera de código

- Activar *Leaked password protection* en Supabase Auth (panel).

## Cliente con sesión (rol `customer`)

Probado dentro de una transacción con rollback (`set local role authenticated` + claims JWT de un cliente real, sin tocar datos):

| Consulta | Resultado |
| --- | --- |
| `profiles` | 1 visible, 0 ajenos |
| `orders` | 1 visible, 0 ajenos |
| `carts` ajenos, `shipping_quotes` ajenos | 0 |
| `payments` | 1 (el propio) |
| `audit_log` | 0 |
| `is_admin()` | false |

Sin fugas entre clientes.

## Corrección (Fase 2)

- `supabase/migrations/20261023120000_revoke_unused_table_privileges.sql`: revoca TRUNCATE, REFERENCES y TRIGGER a `anon` y `authenticated`, y también de los privilegios por defecto. Probada con rollback: queda `anon = SELECT`, `authenticated = SELECT, INSERT, UPDATE, DELETE`. **No aplicada en producción todavía.**
