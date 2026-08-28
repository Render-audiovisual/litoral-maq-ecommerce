# Etapa 5 — Persistencia compartida (diseño)

Este documento es el diseño técnico de la Etapa 5, entregado antes de la
implementación según lo acordado. Cubre: auditoría del modelo actual,
esquema Supabase, políticas RLS, estrategia de migración, archivos afectados
y criterios de aceptación.

**Alcance de esta entrega**: la integración queda completa y "conectable"
— cliente Supabase centralizado y tipado, adaptador Supabase completo
(productos, perfiles/clientes, carrito, pedidos, auditoría), selector de
proveedor por configuración, migraciones SQL/RLS/índices versionados,
script de importación con dry-run y `--apply`, y todo probado con mocks o
en entorno local (`npm test`). No se crea el proyecto Supabase remoto, no se
ejecutan migraciones contra un servicio real, no se usan credenciales
reales. Lo único pendiente es autorizar/crear el proyecto y seguir la guía
de conexión (§9). El frontend sigue siendo `output: "export"` alojado en
Hostinger — no se migra a Vercel ni a un VPS.

## 1. Auditoría del modelo actual

Fuente de verdad: `src/lib/types.ts`, `src/store/store.tsx`,
`src/services/mock.ts`, `src/data/products.json` (460 productos).

| Concepto | Dónde vive hoy | Forma |
|---|---|---|
| Productos | `localStorage["litoral-products-v1"]`, seed en `src/data/products.json` | `Product` — `id` (string, igual a `code` en el seed pero no siempre: productos manuales usan `manual-<timestamp>`), `slug`, `code`, `name`, `price`, `rawPrice`, `category`, `brand`, `image`, `images[]`, `stock`, `lowStockThreshold`, `active`, `featured`, `description`, `variants[]`, `source`, `sourceRow`, `incomplete[]`. 460/460 `code` e `id` únicos en el seed. |
| Carrito | `localStorage["litoral-cart-v1"]` | `CartLine[]` — un único carrito global por navegador, sin dueño. |
| Clientes (perfil admin) | `localStorage["litoral-customers-v1"]` | `Customer` — `id`, `name`, `email` (normalizado), `phone?`, `role`. |
| Cuentas demo (credenciales) | `localStorage["litoral-accounts-v1"]`, dentro de `services/mock.ts` | `Account` — `id`, `name`, `email`, `role: "customer"`, `providers.password.value` (texto plano, documentado como inseguro), `providers.google.providerId`, `createdAt`. |
| Pedidos | `localStorage["litoral-orders-v1"]` | `Order` — `id`, `customerId` (`customer-<email>` o `guest-<email>`, determinístico), `customerName`, `email`, `lines[]`, `total`, `shipping`, `deliveryMethod`, `address?`, `status`, `createdAt`, `paymentReference`. |
| Sesiones | `localStorage["litoral-customer-session-v1"]` / `["litoral-admin-session-v1"]` | `Session` — `user: Customer`, `token`, `expiresAt`. Separadas por sector desde Etapa 2. |
| Auditoría admin | `localStorage["litoral-admin-audit-log-v1"]` | `AuditEntry` — `id`, `at`, `adminId`, `adminEmail`, `action`, `detail`. Tope de 200, protegido por `isValidAdminSession` (Etapa 4). |
| Admin | Fijo en `services/mock.ts` (`admin@litoralmaq.com` / `admin123`) | No hay tabla; es una constante en el bundle. |

Puntos ya correctos y que se conservan tal cual: normalización central de
email (`lib/auth.ts`), IDs determinísticos (`customer-<email>` /
`guest-<email>`), separación de sesiones, guard de mutaciones admin
(`store/admin-actions.ts`), auditoría con tope de 200.

## 2. Esquema Supabase (Postgres)

Archivos: `supabase/migrations/0001_schema.sql`,
`supabase/migrations/0002_profiles_trigger.sql`,
`supabase/migrations/0003_rls_policies.sql`.

### `profiles`
Reemplaza `accounts` + `customers` en una sola tabla, vinculada 1:1 a
`auth.users`. Las contraseñas dejan de existir acá: las maneja Supabase Auth.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `references auth.users(id) on delete cascade` |
| `role` | `text` | `check (role in ('admin','customer'))`, default `'customer'` |
| `name` | `text` | |
| `email` | `text` | nullable (anónimos no tienen email) |
| `phone` | `text` | nullable |
| `is_anonymous` | `boolean` | default `false`, espejo de `auth.users.is_anonymous` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Índices: `unique (email) where email is not null`.

### `products`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | `text` PK | igual al `Product.id` actual |
| `slug` | `text` | `unique not null` |
| `code` | `text` | `unique not null` |
| `name` | `text` | `not null` |
| `price` | `numeric` | nullable |
| `raw_price` | `text` | nullable |
| `category` | `text` | `not null` |
| `brand` | `text` | `not null` |
| `image` | `text` | nullable |
| `images` | `text[]` | default `'{}'` |
| `stock` | `integer` | `not null default 0` |
| `low_stock_threshold` | `integer` | `not null default 0` |
| `active` | `boolean` | `not null default true` |
| `featured` | `boolean` | `not null default false` |
| `description` | `text` | nullable |
| `variants` | `text[]` | default `'{}'` |
| `source` | `text` | `not null default 'manual'` |
| `source_row` | `integer` | nullable |
| `incomplete` | `text[]` | default `'{}'` |
| `created_at` / `updated_at` | `timestamptz` | default `now()` |

