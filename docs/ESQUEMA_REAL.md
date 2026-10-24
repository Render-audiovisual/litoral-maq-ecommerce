# Esquema real para el chatbot (relevado en Supabase `bhtaecnzpuotlsenbdlz`, solo lectura, 2026-10-23)

## 1. Columnas

### public.products (PK `id` text; RLS activa)
id text, slug text, code text, name text, price numeric (nullable), raw_price text (nullable), category text, brand text,
image text (nullable), images text[], stock int (def 0), low_stock_threshold int (def 0), active bool (def true),
featured bool, description text (nullable), variants text[] (def `{}`), source text (def 'manual'), source_row int,
incomplete text[], created_at, updated_at, shipping_weight_kg numeric, shipping_height_cm / width_cm / length_cm int,
shipping_enabled bool (def false), purchase_limit int (def 3, CHECK 1..99), best_seller bool (nullable), price_locked bool, auto_hidden bool.

### public.orders (PK `id` text; 47 filas)
id, customer_id uuid, customer_name, email, **lines jsonb** (items; no hay tabla order_items), total, shipping, delivery_method ('envio'|'retiro'),
address y desglose (phone, postal_code, province, locality, street, street_number, floor, apartment, address_reference),
status, payment_status, payment_reference, payment_installments, payment_installment_amount, payment_method_id, payment_type_id, dni,
shipping_* (quote_id, provider, carrier, service, delivery_type 'domicilio'|'sucursal', branch_*, status, tracking_number, label_ready),
follow_up_at, expires_at (def now()+24h), status_changed_at, welcome_discount_amount, created_at.
Cada elemento de `lines`: `{productId, productCode, productName, quantity, unitPrice}`.

## 2. Valores reales
- `orders.status` permitidos (CHECK): pendiente, pago_simulado, preparando, listo, enviado, entregado, cancelado.
  En uso hoy: cancelado 39, entregado 5, pendiente 1, enviado 1, listo 1.
- `orders.payment_status` permitidos: pending, approved, rejected, cancelled, refunded, charged_back.
  En uso: cancelled 37, approved 6, pending 3, rejected 1.
- `shipping_status` permitidos: manual_quote, quoted, creating, processing, ready, in_transit, delivered, cancelled, error.

## 3. Cómo se guarda cada dato
- **stock**: entero. Si `'stock'` está en `incomplete[]`, el stock NO está confirmado (el Sheet no informa unidades) y el valor numérico no sirve.
- **low_stock_threshold**: 5 en los 633 productos. Solo afecta la etiqueta "Últimas N unidades".
- **purchase_limit**: 3 en los 633 productos (CHECK 1..99).
- **auto_hidden**: true en 56 productos. Trigger `apply_low_stock_visibility`: stock confirmado <= 3 pone `active=false, auto_hidden=true`; si el stock supera 3 y estaba auto_hidden, se reactiva.
- **variants**: text[]; vacío en todos los productos activos (0 con variantes). No hay estructura de variantes por ahora.
- **description / ficha técnica**: texto plano en `description`; 179 de 265 activos tienen description NULL (ver nota abajo). Las que existen siguen un patrón: línea resumen, línea en blanco, `Datos técnicos:` y viñetas `• Clave: valor`, a veces `Contenido: ...` al final. Largo promedio ~406 caracteres.

Ejemplo 1 (sin datos personales):
```
id 3772 | code 3772 | NEO | cat "Accesorios y consumibles" | price 7000.01 | stock 67 | active | purchase_limit 3 | threshold 5 | variants []
SET DE PUNTAS DOBLES PROF - SPD1010
"Set de puntas dobles de 10 piezas de 50mm NEO SPD1010.\n\nDatos técnicos:\n• Cantidad de piezas: 10\n• Medida: 50mm - 2\"\n• Tipo: Doble cabeza\n• Material: S2\n• Segmento: Profesional ..."
```
Ejemplo 2:
```
id 3788 | ENERGY NEXT | cat Soldadura | price 265000.57 | stock 19 | active | purchase_limit 3
SOLDADORA 200 AMP 3EN1 NERGY NEXT -IMET200X/220
"Soldadora inverter MIG electrodo TIG ENERGY NEXT IMET200X/220.\n\nDatos técnicos:\n• Voltaje-frecuencia: 220V ~ 50-60Hz\n• Amperaje: 200A ..."
```
Nota (verificada 2026-10-23): de 265 activos, 179 no tienen `description` y 86 sí. El chatbot no puede asesorar con datos técnicos en el 68 % del catálogo activo; la Fase de atributos tiene que empezar por ahí. Conteos de categoría y marca de este documento son sobre las 633 filas, no solo activos.

