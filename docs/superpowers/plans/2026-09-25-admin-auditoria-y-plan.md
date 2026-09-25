# Panel de administración Litoral Maq: auditoría y plan

**Fecha:** 25/09/2026 · **Alcance:** panel `/admin` (Resumen, Pedidos, Productos, Categorías, Clientes, Configuración, login), base Supabase de producción (`bhtaecnzpuotlsenbdlz`), Edge Functions, hosting estático en Hostinger.
**Cómo se hizo:** leí el código de la rama `feat/checkout-animacion-whatsapp` (PR #87) y de `origin/main`, y consulté la base de producción **solo con SELECT**: políticas RLS, triggers, permisos, cron, advisors y conteos agregados. No se cambió nada y en este informe no hay datos personales de clientes.

> **Para el desarrollador:** este plan se ejecuta con `superpowers:executing-plans` o `superpowers:subagent-driven-development`, etapa por etapa. Todas las migraciones son **aditivas**: nada de `DROP TABLE` ni `DROP COLUMN`.

---

## 1. Resumen ejecutivo

**Veredicto:** el panel está bien construido y es seguro para el uso que tiene hoy, con 2 o 3 administradores de confianza. La seguridad vive en la base (RLS, triggers y Edge Functions), no en la pantalla. Lo que falta está en otro lado: **todavía no está preparado para empleados**. El rol `employee` existe a medias, el registro de actividad lo escribe el navegador y se puede falsificar, y hoy no hay una forma soportada de asignar roles. Además hay un problema visible en la tienda: **el home muestra 2 de los 4 "elegidos"**, porque 3 de los productos fijados en el código están inactivos.

**Top 5 recomendaciones:**
1. **Una cuenta por persona, nunca compartida.** Dos roles: `admin` para Gonzalo y Franco, y `employee` para los empleados, que ven Pedidos, Resumen y Categorías pero no Clientes, Configuración, borrar productos, la sincronización ni el pago. Las restricciones van en la base, no solo en la pantalla (Etapa 1).
2. **Registro de actividad armado por triggers en la base**, con el autor real de cada cambio. Hoy lo arma el navegador, se pierde si algo falla y un empleado no podría escribirlo (Etapa 1).
3. **Sección "Equipo"** (solo admin): invitar por email, sin que nadie pase contraseñas, además de cambiar el rol y desactivar a alguien con un clic (Etapa 1).
4. **"Visibles en el home"** dentro de Categorías: el equipo elige 4 productos y, si alguno se oculta, un reemplazo automático los mantiene siempre en 4 (Etapa 2, esfuerzo S/M).
5. **Alertas por correo cuando algo falla**: sincronización del Sheet, correos que no salen, webhook de Mercado Pago. También hay que aplicar en producción las 3 migraciones pendientes antes de publicar el PR #87 (Etapa 4, prioridad alta).

---

## 2. Qué está bien y hay que conservar

- **RLS activado en las 12 tablas** de `public`, con políticas de mínimo privilegio. Un cliente solo ve sus pedidos, carrito y perfil, y el catálogo público muestra solo los productos activos.
- **El total del pedido lo recalcula el servidor**: `payment-create` vuelve a leer los precios de `products` (`supabase/functions/payment-create/index.ts:104-184`). Un cliente no puede pagar menos manipulando el carrito.
- **Un cliente no puede crear un pedido "ya pagado"**: la política `orders_insert_own_or_admin` exige `payment_status = 'pending'`, sin guía y sin etiqueta.
- **Webhook de Mercado Pago con firma verificada** y comparación en tiempo constante (`_shared/payments/mercadopago.ts:289-324`), con idempotencia en `payment_events (provider, event_key)`.
- **Cola de correos (outbox) idempotente**, con `event_key` único y reintentos. El cron cada 5 min lee su secreto desde **Vault**, no está escrito en el SQL. Los 29 correos de producción figuran como `sent` en el primer intento. Ya existe el **aviso al equipo por pedido nuevo** (`team_new_order`).
- **Las Edge Functions sensibles validan el rol del lado del servidor** (`requireAdmin` en `_shared/http.ts:86-97`): sincronización del catálogo, crear guía y descargar etiqueta.
- **Protección del perfil**: el trigger `guard_profile_identity_columns` impide que alguien se asigne `admin` a sí mismo o cambie su email "a mano".
- **Hosting**: el panel se publica aparte de la tienda, con CSP, HSTS, `X-Frame-Options: DENY` y `nosniff` (`scripts/prepare-admin-dist.mjs`). Además, `validate-separation.mjs` impide publicar las credenciales demo (`admin123`).
- **Login con Turnstile** y mensajes de error genéricos, que no revelan si el email existe.
- **La sincronización del catálogo tiene frenos de seguridad**: rechaza encabezados o filas inválidas y deja registro en `catalog_sync_runs`. Las 5 corridas fallidas se frenaron solas, sin romper el catálogo.
- **El código no usa `dangerouslySetInnerHTML`**: React escapa todo el texto, así que el riesgo de XSS en la interfaz es bajo.
- **Diseño del panel**: filtros, "Demorados", paginación de a 50 y el contador de pendientes que se actualiza cada 15 s. Todo esto funciona y conviene no tocarlo.

---

## 3. Hallazgos de la auditoría

Severidad: **Alta** = hay que arreglarlo antes de sumar empleados o ya afecta a la tienda · **Media** = conviene hacerlo en las próximas semanas · **Baja** = higiene o mejora.

### H1 · Alta · El home muestra 2 "elegidos" en lugar de 4
- **Evidencia:** en `origin/main`, `src/app/home-client.tsx:68-76`, la lista `STAR_PRODUCTS` tiene fijados los IDs 3381, 3506, 3499, 3542 y 3216 (en la rama del PR: 3381, 3499, 3542, 3216 y la reserva 3588). En producción **solo 3381 y 3499 están activos**; 3506, 3542, 3216 y 3588 tienen `active = false`. El filtro (`home-client.tsx:240-243`) descarta los inactivos y no busca reemplazo, así que la grilla queda en 2 tarjetas.
- **Recomendación:** Etapa 2, con selección manual y reemplazo automático. Como parche inmediato, si no se quiere esperar, alcanza con cambiar los IDs por 4 productos activos.

### H2 · Alta · No hay una forma soportada de asignar roles (ni por SQL)
- **Evidencia:** `guard_profile_identity_columns` (producción) revierte cualquier cambio de `role` cuando `not public.is_admin()`. En el SQL Editor o con la service role, `auth.uid()` es NULL, así que el cambio **se descarta sin error**. El script `promote-admin.mjs`, en la raíz del repo, intenta resolverlo desactivando un trigger con `rpc('exec')`, una función que no existe, y además apunta a un trigger que ya no se llama así. Hoy la única vía es que un admin logueado mande un `PATCH` a `/rest/v1/profiles`, y no hay pantalla para eso.
- **Recomendación:** Etapa 1, tarea 1.1: permitir el cambio de rol a `service_role`/`postgres` y a un admin, e impedir que se quite el último admin.

### H3 · Alta (antes de dar acceso a empleados) · El rol `employee` está a medio hacer
- **Evidencia en la interfaz:** `type Role = "admin" | "customer"` (`src/lib/types.ts:1`, `database.types.ts:28`). `signInAdmin` rechaza todo lo que no sea admin (`supabase-auth-adapter.ts:268`) y `isValidAdminSession` exige `role === "admin"` (`src/lib/auth.ts:54`). Además, `store.tsx:252-253` descarta cualquier sesión que no sea customer ni admin. Por otro lado, `signInCustomer` (`:160`) deja entrar a un employee a la tienda como si fuera cliente, y queda en un estado inconsistente.
- **Evidencia en la base: qué podría hacer HOY un empleado contra la API REST**, aunque la pantalla lo esconda:

| Tabla o función | Empleado hoy | ¿Es lo que queremos? |
|---|---|---|
| `orders` SELECT | **Todos los pedidos con todas las columnas**: email, teléfono, dirección y DNI (`orders_select_employee`) | Sí para operar. El DNI no se puede ocultar por columna con RLS (ver H3b) |
| `orders` UPDATE | Cambia `status`. El trigger revierte 31 columnas, **pero no `dni`, `follow_up_at`, `expires_at`, `payment_installments`, `payment_installment_amount`, `payment_method_id` ni `payment_type_id`** | No: puede modificar el DNI y los vencimientos |
| `orders` DELETE/INSERT ajeno | No puede | OK |
| `products` | Solo los activos, sin escritura | Le faltan los inactivos para poder "ver" el catálogo completo |
| `profiles` (Clientes) | Solo su propio perfil | OK: la sección Clientes le aparecería vacía |
| `audit_log` | No puede leer **ni insertar** | **Mal: lo que haga un empleado no quedaría registrado en ningún lado** |
| `payments`, `shipping_*` | Nada | OK, salvo la etiqueta si se decide que la descargue |
| Edge `shipping-create` / `shipping-label` / `admin-sync-products` | 403 (`requireAdmin`) | Hay que decidir la etiqueta (pregunta abierta) |
| Edge `order-notifications` (envío inmediato del correo) | 403: el correo sale con el cron, en ≤5 min | Aceptable. Mejor permitírselo al staff |

- **H3b (DNI):** RLS filtra filas, no columnas. Para que un empleado **realmente** no vea el DNI habría que mover el dato a otra tabla solo para admin, y no lo recomiendo: el DNI hace falta para despachar. Recomiendo que el empleado lo vea, que la pantalla lo muestre enmascarado (`***.456`) con un botón "ver", y registrar la consulta solo si Gonzalo lo pide. Hoy hay 0 pedidos con DNI cargado, porque el campo es nuevo.
- **Recomendación:** Etapa 1, tareas 1.1 a 1.3.

### H4 · Media-Alta · El "registro de actividad" lo escribe el navegador: se puede falsificar y es incompleto
- **Evidencia:** `store.tsx:475-667` primero aplica el cambio y después, "si puede", inserta en `audit_log` desde el cliente (`supabase-adapter.ts:355-370`). Si falla, solo queda un `console.warn`. La política `audit_log_insert_admin_only` controla `is_admin()`, **pero no que `admin_id` y `admin_email` sean los de quien inserta**: un admin puede registrar acciones a nombre de otro. Los cambios que hacen el webhook, el cron, el vencimiento automático o las Edge Functions (guías y etiquetas) no se registran. En producción hay 92 entradas: 44 `producto.guardar`, 40 `pedido.estado` y 8 `catalog.sheet_sync`. Nunca se registró un cambio de pago ni un borrado.
- **Recomendación:** triggers `AFTER UPDATE/DELETE` en `orders`, `products`, `profiles.role` y `store_settings` que escriban `audit_log` con `auth.uid()` y el email tomado de `profiles`, y un trigger `BEFORE INSERT` que pise `admin_id`/`admin_email` con los reales (Etapa 1, tarea 1.1). De ahí sale gratis el **historial de estados con autor** de cada pedido.

### H5 · Media · 3 cuentas admin: 2 sin identificar y ninguna con 2FA
- **Evidencia:** en `profiles` hay 3 `admin`. Una es la de Franco. **Ninguna de las otras dos es el email de la marca.** Una no entra desde el 19/08. Ninguna tiene factor MFA (`auth.mfa_factors` = 0).
- **Recomendación:** que Franco identifique las otras dos (¿son cuentas de prueba o de desarrollo?) y las baje a `customer` o las desactive cuando exista la cuenta de Gonzalo. Tener 2FA opcional para los admin (Etapa 4).

### H6 · Media · La sesión del panel no vence en la práctica
- **Evidencia:** `SESSION_TTL_MS = 4 h` (`src/lib/auth.ts:19`) solo se aplica en modo local. En modo Supabase, `expiresAt` es el vencimiento del access token (1 h, `supabase-auth-adapter.ts:62`) y `admin-shell.tsx:86-117` lo **renueva en silencio** con el refresh token, que no vence. Un panel abierto en la PC del local queda logueado indefinidamente. Lo bueno: bajar el rol corta el acceso al instante, porque RLS lee `profiles.role` en cada consulta.
- **Recomendación:** cerrar la sesión tras 8 h sin actividad en el panel (Etapa 1, tarea 1.5). Si el plan de Supabase lo permite, además activar "Inactivity timeout" en Auth → Sessions.

### H7 · Media · Contraseñas débiles permitidas
- **Evidencia:** el advisor avisa que la protección contra contraseñas filtradas está desactivada. El mínimo en el código es de 6 caracteres (`supabase-auth-adapter.ts:199` y `:300`).
- **Recomendación:** en Auth → Providers → Email, poner un mínimo de 10 caracteres con letras y números y activar "Leaked password protection" si el plan lo incluye. Esto no requiere código.

### H8 · Media · Las 3 migraciones del PR #87 no están en producción
- **Evidencia:** `supabase_migrations.schema_migrations` llega hasta `20260922143000`. Faltan `20260924150000_pending_order_notifications`, `20260924160000_order_status_changed_at` y `20260924161000_orders_server_timestamps`: la tabla `orders` de producción **no tiene `status_changed_at`**. "Demorados" y los avisos de pedidos vencidos dependen de esa columna. La sincronización automática cada 3 h (`_shared/catalog-auto-sync.ts`) tampoco está desplegada: todavía no hay ninguna corrida "(automática)".
- **Recomendación:** antes de hacer merge del PR #87, aplicar las migraciones con el pipeline (`supabase db push`) y verificar la columna. Recién después, publicar el frontend.

### H9 · Media · Sin alertas: los fallos pasan desapercibidos
- **Evidencia:** 5 de las 13 sincronizaciones del Sheet fallaron (encabezados cambiados y filas inválidas) y nadie recibió un aviso. En `cron.job_run_details` las 864 corridas de 3 días figuran como "succeeded", pero `net.http_post` es asíncrono, así que ese "succeeded" solo significa que el pedido salió, **no que la función anduvo**. El PR #61 (logs estructurados) está abierto desde el 18/09.
- **Recomendación:** mandar un correo al equipo (el mismo `LITORAL_ORDERS_EMAIL`) cuando (a) falla una sincronización automática, (b) un correo de la outbox llega a N intentos o queda `failed`, o (c) el webhook de Mercado Pago responde con error. Se reutiliza Resend y la outbox, sin herramientas nuevas (Etapa 4, prioridad 1). Hacer merge del PR #61 o cerrarlo.

### H10 · Media · Backups sin verificar
- **Evidencia:** desde aquí no pude ver el plan de Supabase. En el plan Free no hay backups descargables ni PITR.
- **Recomendación:** si el plan es Free, sumar un `pg_dump` semanal con una GitHub Action (el CI ya se conecta por el pooler IPv4, PR #85), guardado como artifact privado con 30 días de retención. Si es Pro, verificar que los backups diarios estén activos. **Probar una restauración una vez** en staging.

### H11 · Baja · Funciones SECURITY DEFINER expuestas por RPC y permisos de tabla de más
- **Evidencia:** según los advisors, 10 funciones `SECURITY DEFINER` son ejecutables por `anon`/`authenticated` vía `/rest/v1/rpc/...`. Casi todas son funciones de trigger, que fallan si se las llama fuera de un trigger. Por eso el riesgo práctico es bajo. Además, `anon` y `authenticated` tienen `TRUNCATE`, `TRIGGER` y `REFERENCES` sobre `orders`, `products`, `profiles`, `audit_log` y `carts`. `TRUNCATE` saltea RLS, aunque PostgREST no lo expone.
- **Recomendación:** en la migración de la Etapa 1, `revoke execute` de esas funciones para `anon`/`authenticated` (salvo `is_admin`, `is_employee` e `is_admin_or_employee`, que usan las políticas) y `revoke truncate, trigger, references` de ambos roles.

### H12 · Baja · Rendimiento: hoy anda bien, pero tiene un techo silencioso
- **Evidencia:** `listProducts()` hace `select *` sin paginar (`supabase-adapter.ts:198-205`). PostgREST corta en **1000 filas por defecto**: con 587 productos hoy no pasa nada, pero a partir de 1000 el catálogo se cortaría **sin error**. `listOrders()` trae todos los pedidos cada 15 s (`store.tsx:327-354`), cosa que con 9 pedidos no importa. Advisors: 8 políticas con `auth.uid()` sin `(select …)` (`auth_rls_initplan`), 2 claves foráneas sin índice y 5 índices sin uso. Con este volumen, todo es irrelevante.
- **Recomendación:** no paginar del lado del servidor todavía. Solo agregar un aviso en la consola y en Resumen si `products.length === 1000`, y reescribir las políticas con `(select auth.uid())` cuando se toquen en la Etapa 1.

### H13 · Baja · "Eliminar producto" es un borrado definitivo
- **Evidencia:** `productos/page.tsx:212-216` pide un `confirm()` y ejecuta un `DELETE`. No hay papelera. Si el producto sigue en el Sheet, la próxima sincronización lo vuelve a crear sin los datos cargados a mano.
- **Recomendación:** que el botón principal sea "Ocultar" (`active = false`) y dejar "Eliminar" solo para admin, detrás de "Más opciones". Así no hace falta papelera.

### H14 · Baja · La casilla "Destacado" de la ficha no hace lo que parece
- **Evidencia:** el checkbox `featured` (`productos/page.tsx:828`) solo agrega la etiqueta "Destacado", ordena el catálogo y la búsqueda y da prioridad en relacionados. **No define el home.** En producción hay 10 productos con `featured = true`. Además, la sincronización pone `featured = false` a los productos retirados.
- **Recomendación:** renombrarla a "Etiqueta Destacado en catálogo" y que el home lo manejen los "Visibles en el home" (Etapa 2).

### H15 · Baja · La búsqueda de pedidos no busca por teléfono ni por DNI
- **Evidencia:** `pedidos/page.tsx:132` solo busca en id, nombre, email y dirección.
- **Recomendación:** agregar el teléfono y el DNI comparando solo los dígitos (así "3794 12-3456" encuentra "3794123456"). Esfuerzo S.

### H16 · Baja · Higiene
- `order-notifications/index.ts:28-33` compara el secreto del cron con `===`. Conviene usar la misma comparación en tiempo constante que en Mercado Pago.
- `promote-admin.mjs` y `check-admin.mjs` están en la raíz del repo, con un email fijo y una RPC que no existe. Se reemplazan por la sección Equipo y se pueden borrar.
- En `schema_migrations` la 0007 figura dos veces (`0007` y `20260827043343_0007_shipping_enviopack`). Es inofensivo, pero hay que tenerlo en cuenta en `db push`.

---

## 4. Roles, permisos y cuentas

### 4.1 Decisión: una cuenta por persona, no una cuenta compartida

| Criterio | Cuenta compartida ("Empleados") | **Cuenta por persona** ✅ |
|---|---|---|
| Saber quién cambió un pedido | Imposible: todo figura como "empleados" | Cada cambio queda con nombre y hora |
| Cuando un empleado se va | Hay que cambiar la contraseña y avisar a todos | Se desactiva solo a esa persona, con un clic |
| Contraseña | Circula por WhatsApp y papelitos | La pone cada persona y nadie más la conoce |
| Costo | 0 | 0: Supabase no cobra por usuario a esta escala |

**Sobre la idea de "Gaby":** está bien que el negocio cree y administre **una casilla de correo por empleado** (por ejemplo, un Gmail a nombre del local para Gaby). Así, si la persona se va, el negocio no pierde el acceso al correo. Lo que no conviene es que **Gonzalo invente la contraseña del panel y se la pase**: con la invitación, Gaby recibe un enlace y elige su propia contraseña. Si Gonzalo necesita entrar "como Gaby", no le hace falta: con su cuenta admin ve todo.

### 4.2 Roles
- **`admin`**: Gonzalo y Franco. Ven y hacen todo, incluida la sección Equipo. No hace falta un rol "dueño" separado: con 2 admins de confianza alcanza, y la base impide quitar al último admin.
- **`employee`**: los 2 empleados. Se ocupan de la operación diaria de pedidos.

### 4.3 Matriz recomendada (✅ sí · 👁 solo ver · ❌ no · ❓ lo decide Gonzalo; la opción sugerida va primero)

| Sección · acción | Admin (Gonzalo, Franco) | Empleado | Dónde se hace cumplir |
|---|---|---|---|
| **Resumen** | ✅ | ✅ (❓ sin montos totales de venta) | Pantalla |
| **Pedidos**: ver lista y detalle (nombre, email, teléfono, dirección) | ✅ | ✅ | RLS `orders_select_employee` (ya existe) |
| Pedidos: ver DNI | ✅ | 👁 enmascarado con botón "ver" (❓) | Pantalla (ver H3b) |
| Pedidos: cambiar estado (preparando, listo, enviado, entregado, cancelado) | ✅ | ✅ | Trigger `restrict_employee_order_update` |
| Pedidos: cambiar el pago (aprobado, rechazado…) | ✅ | ❌ (❓ "pagado en el local") | Trigger (ya bloquea `payment_status`) |
| Pedidos: crear guía de envío (tiene costo) | ✅ | ❌ (❓) | Edge `shipping-create` → `requireAdmin` |
| Pedidos: descargar o imprimir la etiqueta | ✅ | ✅ (❓) | Edge `shipping-label` → `requireStaff` + RLS `shipping_shipments` |
| Pedidos: contactar por WhatsApp | ✅ | ✅ | Pantalla (es un enlace) |
| Pedidos: nota interna (Etapa 4) | ✅ | ✅ | Columna permitida en el trigger |
| **Productos**: ver (incluidos los ocultos) | ✅ | 👁 | RLS nueva `products_select_staff` |
| Productos: editar ficha, visibilidad, logística y límites | ✅ | ❌ (❓ solo visibilidad) | RLS `products_update_admin_only` (ya existe) |
| Productos: eliminar | ✅ | ❌ | RLS (ya existe) |
| Productos: sincronizar el Sheet | ✅ | ❌ | Edge `admin-sync-products` → `requireAdmin` (ya existe) |
| **Categorías**: ver | ✅ | ✅ | — |
| Categorías: elegir "Visibles en el home" | ✅ | ✅ (❓) | RLS `store_settings` por clave |
| Carrusel de relacionados (cantidad y modo) | ✅ | ❌ | RLS `store_settings` |
| **Clientes**: lista con emails y teléfonos | ✅ | ❌ | RLS `profiles` (ya lo impide) + menú oculto |
| Exportar a CSV (Etapa 4) | ✅ | ❌ | Pantalla. Los datos que exporta ya son de admin por RLS |
| **Configuración**: integraciones y estado | ✅ | ❌ | Pantalla. No muestra secretos |
| Actividad administrativa | ✅ | ❌ | RLS `audit_log_select_admin_only` (ya existe) |
| **Equipo**: invitar, cambiar rol, desactivar | ✅ | ❌ | Edge `admin-team` → `requireAdmin` |

Regla para las secciones futuras: **por defecto solo admin**. Se abre al empleado recién cuando Gonzalo lo pide, y siempre con su política en la base.

### 4.4 Procedimiento para crear las 4 cuentas sin pasar contraseñas

**Antes de empezar (una sola vez):**
1. Aplicar la migración de la Etapa 1 (tarea 1.1). Sin ella, el cambio de rol por SQL se descarta sin aviso (H2).
2. Supabase → Auth → **SMTP Settings**: verificar que use **Resend** con remitente del dominio. El mailer por defecto de Supabase tiene un límite muy bajo y cae en spam.
3. Supabase → Auth → **URL Configuration**: incluir la URL del panel y `/restablecer-clave` de la tienda en "Redirect URLs".
4. Auth → Providers → Email: mínimo de 10 caracteres. Activar "Leaked password protection" si el plan lo permite.

**Mientras no exista la sección Equipo (Etapa 1.4), con el Dashboard:**
1. **Franco** (`byfranromero@hotmail.com`): ya es admin, no hay que hacer nada.
2. **Gonzalo** (email de la marca a confirmar): Dashboard → Authentication → Users → **Invite user** → su email. Gonzalo recibe el correo, abre el enlace y **elige él mismo su contraseña**.
3. En el SQL Editor (con la migración 1.1 aplicada): `update public.profiles set role = 'admin' where email = '<email de Gonzalo>';` y verificar con `select role from public.profiles where email = '…';`.
4. **Empleados**: el mismo paso 2 con el email de cada uno. En el paso 3 va `role = 'employee'`. **Solo después** de que esté desplegada la parte de pantalla de la Etapa 1 (antes de eso, el login los rechaza).
5. Cada persona entra al panel y comprueba que ve lo que dice la matriz.
6. Revisar los otros 2 admins actuales (H5): si no corresponden a nadie, `update … set role = 'customer'` y **Ban user** en el Dashboard.

**Con la sección Equipo (después de la Etapa 1.4):** Gonzalo o Franco entran en Equipo → "Invitar" → email + rol, y listo. Para desactivar, se usa el botón **Desactivar**: bloquea el login y quita el rol **al instante**, porque RLS lee el rol en cada consulta.

**Nunca:** mandar contraseñas por WhatsApp o mail, guardarlas en el repo o en `.env`, ni usar la cuenta de otro.
**No hace falta "cambio obligatorio en el primer ingreso"**: con la invitación, cada uno ya elige su propia contraseña.

---

## 5. Plan de implementación

### Etapa 1: permisos, cuentas y registro de actividad · Esfuerzo total **M** (3-4 días)

**Objetivo:** que un empleado pueda entrar y operar pedidos, con límites que se cumplen en la base y dejando registrado quién hizo qué.

#### Tarea 1.1: migración `supabase/migrations/20260926120000_staff_roles_and_audit.sql` (S-M)
- [ ] `guard_profile_identity_columns`: permitir el cambio de `role` si `public.is_admin()` **o** `auth.role() = 'service_role'` **o** `current_user in ('postgres','supabase_admin')`. Rechazar (`raise exception`) el cambio que deje **0 admins**.
- [ ] `restrict_employee_order_update`: pasar a una **lista blanca**, para que cualquier columna nueva quede protegida sola:
  ```sql
  if public.is_employee() and not public.is_admin() then
    declare s text := new.status; n text := new.internal_note; -- internal_note: solo si ya existe (Etapa 4)
    begin new := old; new.status := s; end;
  end if;
  ```
  Así quedan cubiertas también las 7 columnas que hoy se escapan (H3).
- [ ] `create policy products_select_staff on products for select using (public.is_admin_or_employee());`
- [ ] Si Gonzalo confirma que los empleados descargan la etiqueta: `create policy shipping_shipments_select_staff … using (public.is_employee());`
- [ ] Auditoría en la base:
  - función `public.write_audit(action text, detail text)`, `security definer`, que toma `auth.uid()` y el email desde `profiles`. Si no hay usuario, el autor es `'sistema'`.
  - trigger `AFTER UPDATE` en `orders`: registra cuando cambia `status` (`pedido.estado`) o `payment_status` (`pedido.pago`).
  - trigger `AFTER UPDATE OR DELETE` en `products` (`producto.guardar` / `producto.eliminar`), con el detalle de los campos que cambiaron.
  - trigger `AFTER UPDATE` en `profiles` cuando cambia el rol (`equipo.rol`).
  - trigger `BEFORE INSERT` en `audit_log` que pisa `admin_id`/`admin_email` con los reales. Esto cierra la falsificación sin romper el insert que hoy hace el cliente.
  - `admin_id` ya acepta NULL en producción, así que el autor "sistema" entra sin tocar el esquema; `admin_email` (NOT NULL) queda como `'sistema'`.
- [ ] Higiene (H11): `revoke execute on function <10 funciones de trigger> from anon, authenticated;` y `revoke truncate, trigger, references on orders, products, profiles, audit_log, carts from anon, authenticated;`
- [ ] Reescribir con `(select auth.uid())` solo las políticas que se tocan en esta migración.
- **Riesgo:** los triggers de auditoría también se disparan con el webhook y el cron, pero eso es justo lo que se busca. Con los pocos pedidos actuales, el volumen es mínimo.

#### Tarea 1.2: interfaz y sesión (M)
- [ ] `src/lib/types.ts:1` y `database.types.ts`: `Role = "admin" | "customer" | "employee"`.
- [ ] Nuevo `src/lib/permissions.ts`: un único mapa `PERMISSIONS: Record<Permission, Role[]>` (por ejemplo `orders.payment`, `products.edit`, `customers.view`, `team.manage`) con `can(session, permission)`, espejo de la matriz 4.3.
- [ ] `src/lib/auth.ts`: `isValidStaffSession` (admin o employee) y `isValidAdminSession` sin cambios.
- [ ] `supabase-auth-adapter.ts:268`: `signInAdmin` acepta admin o employee. En `:160`, `signInCustomer` también rechaza a employee.
- [ ] `store.tsx:252-253`: restaurar la sesión de staff. Para employee, no llamar a `listCustomers`/`listAuditLog`.
- [ ] `admin-shell.tsx`: el menú se filtra con `can()`. Una ruta sin permiso redirige a `/admin/pedidos` con el aviso "No tenés acceso a esta sección".
- [ ] En las páginas: el select de pago aparece deshabilitado con un tooltip, y se ocultan "Eliminar", "Sincronizar", "Crear guía" y la sección Clientes. El DNI se muestra enmascarado con un botón "ver".
- [ ] `store.tsx`: dejar de insertar `audit_log` desde el cliente. Queda en la base (1.1) y en pantalla solo se refresca `listAuditLog()`.
- [ ] Modo local: agregar el usuario demo `empleado@litoralmaq.com` en `local-auth-adapter.ts` (`validate-separation.mjs` ya impide que llegue a producción; sumar `demo-employee` a sus marcadores).

#### Tarea 1.3: Edge Functions (S)
- [ ] `_shared/http.ts`: `requireStaff()` (admin o employee).
- [ ] `shipping-label`: `requireStaff` (si se confirma). `order-notifications/index.ts:101-103`: `requireStaff`.
- [ ] Comparación del secreto del cron en tiempo constante (H16).

#### Tarea 1.4: sección "Equipo" (M)
- [ ] Edge Function `supabase/functions/admin-team/index.ts` (`verify_jwt = true` en `config.toml`, con `requireAdmin`). Acciones:
  - `list`: perfiles `admin`/`employee` + `last_sign_in_at` + si está bloqueado.
  - `invite {email, role}`: `auth.admin.inviteUserByEmail(email, { redirectTo: <panel>/restablecer-clave })` y después `update profiles set role`.
  - `setRole {userId, role}`.
  - `deactivate {userId}`: `auth.admin.updateUserById(id, { ban_duration: '87600h' })` + `role = 'customer'`.
  - `reactivate`: `ban_duration: 'none'` + rol.
  - Validaciones: no desactivarse a uno mismo y no dejar 0 admins (la base también lo impide).
- [ ] Página `src/app/admin/equipo/page.tsx` (solo admin): una tabla con nombre, email, rol, último ingreso y estado, más el botón "Invitar". Reusar los estilos de `admin-list`.
- [ ] Revisar si la pantalla de "crear contraseña" desde la invitación funciona desde el subdominio del panel (rama `fix/admin-link-recuperar-clave`).

#### Tarea 1.5: vencimiento por inactividad (S)
- [ ] `admin-shell.tsx`: guardar `lastActivity` (clic o tecla, con throttle de 1 min) en `localStorage`. Si pasaron más de 8 h, `signOutAdmin()` y mostrar el login con "Tu sesión se cerró por inactividad".
- [ ] Actualizar `tests/e2e/admin-session-expiry.spec.ts`.

#### Tests y aceptación de la Etapa 1
- [ ] Vitest: `permissions.test.ts`, que recorre la matriz entera.
- [ ] SQL de verificación en staging (`chore/p2-supabase-staging`) simulando a cada rol con `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>"}';`:
  - un empleado cambia el `status`: OK, y el cambio aparece en `audit_log` con su email.
  - un empleado intenta cambiar `payment_status`, `dni` o `total`: los valores no cambian.
  - un empleado hace `select` de `profiles`: 1 fila (la suya). De `audit_log`: 0 filas.
  - un empleado ve los productos inactivos pero su `update` sobre `products` afecta 0 filas.
  - un admin cambia un rol: OK. Dejar 0 admins: error.
- [ ] E2E (modo local): el empleado entra, ve Resumen, Pedidos y Categorías, **no** ve Clientes, Configuración ni Equipo, y al ir a `/admin/clientes` por URL lo redirige.
- **Criterio de aceptación:** las 4 cuentas creadas por invitación, cada una con su rol, y cada acción del panel visible en "Actividad" con el autor real.
- **Riesgos:** que las invitaciones caigan en spam si el SMTP no está bien configurado (se prueba antes con un email propio) y que un empleado quede con una sesión de cliente en el mismo navegador (el SDK maneja una sola sesión, un límite ya conocido).

---

### Etapa 2: productos destacados del home elegidos a mano · Esfuerzo **S/M** (1-2 días)

**Decisión de modelo:** una tabla chica de ajustes de la tienda, `store_settings`, que también sirve para la Etapa 3. **Ni columna en `products`** (la sincronización toca esa tabla y `featured` ya tiene otro significado) **ni una tabla con 4 filas** (reordenar choca con índices únicos y obliga a escribir una RPC).

```sql
create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint home_featured_shape check (
    key <> 'home_featured'
    or (jsonb_typeof(value) = 'array' and jsonb_array_length(value) = 4)
  )
);
alter table public.store_settings enable row level security;
grant select on public.store_settings to anon, authenticated;
grant insert, update on public.store_settings to authenticated;
create policy store_settings_read on public.store_settings for select using (true); -- no guarda secretos
create policy store_settings_write_admin on public.store_settings for all
  using (public.is_admin()) with check (public.is_admin());
create policy store_settings_featured_staff on public.store_settings for update
  using (key = 'home_featured' and public.is_employee())
  with check (key = 'home_featured' and public.is_employee());
-- semilla con los 2 activos de hoy + 2 elegidos por Gonzalo (pregunta abierta)
insert into public.store_settings (key, value) values ('home_featured', '["3381","3499","<id3>","<id4>"]')
  on conflict (key) do nothing;
```
El trigger de auditoría de la Etapa 1 se suma a `store_settings` (`home.destacados`).

**Tareas**
- [ ] Migración `20260927120000_store_settings.sql` (el SQL de arriba + el trigger de auditoría). Si Gonzalo decide que el empleado no elige los destacados, se omite la política `store_settings_featured_staff`.
- [ ] `src/services/persistence/types.ts`: `getSetting<T>(key)` / `saveSetting(key, value)`. Se implementa en `supabase-adapter.ts` (`upsert`) y en `local-adapter.ts` (`localStorage`).
- [ ] `store.tsx`: cargar `home_featured` en el mismo `Promise.all` de la línea 272. Exponer `homeFeaturedIds` y `saveHomeFeatured(ids)`.
- [ ] Nueva `src/lib/home-featured.ts` con una función pura `resolveHomeFeatured(products, ids): Product[]`:
  - toma los ids en orden y descarta los que no pasan `canAddProductToCart(p) && p.image`.
  - **completa hasta 4** con `getLaunchBestSellers(products)` (ya existe en `launch-catalog.ts:144`) sin repetir.
  - devuelve además `replaced: {slot, productId}[]` para avisar en el panel.
- [ ] `home-client.tsx:68-78, 240-243`: borrar `STAR_PRODUCTS` y usar `resolveHomeFeatured`. `imageOverride` deja de hacer falta, porque la imagen del producto ya es la misma webp.
- [ ] Panel, `categorias/page.tsx`: tarjeta **"Visibles en el home"** arriba de la lista:
  - 4 casilleros con la foto, el nombre y el estado (Visible, o "Oculto: se muestra X en su lugar" en naranja).
  - "Cambiar" abre un buscador que reusa `src/lib/search.ts` y lista solo productos activos, con foto y disponibles.
  - Botones ↑/↓ para reordenar, sin librería de arrastre, y "Guardar" guarda los 4 juntos. La pantalla impide los repetidos y exige exactamente 4 (la base también lo exige).
- [ ] Renombrar el checkbox `featured` de la ficha (H14).
- **Qué pasa si un elegido se oculta o se queda sin stock:** el home lo reemplaza solo, en el orden de más vendidos, y el panel lo marca en naranja para que alguien elija otro. **Nunca se muestran menos de 4** mientras haya 4 productos publicables (hoy hay 86 activos).
- **Caché:** no hace falta. El sitio es estático y lee Supabase en cada visita, así que un cambio se ve al recargar.
- **Tests:** `home-featured.test.ts` con 4 válidos, uno inactivo, uno sin imagen, un id borrado y ids repetidos. E2E: en el modo local, cambiar un destacado desde Categorías y verlo en el home.
- **Aceptación:** el home muestra siempre 4 productos, en el orden elegido. Cada cambio queda en Actividad con su autor.

---

### Etapa 3: carrusel "También te puede interesar" configurable y medición · Esfuerzo **S/M** (1-2 días)

**Recomendación de diseño:** **automático con rotación diaria**. Es el mismo algoritmo diverso de hoy (`src/lib/related-products.ts`, una vuelta por categoría con 2 como máximo), pero con la semilla `producto + fecha de hoy (hora de Argentina)`. Así las sugerencias cambian una vez por día (quien vuelve ve otras) sin parpadear durante una misma visita.
- **"Aleatorio en cada carga": no.** Se desordena mientras la persona mira y no se puede medir.
- **"Manual por producto" o combos por categoría: todavía no** (ver sección 6). Con 86 productos activos, mantener eso es trabajo continuo que nadie va a sostener.
- **"Priorizar por margen": no se puede.** No hay dato de costo en `products`. Se puede priorizar por destacados (ya lo hace) o por ofertas.

**Qué se configura** (clave `related_carousel` en `store_settings`, solo admin):
```json
{ "count": 10, "mode": "daily", "excludeCategories": [], "preferFeatured": true }
```
- `count`: entre 6 y 12 (con `check` en la base, igual que en la Etapa 2).
- `mode`: `"fixed"` (el comportamiento de hoy) o `"daily"`.
- `excludeCategories`: por ejemplo, no sugerir repuestos.

**Tareas**
- [ ] Migración: `check` de forma para `related_carousel` y semilla con el comportamiento de hoy (`mode: "fixed"`, `count: 10`).
- [ ] `related-products.ts`: `selectRelatedProducts(products, current, options)`. Con `mode = 'daily'` la semilla es `${current.id}:${yyyy-mm-dd AR}`. Se filtran `excludeCategories`. Actualizar `related-products.test.ts` (misma fecha → mismo resultado; otra fecha → otro resultado; 6 ≤ count ≤ 12).
- [ ] `product-detail-client.tsx:81`: pasarle las opciones del store.
- [ ] Panel: en Configuración (solo admin), bloque "Carrusel de la ficha" con cantidad (select de 6 a 12), modo (Fijo / Cambia cada día) y categorías excluidas (checkboxes).

**Medición sin herramientas externas: lo mínimo que alcanza**
- [ ] **Atribución en el pedido, sin tabla nueva:** cuando se agrega al carrito desde el carrusel, la línea del carrito lleva `source: "related"` (y `"home"` si viene de los destacados). Ese dato ya viaja en `orders.lines` (jsonb) y **cuenta ventas, no clics**, que es lo que le importa a Gonzalo.
  - archivos: el tipo `CartLine` en `types.ts`, `addToCart(productId, qty, source?)` en `store.tsx:356`, el botón de agregar del carrusel y el mapeo a `lines` en el checkout (verificar que `payment-create` conserve el campo o lo ignore sin romper).
- [ ] **Resumen del panel:** tarjeta "Carrusel de la ficha, últimos 30 días" con los pedidos que incluyen un producto del carrusel, las unidades, el total y el **ticket promedio de los pedidos con carrusel frente a los que no**. Se calcula en el cliente con los `orders` que ya están cargados.
- [ ] **Clics (opcional, más adelante):** solo si Gonzalo quiere el embudo completo. Sería una tabla `store_events` de solo inserción, sin datos personales, con RLS `insert` para anon limitado a 2 tipos y `select` solo para admin. Hoy no lo recomiendo.
- **Advertencia honesta:** hay 9 pedidos en total y 3 aprobados. Con este volumen **ninguna medición va a ser concluyente en semanas**. Conviene dejar "Cambia cada día" y mirar la tarjeta una vez por mes. Un test A/B no tiene sentido a esta escala.
- **Aceptación:** cambiar la cantidad o el modo en Configuración se ve en la ficha al recargar, y un pedido hecho desde el carrusel aparece contado en Resumen.

---

### Etapa 4: mejoras opcionales, ordenadas por impacto/esfuerzo

| # | Mejora | Impacto | Esfuerzo | Notas |
|---|---|---|---|---|
| 4.1 | **Aplicar las 3 migraciones pendientes antes del PR #87** (H8) | Alto | S | Es condición para publicar lo que ya está hecho |
| 4.2 | **Alertas por correo al equipo** (H9): sincronización fallida, correos atascados, webhook con error | Alto | S-M | Reusar la outbox con el nuevo tipo `team_alert` y `order-email.ts`. Un solo aviso por incidente y por día. Merge o cierre del PR #61 |
| 4.3 | **Backup semanal** si el plan es Free (H10) | Alto (si pasa algo) | S | GitHub Action con `pg_dump`, más una prueba de restauración en staging |
| 4.4 | **Buscar pedidos por teléfono o DNI** (H15) | Medio | S | Comparar solo los dígitos |
| 4.5 | **Nota interna por pedido** | Medio | S | `alter table orders add column internal_note text`. El empleado puede editarla (la lista blanca de 1.1 ya la contempla). No se ve en la tienda |
| 4.6 | **Historial de estados con autor** en el detalle del pedido | Medio | S | Sale gratis de los triggers de 1.1: `select … from audit_log where detail like '<id>%'` (conviene sumar una columna `order_id` al log) |
| 4.7 | **"Ocultar" en vez de "Eliminar"** (H13) | Medio | S | Eliminar queda solo para admin, en "Más opciones" |
| 4.8 | **Exportar pedidos y clientes a CSV** | Medio | S | En el navegador, con los datos ya cargados. Solo admin |
| 4.9 | **Imprimir remito** del pedido | Medio | S | Vista de impresión con CSS `@media print` y `window.print()`, sin librerías |
| 4.10 | **Reporte simple de ventas** en Resumen (mes actual contra el anterior y top 5 productos) | Medio | S | Con los datos ya cargados |
| 4.11 | **2FA (TOTP) opcional para admins** | Medio | M | Supabase MFA nativo. Pantalla para registrar el factor y pedir el código en el login |
| 4.12 | **Sonido o aviso del navegador** cuando entra un pedido con el panel abierto | Bajo-Medio | S | El polling de 15 s ya existe. Solo reproducir un sonido si sube el contador. El correo `team_new_order` ya existe |
| 4.13 | **Horarios y textos de la tienda** desde el panel | Bajo | M | Claves en `store_settings`. Hoy están en el código y en el correo (`order-email.ts:181`) |
| 4.14 | **Promos del hero** desde el panel | Bajo | M | El mismo patrón que la Etapa 2 (`PROMO_SLIDES`, `home-client.tsx:16`). Hacerlo solo si cambian seguido |
| 4.15 | Aviso si el catálogo llega a 1000 filas (H12) | Bajo | S | Una línea |

---

## 6. Lo que NO recomiendo hacer ahora

- **Una cuenta compartida para empleados**: se pierde quién hizo qué y hay que cambiar la contraseña cada vez que alguien se va (sección 4.1).
- **Un rol "dueño" separado del admin, o permisos configurables por pantalla**: con 4 personas, dos roles alcanzan. Un sistema de permisos editable es mucho código para un caso que no existe.
- **Mover el DNI a una tabla aparte para ocultárselo al empleado**: cuesta mucho, lo necesitan para despachar y hoy hay 0 pedidos con DNI. Alcanza con enmascararlo en pantalla.
- **Editar precio o stock desde el panel**: el **Sheet es la fuente de verdad** y la sincronización cada 3 h lo pisaría. Si hace falta, se corrige en el Sheet.
- **Reembolsos de Mercado Pago desde el panel**: son pocos casos, mueven plata real y hay riesgo de errores. Se hacen desde el panel de Mercado Pago, y el webhook ya actualiza el estado (`refunded` existe en el check).
- **Paginación del lado del servidor, búsqueda en el servidor o índices nuevos**: con 587 productos y 9 pedidos no hace falta. Se revisa al pasar los 1000 productos o los 500 pedidos (H12).
- **Relacionados manuales por producto o combos**: requieren mantenimiento continuo. La rotación diaria automática da casi todo el beneficio.
- **Analytics externos o un A/B test del carrusel**: el volumen actual no da resultados concluyentes. Alcanza con la atribución en el pedido.
- **Filtros guardados, etiquetas de cliente o papelera**: no aportan a esta escala. La URL con los filtros y "Ocultar" cubren lo mismo.
- **Realtime de Supabase para el panel**: el polling de 15 s ya funciona y es más simple.

---

## 7. Preguntas abiertas para Gonzalo

1. **Emails definitivos**: ¿cuál es el email de la marca para tu cuenta? ¿Qué casilla va a usar cada empleado? ¿Las crea el negocio?
2. **¿Querés ver todo el panel tal como está hoy?** (La recomendación es que sí: admin completo.)
3. **Las otras 2 cuentas admin que ya existen**: ¿de quién son? Si nadie las reconoce, se desactivan.
4. **Empleados y datos personales**: ¿pueden ver el teléfono y la dirección del pedido (hacen falta para operar)? ¿Y el DNI completo, o enmascarado con un botón "ver"?
5. **Empleados y pagos**: ¿pueden marcar "pagado" cuando un cliente paga en el local o por transferencia, o eso lo hacés solo vos?
6. **Empleados y envíos**: ¿pueden **crear la guía** (tiene costo) o solo **descargar o imprimir la etiqueta** de una guía que ya creaste?
7. **Empleados y catálogo**: ¿solo ven los productos, o también pueden ocultar o mostrar un producto?
8. **Destacados del home**: ¿los pueden cambiar los empleados o solo vos? ¿Qué 2 productos van con 3381 y 3499 para completar los 4 ya mismo?
9. **Resumen**: ¿el empleado puede ver los montos de venta?
10. **Carrusel de la ficha**: ¿cuántos productos preferís (sugerencia: 10)? ¿Hay categorías que no quieras sugerir?
11. **Alertas**: ¿a qué email tienen que llegar los avisos de fallas? ¿Al mismo de pedidos nuevos o solo al de Franco?
12. **Plan de Supabase**: ¿Free o Pro? Eso define los backups y el vencimiento de la sesión por inactividad del lado de Supabase.