Índices: `unique(code)`, `unique(slug)`, `index(category)`, `index(active)`.
No se crea tabla de categorías/marcas: hoy son texto libre derivado del
catálogo (confirmado en `admin/categorias/page.tsx`), se mantiene igual.

### `orders`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | `text` PK | formato `LM-########` actual |
| `customer_id` | `uuid` | `references profiles(id)`, **no nullable** — con Auth anónima, todo comprador (invitado o registrado) tiene un `auth.uid()` real |
| `customer_name` | `text` | |
| `email` | `text` | `not null`, normalizado |
| `lines` | `jsonb` | `not null`, `[{productId, quantity}]` |
| `total` / `shipping` | `numeric` | `not null` |
| `delivery_method` | `text` | `check in ('envio','retiro')` |
| `address` | `text` | nullable |
| `status` | `text` | `check in ('pendiente','pago_simulado','preparando','enviado','entregado','cancelado')`, default `'pendiente'` |
| `created_at` | `timestamptz` | default `now()` |
| `payment_reference` | `text` | |

Índices: `index(customer_id)`, `index(email)`, `index(status)`,
`index(created_at desc)`.

### `carts`
| Columna | Tipo | Notas |
|---|---|---|
| `owner_id` | `uuid` PK | `references profiles(id)` |
| `lines` | `jsonb` | `not null default '[]'` |
| `updated_at` | `timestamptz` | default `now()` |

### `audit_log`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `at` | `timestamptz` | default `now()` |
| `admin_id` | `uuid` | `references profiles(id)` |
| `admin_email` | `text` | `not null` |
| `action` | `text` | `not null` |
| `detail` | `text` | `not null` |

Índices: `index(at desc)`, `index(admin_id)`. Sin `UPDATE`/`DELETE` permitidos
para nadie (append-only) — ver RLS.

## 3. Políticas RLS (mínimo privilegio)

Función auxiliar (`security definer` para evitar recursión al leer
`profiles` dentro de su propia policy):

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
```

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `products` | `active = true OR is_admin()` (público) | `is_admin()` | `is_admin()` | `is_admin()` |
| `orders` | `auth.uid() = customer_id OR is_admin()` | `auth.uid() = customer_id OR is_admin()` (nunca sin identidad: `anon` sin sesión tiene `auth.uid() IS NULL`, que nunca iguala un `customer_id`) | `is_admin()` únicamente (el cliente no puede editar su propio pedido) | `is_admin()` |
| `carts` | `auth.uid() = owner_id` | `auth.uid() = owner_id` | `auth.uid() = owner_id` | `auth.uid() = owner_id` |
| `profiles` | `auth.uid() = id OR is_admin()` | ninguna (la crea el trigger `handle_new_user`, `security definer`) | `auth.uid() = id` (protegido por trigger para que nadie cambie su propio `role`) `OR is_admin()` | ninguna |
| `audit_log` | `is_admin()` | `is_admin()` | ninguna (inmutable) | ninguna (inmutable) |

Auto-elevación de rol bloqueada con un trigger `before update on profiles`
que restaura `NEW.role := OLD.role` cuando quien ejecuta no es admin.

Esto satisface los cuatro requisitos: catálogo público de solo lectura
(filtrado a `active`), escrituras de catálogo/estado/auditoría solo admin,
clientes autenticados limitados a su propio perfil/carrito/pedidos, e
invitados solo mediante identidad anónima de Supabase (nunca un insert sin
`auth.uid()`).

## 4. Adaptadores (`src/services/persistence/`)

- `types.ts` — interfaz `PersistenceAdapter` (productos, clientes, pedidos,
  carrito, auditoría).
- `local-adapter.ts` — implementación 1:1 sobre las mismas claves de
  `localStorage` que usa hoy la app. Es el adaptador activo por defecto y el
  camino de rollback.
- `local-accounts-store.ts` — cuentas demo (credenciales), deliberadamente
  fuera de `PersistenceAdapter`: no tienen tabla equivalente en Supabase,
  ahí las maneja Auth por completo.
- `supabase/database.types.ts` — tipos del esquema (`Database`), a mano hoy,
  regenerables con el CLI de Supabase (ver §9).
- `supabase/client.ts` — **cliente Supabase centralizado y tipado**:
  `readSupabaseConfig()` valida las variables de entorno (formatos, que no
  se haya pegado una `service_role` por error) y `createTypedSupabaseClient()`
  es la única llamada a `createClient` de todo el proyecto.
- `supabase-adapter.ts` — implementación real contra las tablas de arriba,
  recibe el cliente ya construido (inyectable → testeable con un cliente
  falso, sin red). No se activa hasta que la configuración sea válida.
- `index.ts` — `getPersistenceAdapter()`: selector de proveedor (ver §4.1).
  Hoy siempre devuelve Local (no existe el proyecto).
- `migration.ts` — funciones puras de transformación para preparar (no
  ejecutar) la migración de cuentas/clientes/pedidos.

`store/store.tsx` y `services/mock.ts` dejan de tocar `localStorage`
directamente para productos, clientes, pedidos, carrito, cuentas y
auditoría; pasan a usar el adaptador. Las sesiones (`customerSession` /
`adminSession`) y la migración heredada v1→v2 siguen igual: son del dominio
del `AuthAdapter` y de un one-off local respectivamente, no de este
adaptador de datos.

### 4.1 Selector de proveedor (`NEXT_PUBLIC_PERSISTENCE_PROVIDER`)

| Valor | Comportamiento |
|---|---|
| `local` (o sin definir) | Local. **Único** camino de rollback explícito (§10) — no hay auto-detección implícita por la sola presencia de variables de Supabase. |
| `supabase` | Exige configuración Supabase válida. Si falta o está mal, **`getPersistenceAdapter()` / `getAuthAdapter()` lanzan** (`ProviderConfigError`) — `StoreProvider` lo captura y muestra una pantalla de error visible en vez de montar la app. **Nunca cae a Local en silencio**: eso generaría datos divergentes entre dispositivos (un dispositivo escribiendo en Supabase, otro en localStorage, sin que nadie lo note). |

Clave pública: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` es la opción
**principal** (nomenclatura vigente de Supabase); `NEXT_PUBLIC_SUPABASE_ANON_KEY`
queda como alias legacy si el proyecto no rotó todavía. Ninguna clave con
forma de secreta (`sb_secret_...`, `service_role`) es aceptada en una
variable `NEXT_PUBLIC_*`, sin importar el nombre de la variable.