## 4. Conteos
- Productos: **633 totales, 265 activos** (368 inactivos: 56 auto_hidden, resto sin publicar).
- Categorías distintas (11, sobre los 633): Otros 348, Accesorios y consumibles 65, Herramientas manuales 55, Soldadura 37, Taladros y atornilladores 32, Amoladoras 21, Construcción 21, Hidrolavado y bombas 17, Compresores y neumática 16, Jardín 14, Seguridad 7. (Conteo por categoría solo de activos: no relevado; consultar con `where active`.)
- Marcas (10 + sin marca): Sin marca informada 388, GLADIATOR 82, ENERGY 56, OBRA 35, NEO 33, NEO NEXT 14, FOREST & GARDEN 12, ENERGY NEXT 7, GLADIATOR PRO 4, BLACK & WHITE 1, KNOCK OUT 1.

## 5. Lógica en el código (citas)
- "Últimas N unidades": `src/lib/product-availability.ts:41` -> si disponibilidad es "available" y `stock <= lowStockThreshold` (5) muestra `Últimas ${stock} unidades`. Disponibilidad: `product-availability.ts:16-23` (stock no confirmado + origen google-sheet = "Disponible" sin cantidad; stock 0 = "Sin stock").
- Ocultamiento automático con stock <= 3: constante `src/lib/product-availability.ts:26`, `:28-30`; trigger SQL `supabase/migrations/20261023160000_low_stock_auto_hide.sql` y `20261024100000_low_stock_hide_edge_cases.sql:7-41`. Implicancia: un producto visible nunca tiene stock <= 3, así que "Últimas N" solo aparece con N = 4 o 5.
- Tope de compra: `src/lib/purchase-limits.ts:8` (default 3), `:10-15` (`getPurchaseLimit`, entero 1..99), `:24-43` (validación del carrito). UI: `src/app/productos/[slug]/product-detail-client.tsx:154,279,300` ("Máximo {n} unidades por producto en cada compra"). Servidor: `supabase/functions/payment-create/index.ts:126` y trigger `enforce_order_purchase_limits` en `supabase/migrations/0010_catalog_limits_order_notifications.sql:17-66`. Edición admin: `src/app/admin/productos/page.tsx:188-190`.
- Mapeo columnas: `src/services/persistence/supabase-adapter.ts:33-40,67-74,110-117`.

## 6. Campos que el chatbot NO debe exponer
- orders: customer_id, customer_name, email, phone, dni, address y todo el desglose (street, street_number, floor, apartment, postal_code, locality, province, address_reference), shipping_branch_*, shipping_tracking_number, shipping_quote_id, payment_reference, payment_method_id/type_id, cuotas, welcome_discount_amount. Cualquier consulta de pedidos exige identidad verificada (dueño del pedido) y devolver solo id, estado, items y total.
- profiles (email, phone, name, role), carts, customer_checkout_details, welcome_discount_claims.
- payments, payment_events (payload, preference_id, payment_id, checkout_url, last_error), order_notification_outbox, audit_log (admin_email, changes), catalog_sync_runs, system_heartbeat, system_alerts, shipping_* tablas.
- products: source, source_row, incomplete, price_locked, auto_hidden, raw_price, created_at/updated_at, y `stock` numérico exacto cuando `incomplete` contiene 'stock'. Usar solo productos `active = true`.

## Diferencias con las afirmaciones de la guía (GUIA_CHATBOT_ECOMMERCE.md no está en el repo)
- "265 productos": solo son los **activos**; la tabla tiene 633. Cuidado: el conteo cambia solo por el ocultamiento automático.
- "8 categorías": hay **11** en la tabla (con "Otros" = 348 de 633, o sea una categoría comodín enorme).
- "Máximo 3 unidades por compra": es el default y hoy vale 3 en todos, pero es por producto (`purchase_limit`, 1..99); el chatbot debe leer el valor del producto.
- "Ficha técnica de formato libre": es texto plano pero con patrón `Datos técnicos:` + viñetas `• Clave: valor`; muchos productos no tienen description. No hay campo estructurado ni variantes (variants vacío).
- Aviso de deploy: la función en la base viva es la versión anterior del trigger (sin casos borde); la migración `20261024100000_low_stock_hide_edge_cases.sql` del repo aún no estaba aplicada al momento del relevamiento.
