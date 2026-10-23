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
2. **`orders_insert_not_employee`**: `with_check = (NOT is_employee()) OR is_admin()` da `true` para anon. Hoy no pasa nada porque anon no tiene `INSERT` en `orders`. Si alguien concede INSERT a anon, esta política lo abre. Revisar si debe ser `RESTRICTIVE`.
3. **`products` expone a anon** columnas internas: `source`, `source_row`, `raw_price`, `price_locked`, `auto_hidden`, `incomplete`. No hay costos ni proveedor. El chatbot debe devolver solo los campos necesarios, no `select *`.
4. Políticas con rol `{public}` en vez de `{authenticated}` (`orders`, `profiles`, `carts`, etc.). Sin efecto práctico hoy; ordenar si se toca esa área.

## Pendiente fuera de código

- Activar *Leaked password protection* en Supabase Auth (panel).

## Falta probar

- Cliente con sesión: ve solo sus pedidos, carrito y perfil (`AUDIT_ACCESS_TOKEN` en el script). Requiere un usuario de prueba.