**Nota de implementación importante**: `resolveRequestedProvider()` y
`readSupabaseConfig()` leen cada variable como expresión literal
`process.env.NEXT_PUBLIC_X` (nunca `process.env` completo asignado a una
variable, ni `process.env[nombreDinamico]`). Se probó en carne propia: usar
`process.env` como valor por defecto de un parámetro rompe el reemplazo
estático de Next.js para el bundle de cliente, dejando `process.env` vacío
en el navegador — el selector "funcionaba" en el servidor (build estático)
pero siempre resolvía a Local en el cliente, sin ningún error visible. Se
verificó corrigiendo el bug con un build estático real (`next build` +
servido estático), no solo con `next dev` (que no reprodujo el problema de
la misma forma) — ver §12.

### 4.2 AuthAdapter (`src/services/auth/`) — registro, login, logout, sesión, Google, invitados

- `types.ts` — reexporta `AuthAdapter` (mismo contrato desde Etapa 2-3:
  `signInCustomer`, `signUpCustomer`, `signInCustomerWithGoogle`,
  `signInAdmin`, `signOut`) y agrega dos capacidades opcionales, siguiendo el
  mismo patrón (`supportsX(adapter)` como type guard, nunca un método vacío
  en el adaptador que no lo necesita):
  - `GuestCapableAuthAdapter.ensureGuestSession()` — solo tiene sentido con
    una identidad real detrás.
  - `SessionRestorableAuthAdapter.restoreSession()` — el SDK de Supabase
    persiste su propia sesión (con refresh token) por fuera de la caché que
    `store.tsx` guarda en `litoral-customer/admin-session-v1`; sin esto, esa
    caché nunca se revalida contra la sesión real y trataría como vencida
    una sesión que el SDK ya refrescó solo. El adaptador local no la
    implementa: ahí la caché del store ES la única fuente de verdad.
    `store.tsx` la usa al arrancar (antes de confiar en la caché) cuando el
    adaptador activo la soporta.
- `local-auth-adapter.ts` — el adaptador demo de siempre (movido acá desde
  `services/mock.ts`, mismo comportamiento exacto), activo por defecto.
  **No** implementa `ensureGuestSession`: el modelo de invitado local sigue
  siendo el id determinístico `guest-<email>`, sin sesión.
- `supabase-auth-adapter.ts` — implementación real:
  - `signInCustomer` / `signInAdmin`: `signInWithPassword` + lee
    `profiles.role` para aceptar/rechazar según el sector (rechaza y cierra
    la sesión si el rol no corresponde).
  - `signUpCustomer`: el registro público **nunca puede crear un admin**
    — no por una comparación de email hardcodeada como en el modelo local,
    sino porque el trigger `handle_new_user` fuerza `role='customer'`
    siempre, estructuralmente, en la base.
  - `startGoogleSignIn`: OAuth **real** de Supabase. Elige solo entre
    `signInWithOAuth({ provider: 'google' })` —sin sesión o con cuenta
    permanente— y `linkIdentity({ provider: 'google' })` cuando hay una
    sesión anónima, que conserva el mismo uid y con él los pedidos del
    invitado. El retorno lo procesa `/auth/callback`. Ya no existe ningún
    login social simulado (ver `no-shared-credentials.test.ts`).
  - `ensureGuestSession`: `signInAnonymously()` — ver §4.3.
  - Todos los métodos que pegan a un endpoint protegible de GoTrue aceptan
    un `captchaToken` (Cloudflare Turnstile). Ver
    `docs/CUENTAS_DE_CLIENTE.md`.
- `index.ts` — `getAuthAdapter()`, mismo selector y misma política de
  "fallar visible" que `getPersistenceAdapter()` (usa el mismo
  `services/provider.ts`, para que nunca queden desincronizados: nunca
  persistencia-local + auth-supabase, o viceversa).

`login/page.tsx`, `registro/page.tsx`, `admin/login/page.tsx` usan
`getAuthAdapter()` en vez de importar `mockAuthAdapter` directo — mismo
comportamiento hoy (Local activo), pluggable cuando se active Supabase.

**Limitación real encontrada y documentada (no oculta): sesión de cliente y
sesión de admin no pueden coexistir en el mismo navegador con el adaptador
Supabase.** El modelo local guarda `customerSession` y `adminSession` en dos
claves de `localStorage` totalmente independientes, sin backend detrás —
por eso ambas pueden estar activas a la vez (criterio de aceptación de la
Etapa 2). `createTypedSupabaseClient()` es, a propósito, el único cliente
Supabase de todo el proyecto (ver §4 más arriba) y el SDK de Supabase
sostiene **una sola sesión de Auth real** por instancia de cliente/clave de
storage: iniciar sesión como admin en un navegador donde ya había una sesión
de cliente activa (o viceversa) reemplaza esa sesión de Auth, no la suma.
`store.tsx` ya refleja esto explícitamente al arrancar: con
`restoreSession()` disponible (proveedor Supabase), la sesión restaurada se
asigna a `customerSession` o `adminSession` según su `role`, y la otra queda
en `null` — nunca se muestran dos sesiones vivas que en realidad son una
sola por debajo. Habilitar sesiones concurrentes reales requeriría un
segundo cliente Supabase con un `auth.storageKey` propio para el sector
admin, cambio de arquitectura que no forma parte de esta entrega — ver
"Riesgos o limitaciones restantes" en el reporte de cierre de Etapa 5.

### 4.3 Identidad anónima e invitados (`signInAnonymously`)

`checkout/page.tsx`: cuando no hay `customerSession` y el adaptador de auth
activo soporta `ensureGuestSession` (Supabase), el checkout crea o reutiliza
una identidad anónima real antes de generar el pedido — el `customerId`
queda scoped por `auth.uid()` bajo RLS, nunca un string que cualquiera
podría inventar. Con el adaptador local, sigue el id determinístico de
siempre (sin cambios). La sesión anónima resultante se guarda como
`customerSession` normal — para Supabase, "invitado" es una sesión
autenticada más (`role: customer`, `isAnonymous: true`), no una ausencia de
sesión.

**Conversión a cuenta nueva — en dos pasos, que es la secuencia que
Supabase documenta hoy** (`linkEmailToGuestAccount`, no `signUpCustomer`):

1. `client.auth.updateUser({ email }, { emailRedirectTo })` sobre la sesión
   anónima: **vincula** el email a esa misma fila de `auth.users`,
   conservando el `uid`. La persona recibe un correo y confirma.
2. Recién con el email verificado, `/crear-clave` llama
   `updateUser({ password })`.

La versión anterior mandaba email y contraseña en una sola llamada: eso
fijaba una contraseña sobre un email que nadie había confirmado. Un signUp
normal con la sesión anónima viva está bloqueado a propósito (crearía un
uid nuevo y dejaría los pedidos del invitado inalcanzables).

Como los pedidos ya quedaron guardados con ese `uid`, no hace falta
reasignar nada (a diferencia del modelo local, donde `convertGuestToAccount`
sí tiene que reescribir `customerId` en cada pedido porque el invitado local
no tiene un id real). `profiles.email` e `is_anonymous` los actualiza un
trigger de la base (migración 0008), no el navegador.

**Mecanismo seguro para el conflicto con una cuenta existente** — el punto
central de este apartado: si el email ya pertenece a otra cuenta permanente,
`updateUser` devuelve un error (`email_exists` / "already registered").
**No se fusiona automáticamente** el carrito/pedidos anónimos con esa cuenta
solo porque alguien escribió ese email en el checkout — eso permitiría que
cualquiera reclamara el historial de otra persona con solo tipear su email.
El adaptador devuelve un error claro pidiendo iniciar sesión con la cuenta
existente. La fusión real de historial de invitado hacia una cuenta ajena
preexistente **no está implementada** — requeriría verificar la propiedad
del email (confirmación por correo) antes de asociar nada, lo cual está
fuera de alcance sin un proyecto real con envío de emails configurado. Esto
está probado con mocks: ver `supabase-auth-adapter.test.ts`, casos de
conversión exitosa (mismo uid, sin llamar a `signUp`) y de conflicto
(rechazo sin fusionar).

**Conversión con Google**: `linkIdentity({ provider: 'google' })` desde la
sesión anónima, mismo criterio y mismo uid. Si esa identidad de Google ya
pertenece a otra cuenta, Supabase devuelve `identity_already_exists`:
`/auth/callback` lo muestra pidiendo ingresar con esa cuenta y **no** mueve
ningún pedido ni cierra la sesión de invitado.

Los pasos manuales del dueño (Google Cloud, SMTP, Turnstile, allow-list de
redirects) están en **`docs/CUENTAS_DE_CLIENTE.md`**.

## 5. Estrategia de migración

### Productos (los 460 reales)
`scripts/prepare-products-migration.mjs` lee `src/data/products.json`,
valida campos requeridos y detecta duplicados por `id`/`code`/`slug`.

- **Modo dry-run (por defecto, sin flags)** — no toca red. Genera:
  - `supabase/seed/products.sql` — `insert ... on conflict (id) do update
    set ...` idempotente (se puede correr múltiples veces sin duplicar ni
    perder datos).
  - `supabase/seed/products-report.json` — resumen y cualquier anomalía
    detectada (nunca se sobrescribe/borra nada silenciosamente).
- **Modo `--apply`** — además de generar los archivos de arriba, aplica el
  upsert directo contra Supabase (en lotes de 250, `on conflict (id)`,
  mismo criterio idempotente). **Autenticación**: usa `NEXT_PUBLIC_SUPABASE_URL`
  (no es secreta) + `SUPABASE_SERVICE_ROLE_KEY` — una variable **privada,
  sin prefijo `NEXT_PUBLIC_`**, que ningún archivo de `src/` importa jamás
  (verificado con `grep -rn SERVICE_ROLE src/`). La clave publicable/anon
  **no sirve para esto**: la policy RLS de `products` exige `is_admin()`
  para escribir, y este script no corre con ninguna sesión de usuario
  autenticada detrás — solo la service_role, que salta RLS legítimamente
  por ser un proceso de servidor de confianza. Ver `.env.migration.example`
  (separado de `.env.example`, nunca en el mismo archivo que las variables
  del frontend). Sin la variable, falla con un mensaje claro y no intenta
  conectarse a nada:
  ```bash
  node --env-file=.env.migration.local scripts/prepare-products-migration.mjs --apply
  ```

### Cuentas, clientes y pedidos existentes (datos ya en el navegador de un usuario)
No hay archivo de por medio — viven en `localStorage` del navegador de cada
visitante. `services/persistence/migration.ts` expone funciones puras y
testeadas que documentan y preparan la transformación (no las ejecuta contra
ningún servidor todavía):
- `mapAccountToProfileDraft(account)` — produce el payload de `profiles`
  **sin** `providers.password`; una cuenta con solo contraseña demo queda
  marcada `requiresPasswordReset: true` para que, en producción, ese cliente
  cree/restablezca su contraseña vía Supabase Auth (nunca se traslada la
  contraseña de texto plano).
- `mapOrderToSupabaseOrder(order, resolvedCustomerId)` — normaliza el pedido
  al shape de la tabla; los pedidos con `customerId` tipo `guest-<email>`
  quedan marcados `pendingAnonymousLink: true` porque no existe un
  `auth.uid()` real hasta que ese invitado inicie sesión anónima en Supabase
  — no se puede resolver localmente, es una limitación documentada.
- `dedupeCustomersByEmail(customers)` — mismo criterio que la migración v1→v2
  ya validada en Etapa 3, reportando conflictos sin borrarlos.

## 6. Archivos a modificar/crear

Nuevos: `supabase/README.md` (este archivo), `supabase/migrations/000{1,2,3}_*.sql`,
`supabase/seed/` (generado por el script), `.env.example`,
`.env.migration.example`, `src/services/provider.ts`,
`src/services/persistence/*` (incluye `supabase/client.ts`,
`supabase/database.types.ts`), `src/services/auth/*` (`local-auth-adapter.ts`,
`supabase-auth-adapter.ts`, `index.ts`, `types.ts`),
`scripts/prepare-products-migration.mjs`, `*.test.ts` junto a cada módulo,
`vitest.config.mts`.

Modificados: `src/services/mock.ts` (solo quedan pago/envío/imágenes/sheet;
el auth se movió a `services/auth/`), `src/store/store.tsx` (adaptador +
pantalla de error visible; recuperación de sesión real vía
`restoreSession()` al arrancar cuando el proveedor la soporta;
`convertGuestToAccount` se vuelve no-op bajo Supabase — ver más abajo),
`src/app/checkout/page.tsx` (identidad anónima cuando corresponde),
`src/app/login/page.tsx`, `src/app/registro/page.tsx`,
`src/app/admin/login/page.tsx` (usan `getAuthAdapter()`),
`src/app/cuenta/pedidos/page.tsx`, `src/lib/types.ts` (exporta `Account`,
`Customer.isAnonymous`), `src/lib/orders.ts` (aislamiento por usuario
extraído y testeado), `src/services/auth/types.ts` (agrega
`SessionRestorableAuthAdapter` / `supportsSessionRestore`),
`src/services/auth/supabase-auth-adapter.ts` (implementa `restoreSession`),
`package.json` (`@supabase/supabase-js`, `vitest`, scripts `test` y
`prepare:products-migration`).

**Bug encontrado y corregido durante el cierre de Etapa 5**:
`convertGuestToAccount(email, accountId)` (`store.tsx`) llamaba siempre a
`adapter.reassignOrdersCustomer(guestIdFromEmail(email), accountId)`
después de cada login/registro. Con Supabase eso hubiera fallado en
producción: `guestIdFromEmail()` devuelve un string tipo
`guest-mail@x.com`, pero `orders.customer_id` es `uuid` — el `UPDATE ...
WHERE customer_id = 'guest-mail@x.com'` genera un error de Postgres
(`invalid input syntax for type uuid`). Además era innecesario: con
Supabase, la conversión de invitado a cuenta conserva el mismo `auth.uid()`
desde el checkout (§4.3), así que no hay nada que reasignar. Corregido para
que sea no-op cuando el adaptador de auth activo soporta identidad de
invitado real (`supportsGuestSessions`), y siga reasignando como siempre en
el modelo local (donde si hace falta, porque el invitado es el id
determinístico `guest-<email>`). No se pudo reproducir el error contra
Postgres real (sin Docker, ver §12) — se encontró por inspección del tipo de
columna en `0001_schema.sql` contra el valor que el código realmente
generaba, no por un test que fallara.

Sin cambios: rutas, componentes de UI, `next.config.ts` (sigue
`output: "export"`), guards de Etapas 1-4, auditoría.

## 7. Criterios de aceptación

1. El comportamiento actual (catálogo, carrito, checkout, cuenta, panel,
   auditoría, guards) es idéntico antes y después del refactor — regresión
   manual + automatizada sin diferencias.
2. `getPersistenceAdapter()`/`getAuthAdapter()` devuelven Local sin
   `NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase` explícito. Con ese valor y
   configuración inválida, **lanzan** — `StoreProvider` lo muestra como
   error visible, nunca cae a Local en silencio. Verificado con un build
   estático real (`next build` + servido estático), no solo `next dev`.
3. Las migraciones SQL son idempotentes y no se ejecutan contra ningún
   proyecto real en esta entrega.
4. Ninguna policy permite un `insert`/`update` sin `auth.uid()` coincidente
   o sin `is_admin()` — revisado estáticamente (sin Docker disponible, ver
   §12; no se pudo probar contra un motor real).
5. El script de productos detecta duplicados y nunca sobrescribe/borra sin
   reportar; su modo `--apply` usa `SUPABASE_SERVICE_ROLE_KEY` (privada,
   sin `NEXT_PUBLIC_`, nunca importada por `src/`), nunca la clave
   publicable, y falla claro sin ella.
6. Ninguna contraseña demo aparece en el payload de migración de cuentas.
7. Los adaptadores Supabase (persistencia y auth) están completos y
   probados con un cliente falso, sin red — incluye registro, login,
   logout, Google simulado, identidad anónima y conversión con conflicto.
8. `.env.example` y `.env.migration.example` no contienen ningún valor
   real ni secreto real.
9. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` es la opción principal; ninguna
   clave con forma de secreta puede colarse en una variable `NEXT_PUBLIC_`.
10. `tsc`, `eslint`, `vitest` y `next build` pasan sin errores.

## 8. Lo que requiere al dueño del proyecto (fuera de esta entrega)

- Crear el proyecto Supabase y obtener `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Ejecutar `supabase/migrations/*.sql` contra ese proyecto (CLI o dashboard).
- Correr `supabase/seed/products.sql` (o `--apply`) una vez creado el
  proyecto.
- Crear el usuario admin real vía Supabase Auth y, manualmente, poner
  `role = 'admin'` en su fila de `profiles` (no hay flujo automático — es
  intencional, evita auto-elevación).
- Decidir si/cuándo migrar cuentas de clientes reales (implica pedirles que
  restablezcan contraseña).
- Configurar las variables públicas en el entorno de build de Hostinger.

## 9. Guía exacta de conexión (cuando se autorice el proyecto real)

1. **Crear el proyecto** en [supabase.com](https://supabase.com/dashboard) →
   *New project*. Anotar la región (elegir una cercana a los usuarios reales).
2. **Obtener las variables**: *Project Settings → API* → copiar *Project
   URL* y la clave *Publishable* (o *anon public* en proyectos que no
   rotaron todavía) para `.env.local`. Copiar la *service_role* **aparte**,
   en `.env.migration.local` (nunca en `.env.local`, nunca con prefijo
   `NEXT_PUBLIC_`) — ver `.env.migration.example`.
3. **Cargar las variables** en `.env.local` (no versionado) siguiendo el
   formato de `.env.example`:
   ```bash
   cp .env.example .env.local
   # editar .env.local con los valores reales del paso 2
   ```
4. **Aplicar las migraciones**, en orden, con el CLI de Supabase (o
   pegando cada archivo en el SQL editor del dashboard, en el mismo orden):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push   # aplica supabase/migrations/000{1,2,3}_*.sql en orden
   ```
5. **Cargar los 460 productos**:
   ```bash
   node --env-file=.env.local scripts/prepare-products-migration.mjs --apply
   ```
6. **Crear el primer administrador**:
   - Registrarlo como usuario normal (signup por email/password o el flujo
     que se use) para que `auth.users` + el trigger `handle_new_user` creen
     su fila en `profiles` con `role='customer'`.
   - En el SQL editor del dashboard, promoverlo a mano:
     ```sql
     update public.profiles set role = 'admin' where email = 'admin-real@tu-dominio.com';
     ```
     (el trigger `profiles_role_guard` impide que lo haga cualquier otra
     vía que no sea una sesión ya-admin o el propio dashboard con la
     service_role).
7. **Probar permisos** (con ese usuario ya admin, y con un usuario común):
   - Un usuario común no debe poder leer/escribir `audit_log` ni cambiar
     `orders.status`, ni ver pedidos de otro `customer_id`.
   - El admin debe poder listar/editar `products` (incluidos inactivos),
     cambiar `orders.status` y leer `audit_log`.
   - Confirmar que nadie puede hacer `update profiles set role='admin'`
     sobre su propia fila sin ser ya admin (el trigger lo revierte).
8. **Regenerar los tipos** (opcional pero recomendado, reemplaza el archivo
   escrito a mano):
   ```bash
   npx supabase gen types typescript --project-id <project-ref> --schema public \
     > src/services/persistence/supabase/database.types.ts
   ```
9. **Activar el proveedor** agregando a `.env.local` (o al entorno de build
   de Hostinger):
   ```bash
   NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase
   ```
   y confirmar que la app carga normalmente (si la configuración estuviera
   mal, ahora se ve una pantalla de "Error de configuración" explícita, no
   un fallback silencioso).
10. **Ejecutar la regresión completa** (catálogo, carrito, checkout, cuenta,
    panel, auditoría) contra el proyecto real antes de considerar el corte
    definitivo.

## 10. Checklist de rollback (volver a Local temporalmente)

Si algo falla con Supabase ya activado, volver atrás es instantáneo y no
requiere tocar código:

- [ ] Setear `NEXT_PUBLIC_PERSISTENCE_PROVIDER=local` en el entorno de build.
- [ ] Redesplegar (o reiniciar `next dev` en local).
- [ ] Confirmar en consola que no hay llamadas de red a Supabase (Network
      tab del navegador) y que la app sigue funcionando con `localStorage`.
- [ ] **Los datos no se sincronizan solos entre proveedores**: lo que se
      haya escrito en Supabase mientras estuvo activo no vuelve a aparecer
      en Local (y viceversa) — son dos almacenes independientes. Si el
      rollback es por más que una prueba corta, coordinar qué datos son la
      fuente de verdad antes de que alguien compre/registre algo en el
      medio.
- [ ] Una vez resuelto el problema, quitar `NEXT_PUBLIC_PERSISTENCE_PROVIDER`
      (o volver a `supabase`) para reactivar.

## 11. Pruebas incluidas en esta entrega

`npm test` (vitest) — **98/98, corre sin red ni proyecto real**:

- Guard administrativo (`store/admin-actions.test.ts`).
- Adaptador de persistencia local completo (`persistence/local-adapter.test.ts`).
- **Adaptador de persistencia Supabase, con un cliente falso** que registra
  cada llamada (`persistence/supabase-adapter.test.ts`): tabla correcta,
  payload snake_case correcto, mapeo de vuelta, errores de Postgres
  propagados en vez de tragados.
- Validación de configuración — incluye `PUBLISHABLE_KEY` como opción
  principal y rechazo de claves con forma de secreta
  (`persistence/supabase/client.test.ts`).
- Selector de proveedor de persistencia y su falla visible
  (`persistence/index.test.ts`).
- **AuthAdapter local completo** — registro, login, logout, admin, Google
  demo (`auth/local-auth-adapter.test.ts`).
- **AuthAdapter Supabase, con cliente falso** — login/registro/admin,
  identidad anónima, conversión de invitado (mismo uid, sin duplicar), el
  conflicto por email ya registrado sin fusionar, y `restoreSession()`
  (sesión viva con rol customer/admin, sin sesión, y error del cliente)
  (`auth/supabase-auth-adapter.test.ts`).
- Selector de proveedor de auth y su falla visible (`auth/index.test.ts`).
- Transforms de migración — nunca contraseñas, marca de pedidos de invitado
  pendientes (`persistence/migration.test.ts`).
- Aislamiento por usuario (`lib/orders.test.ts`).

## 12. Estado real de verificación (mock vs. Supabase local vs. remoto)

Para que quede explícito qué se probó contra qué, sin mezclar niveles de
confianza:

### Probado con mocks (sin red, sin Docker) — 98/98 tests, ver §11
Adaptadores de persistencia y auth (local + Supabase), selector de
proveedor, validación de configuración, transforms de migración,
aislamiento por usuario. Esto verifica la **lógica** de cada pieza de forma
aislada, no el comportamiento real de Postgres/RLS/Auth.

### Bloqueado — RLS y flujo real contra Supabase local (puntos 6, 7, 8 del pedido)
Se verificó explícitamente que este entorno **no tiene Docker disponible**
(`docker`, `colima`, `podman`, `lima`, `psql`, `postgres`: ninguno presente
— comprobado con `which`/`docker ps` antes de intentar nada). `supabase
start` (CLI de Supabase) requiere Docker para levantar Postgres + Auth +
PostgREST localmente. Sin eso, **no se pudo**:

**Reverificado al cerrar Etapa 5**: mismo resultado. `which docker`,
`colima`, `podman`, `psql` siguen sin encontrar nada; no hay `Docker.app`,
`OrbStack.app` ni Colima instalados vía Homebrew (`brew list` no los lista).
`npx supabase start` (CLI 2.111.0, instalado on-demand vía `npx`, sin red
adicional más que la descarga del propio paquete npm) devuelve
explícitamente: `{"_tag":"Error","error":{"code":"LegacyDockerLifecycleInspectError","message":"failed to inspect container health: docker: command not found (podman also not found) — install Docker Desktop or Podman and ensure it is on PATH"}}`.
No se instaló Docker/Colima sin autorización — es un cambio de entorno que
requiere confirmación del dueño del proyecto. Se mantiene, sin excepción,
que ningún punto de esta subsección quedó verificado contra Postgres/Auth
real en esta entrega.
- Aplicar las migraciones contra una base real.
- Probar RLS efectivamente como público / anónimo / cliente A / cliente B /
  admin.
- Confirmar que un cliente no puede leer datos ajenos, tocar
  `profiles.role`, escribir `products` o alterar `audit_log`.
- Correr el script de importación dos veces contra una base real y
  demostrar idempotencia con datos reales (460 productos, cero duplicados).
- Probar el flujo completo (catálogo compartido entre sesiones, carrito,
  checkout invitado, conversión, aislamiento, una acción admin vista desde
  otra sesión) contra un motor real.

Lo que sí se hizo en su lugar, y que **no reemplaza** lo anterior:
- Revisión estática línea por línea de `0003_rls_policies.sql` contra la
  matriz de acceso requerida (público/anon/customer/admin) — ver tabla en
  §3. Es una revisión de lectura, no una ejecución.
- El script `prepare-products-migration.mjs` sí se corrió dos veces
  **localmente contra los archivos JSON/SQL generados** (no contra una
  base): confirma que el *generador* es idempotente y determinístico
  (mismos 460 productos, 0 duplicados, mismo SQL), pero no que el `insert
  ... on conflict` se comporte como se espera dentro de Postgres real.

### Encontrado y corregido durante esta verificación (no hubiera aparecido sin probar en serio)
Al intentar demostrar el punto 4 (falla visible) en un build estático real,
se detectó que `process.env` usado como valor por defecto de un parámetro
rompía el reemplazo estático de Next.js en el bundle de cliente — el
selector de proveedor "funcionaba" en el servidor pero siempre resolvía a
Local en el navegador, sin ningún aviso. Corregido accediendo a cada
variable como literal (`services/provider.ts`, `supabase/client.ts`) y
re-verificado con `next build` + servido estático (no alcanza con
`next dev`, que no expuso el problema de la misma forma). Este hallazgo es
la razón concreta por la que este documento distingue "probado con mocks"
de "probado end-to-end": los mocks de vitest no habrían detectado este bug,
porque corren en Node puro, no en un bundle de navegador real.

### Encontrado y corregido al cerrar Etapa 5 (segunda ronda de verificación)
Dos hallazgos adicionales, ninguno detectado por los mocks porque ambos son
específicos del comportamiento real del SDK/Postgres, no de la lógica pura
que los mocks ejercitan:

1. **`convertGuestToAccount` hubiera fallado contra Postgres real** —
   `guestIdFromEmail()` genera un string no-uuid, pero `orders.customer_id`
   es `uuid`. Se encontró por inspección cruzada del tipo de columna en
   `0001_schema.sql` contra el valor real que `store.tsx` le pasaba a
   `reassignOrdersCustomer`, no por un test que fallara (los mocks del
   adaptador de persistencia no tipan sus parámetros como Postgres lo
   haría). Corregido: ver §6.
2. **No existía recuperación de sesión real** — `store.tsx` nunca llamaba a
   ningún método del `AuthAdapter` al arrancar; solo leía su propia caché de
   `localStorage`. Con Supabase, esa caché queda desactualizada frente al
   `access_token` que el SDK ya refrescó solo, y además el modelo de sesión
   dual (cliente + admin) del adaptador local no es compatible con la sesión
   única del SDK — ver §4.2. Corregido agregando
   `SessionRestorableAuthAdapter.restoreSession()` y su uso en `store.tsx`.

Ninguno de los dos se pudo re-verificar contra Postgres/Auth real (mismo
bloqueo de Docker de siempre, ver arriba); ambos quedan cubiertos por
revisión de tipos/lógica y, en el caso de `restoreSession`, por tests con
cliente falso (`auth/supabase-auth-adapter.test.ts`).

### Requiere autorización remota (fuera de esta entrega, ver §8 y §9)
Crear el proyecto Supabase, cargar variables reales, aplicar migraciones
contra el proyecto real, crear el primer admin, y repetir ahí la batería
completa de pruebas de este apartado que no se pudo correr localmente.

## 13. Checklist de activación gradual (de Local a producción con Supabase)

Orden recomendado, cada paso depende del anterior. No saltear pasos aunque
"parezca" que va a andar — cada uno existe porque algo específico puede
salir mal si se omite.

- [ ] **0. Backup local.** Antes de tocar nada: exportar/copiar los datos
      que ya existan en `localStorage` de dispositivos con uso real del
      modelo Local (productos editados manualmente, pedidos, clientes) —
      no hay sincronización automática entre Local y Supabase (§10), así
      que lo que no se copie a mano no viaja solo.
- [ ] **1. Crear el proyecto Supabase remoto** (§9, paso 1). Elegir región
      cercana a los usuarios reales.
- [ ] **2. Cargar variables** en `.env.local` (públicas) y
      `.env.migration.local` (`service_role`, aparte, nunca junto a las
      públicas) — §9 pasos 2-3.
- [ ] **3. Aplicar migraciones** (`0001_schema.sql`, `0002_profiles_trigger.sql`,
      `0003_rls_policies.sql`, en ese orden) — §9 paso 4.
- [ ] **4. Cargar el seed de 460 productos** con
      `scripts/prepare-products-migration.mjs --apply` — §9 paso 5. Repetir
      una segunda vez y confirmar 460 filas finales, cero duplicados, mismo
      SQL generado (ya verificado localmente que el generador es
      determinístico — falta la confirmación contra Postgres real).
- [ ] **5. Crear el primer admin real** y promoverlo a mano
      (`update profiles set role='admin' ...`) — §9 paso 6. Nunca vía un
      flujo automático.
- [ ] **6. Pruebas RLS con los cinco actores** — público sin sesión, anónimo,
      cliente A, cliente B, admin (§9 paso 7, §7 punto 4, §12). Esta es la
      validación que quedó bloqueada en esta entrega por falta de Docker;
      es la primera vez que corre contra un motor real.
- [ ] **7. Staging**: activar `NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase` en
      un entorno de build que NO sea la producción pública (build de
      Hostinger separado o local con `next build` + servido estático, per
      §7 punto 2) y correr la regresión completa (catálogo, carrito,
      checkout invitado, conversión de cuenta, cuenta, panel, auditoría).
- [ ] **8. Comparación Local vs. Supabase**: con ambos proveedores
      disponibles en paralelo (dos builds o dos entornos), confirmar que el
      comportamiento visible es idéntico para el usuario final — ningún
      flujo se comporta distinto según el proveedor, salvo la limitación ya
      documentada de sesión única cliente/admin bajo Supabase (§4.2).
- [ ] **9. Ensayar el rollback** (§10) en staging antes de ir a producción:
      volver a `local`, confirmar que no quedan llamadas de red a Supabase,
      y volver a `supabase` — para saber que el camino de vuelta funciona
      *antes* de necesitarlo de verdad.
- [ ] **10. Recién después, producción**: variables en el entorno de build
      real de Hostinger, redeploy, y repetir una regresión final contra el
      dominio público.

Ningún paso de este checklist se ejecutó en esta entrega — todos requieren
el proyecto Supabase remoto y/o Docker local, ninguno de los dos autorizado
ni disponible acá (ver §8 y §12).
