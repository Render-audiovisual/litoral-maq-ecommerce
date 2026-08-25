# Auditoría técnica y plan de continuidad — Litoral Maq E-commerce

- **Fecha:** 2026-08-25
- **Commit auditado:** `50e75b5` (`origin/main`, HEAD al momento de la auditoría)
- **Alcance:** repositorio completo, base Supabase (solo lecturas), CI/CD, despliegue productivo.
- **Restricción respetada:** no se hicieron cambios funcionales, no se ejecutaron migraciones, no se borraron datos, no se publicó nada, no se transcriben valores de secretos.

> **Corrección mínima realizada para poder auditar:** el árbol local estaba 9 commits atrás de `origin/main`. Se hizo `git merge --ff-only origin/main` (fast-forward puro, sin merge commit, sin push). Sin este paso se habría auditado código que no es el desplegado.

> ### Estado de remediación
>
> Este informe se publica junto con la corrección del bloque **P0 y parte del P1**. Lo ya resuelto queda marcado como **[RESUELTO]** en el backlog (§11); el resto del documento describe el estado tal como se encontró, que es lo que da contexto a las decisiones.
>
> **Resuelto:** login falso de Google eliminado; suite E2E con guard que impide escribir en producción; Playwright incorporado al CI; `admin-orders.spec.ts` corregido.
>
> **Verificado en la auditoría posterior:** la cuenta compartida **nunca llegó a crearse** en la base productiva — no hubo exposición de datos de clientes.

---

## 1. Resumen ejecutivo

El sistema **funciona de verdad y está en producción**: catálogo real de 495 productos, pedidos que persisten en Supabase con aislamiento por fila verificado, panel administrativo operativo y despliegue automático verde. La calidad de base es alta: 146 tests unitarios pasan, typecheck y lint limpios, y el código muestra decisiones deliberadas y bien documentadas (por ejemplo, negarse a publicar stock no verificado).

Sin embargo hay **un agujero de privacidad activo en producción** que debe cerrarse antes que cualquier otra cosa: el repositorio es **público** y contiene la contraseña de una cuenta compartida a la que se entra desde un botón visible en el login. Cualquiera que la use entra a la misma cuenta y ve los pedidos que otros dejaron ahí.

El segundo problema estructural es que **la suite E2E valida el modo demo local, no el camino de producción**, y el CI ni siquiera la ejecuta. Eso significa que el verde del pipeline no es evidencia de que el flujo real funcione.

**Veredicto: MVP operable con limitaciones.**

---

## 2. Estado general del sistema

| Dimensión | Estado | Evidencia |
|---|---|---|
| Compila | ✅ | `next build` → 517 páginas, exit 0 |
| Typecheck | ✅ | `npx tsc --noEmit` → exit 0, sin salida |
| Lint | ✅ | `npm run lint` → sin warnings |
| Tests unitarios | ✅ | `vitest run` → **146/146**, 19 archivos |
| Tests E2E | ⚠️ | **8/9** — 1 falla por test frágil, no por la app |
| CI/CD | ✅ verde / ⚠️ incompleto | Últimos 8 runs `success`; no corre E2E |
| Desplegado y online | ✅ | tienda y admin → HTTP 200 |
| Base de datos | ✅ aplicada | Migraciones activas, RLS aislando |
| Seguridad | ❌ | Repo público + credencial compartida commiteada |

---

## 3. Arquitectura y módulos

### Qué problema resuelve
Tienda online de maquinaria y herramientas (Litoral Maq, Corrientes). El modelo comercial **no es venta con cobro online**: el cliente arma un carrito y envía una **solicitud de compra**; el negocio confirma stock, precio final y entrega por WhatsApp. Ese cambio de modelo lo introdujo el commit `abeb2df`.

### Tecnologías
- **Next.js 16.3.0** con App Router y Turbopack, React 19.2.4, TypeScript.
- **`output: "export"`** → sitio **100% estático**. Ver [next.config.ts](next.config.ts).
- **Supabase** (`@supabase/supabase-js` 2.111) — Auth + Postgres + RLS.
- **Vitest** (unitarios) y **Playwright** (E2E, solo chromium).
- **Hostinger** vía rsync por SSH desde GitHub Actions.

### Hallazgo arquitectónico central: no existe backend propio

```
find src -name "route.ts" -o -name "middleware.ts"   → vacío
grep -rn "use server" src/                            → ninguno
```

No hay API routes, ni middleware, ni server actions. **Toda la seguridad del sistema descansa exclusivamente en las políticas RLS de Supabase.** Consecuencias directas:

- El panel admin es HTML estático servido públicamente; su protección es solo del lado del cliente.
- No hay forma de implementar rate limiting, validación de servidor ni secretos de servidor sin cambiar la arquitectura.
- Cualquier validación en el navegador es sugerencia, no control.

Esto no es necesariamente incorrecto para este negocio, pero define el techo de seguridad del sistema y debe ser una decisión consciente del dueño.

### Módulos

| Módulo | Ruta | Público / Admin |
|---|---|---|
| Home comercial | [src/app/page.tsx](src/app/page.tsx) | Público |
| Catálogo + filtros | [src/app/productos/](src/app/productos/) | Público |
| Detalle de producto | [productos/[slug]/](src/app/productos/[slug]/) | Público (495 SSG) |
| Carrito | [src/app/carrito/](src/app/carrito/) | Público |
| Checkout (solicitud) | [src/app/checkout/page.tsx](src/app/checkout/page.tsx) | Público |
| Cuentas y sesión | `login`, `registro`, `recuperar-clave`, `restablecer-clave`, `confirmar-cuenta` | Público |
| Mis pedidos | [src/app/cuenta/pedidos/](src/app/cuenta/pedidos/) | Cliente autenticado |
| Panel admin | [src/app/admin/](src/app/admin/) | Admin |
| Capa de servicios | [src/services/](src/services/) | Interno |
| Estado global | [src/store/store.tsx](src/store/store.tsx) | Interno |

### Cómo se conectan
[provider.ts](src/services/provider.ts) es la única fuente de verdad del proveedor activo (`local` o `supabase`), compartida por persistencia y auth para que no puedan desincronizarse. Está bien diseñado: con `PROVIDER=supabase` y config inválida **falla de forma visible en vez de caer a local en silencio** — hay 8 tests que lo cubren en [index.test.ts](src/services/persistence/index.test.ts).

---

## 4. Qué está realmente terminado

Verificado con ejecución, no con documentación:

- ✅ **Catálogo real**: 495 productos con slug propio prerenderizados; `products` legible por anónimos (HTTP 200, 3 filas de muestra).
- ✅ **Aislamiento RLS entre clientes**: probado contra la base real con la key pública.
- ✅ **Identidad de invitado**: `signInAnonymously` está **habilitado** en el proyecto (`/auth/v1/settings` → `anonymous_users: true`), por lo que un invitado puede crear pedidos bajo RLS sin inventar un id.
- ✅ **Snapshot histórico de pedidos**: [order-details.ts](src/lib/order-details.ts) congela nombre, código y precio al confirmar; un pedido viejo no se corrompe si cambia el catálogo. 4 tests.
- ✅ **Disponibilidad honesta**: [product-availability.ts](src/lib/product-availability.ts) muestra "Consultar disponibilidad" en vez de inventar stock. Decisión de negocio correcta y testeada.
- ✅ **Merge de carrito**: [cart.ts](src/lib/cart.ts) fusiona local + remoto sin duplicar cantidades.
- ✅ **Prevención de auto-escalada de rol**: trigger `prevent_role_self_escalation` en [0002](supabase/migrations/0002_profiles_trigger.sql).
- ✅ **Rechazo de claves secretas en variables públicas**: [client.ts](src/services/persistence/supabase/client.ts) rechaza una `service_role` pegada por error. 11 tests.

---

## 5. Inventario funcional por módulo

### 5.1 Autenticación y cuentas

| Elemento | Clasificación |
|---|---|
| Registro con email | **FUNCIONAL CON LIMITACIONES** |
| Login / logout | **FUNCIONAL Y VERIFICADO** (en local) / **NO VERIFICABLE** (en Supabase) |
| Recuperar y restablecer clave | **NO VERIFICABLE** |
| Confirmar cuenta | **NO VERIFICABLE** |
| "Continuar con Google" | **ROTO — riesgo de privacidad** |
| Sesión de invitado | **FUNCIONAL Y VERIFICADO** |

**"Continuar con Google" — ROTO (P0)**
- **Qué hace:** [login/page.tsx:58](src/app/login/page.tsx#L58) muestra el botón. Ninguno de los dos adaptadores usa OAuth. [supabase-auth-adapter.ts:171-183](src/services/auth/supabase-auth-adapter.ts#L171) crea o reutiliza **una cuenta compartida fija** con email y password constantes definidos en las líneas 20-21 del mismo archivo.
- **Prueba:** lectura del código + `/auth/v1/settings` confirma que **Google OAuth no está habilitado** en el proyecto (providers activos: solo `anonymous_users` y `email`).
- **Impacto:** todo cliente que use ese botón entra a **la misma cuenta**. Ve, y deja, los pedidos de los demás. Combinado con el repo público (§10), cualquier persona de internet puede entrar a esa cuenta.
- **Falta:** eliminar el botón, o implementar OAuth real y habilitarlo en Supabase.

**Registro — FUNCIONAL CON LIMITACIONES**
- `/auth/v1/settings` devuelve **`mailer_autoconfirm: false`** → el registro real exige confirmar el email. El código lo contempla ([registro/page.tsx:41-44](src/app/registro/page.tsx#L41)), pero **depende de que salgan los emails**. Si el proyecto usa el SMTP por defecto de Supabase (límite muy bajo, no apto para producción), el registro se cae en cuanto haya volumen.
- **No verificable sin acceso al dashboard:** si hay SMTP propio configurado.

### 5.2 Catálogo y producto

| Elemento | Clasificación |
|---|---|
| Listado, filtros, paginado | **FUNCIONAL Y VERIFICADO** |
| Detalle de producto | **FUNCIONAL Y VERIFICADO** |
| Disponibilidad / stock | **FUNCIONAL Y VERIFICADO** |
| Sincronización Google Sheet | **FUNCIONAL CON LIMITACIONES** |

El catálogo de producción se **reimporta desde Google Sheets en cada deploy** (`npm run import:sheet` en el workflow). Si el Sheet cambia de forma o falla, el deploy publica un catálogo distinto o rompe. Es una dependencia externa en tiempo de build sin snapshot de respaldo.

### 5.3 Carrito y checkout

| Elemento | Clasificación |
|---|---|
| Carrito (agregar/quitar/persistir) | **FUNCIONAL Y VERIFICADO** |
| Persistencia de carrito para anónimos | **FUNCIONAL CON LIMITACIONES** |
| Checkout como solicitud | **FUNCIONAL Y VERIFICADO** (local) |
| Cobro online | **NO EXISTE — por diseño** |
| Cotización de envío | **INCOMPLETO — por diseño** |

- El carrito de un anónimo **no persiste en la base**: `carts` no tiene GRANT para `anon` (verificado: HTTP 401 `42501`). Está **documentado como intencional** en [0006_grants.sql](supabase/migrations/0006_grants.sql) y el adaptador nunca consulta sin `ownerId`. No es un bug, pero significa que el carrito de un visitante vive solo en su navegador hasta que se identifica.
- `PaymentAdapter` y `ShippingAdapter` están **declarados en [adapters.ts](src/services/adapters.ts) sin ninguna implementación**. Wilson borró los mocks a propósito (`abeb2df`) para que una simulación no se presente como operación comercial válida — decisión correcta. Hoy son interfaces muertas.

### 5.4 Panel administrativo

| Elemento | Clasificación |
|---|---|
| Login admin | **FUNCIONAL Y VERIFICADO** (local) / **NO VERIFICABLE** (Supabase) |
| Gestión de pedidos y estados | **FUNCIONAL Y VERIFICADO** (local) |
| CRUD de productos | **FUNCIONAL Y VERIFICADO** (local) |
| Protección de rutas | **FUNCIONAL CON LIMITACIONES** |
| Subida de imágenes | **EN DEMO / SIMULADO** |
| Audit log | **NO VERIFICABLE** |

- **Protección de rutas:** `https://admin-litoralmaqrender.rendercorrientes.com/admin/productos/` responde **HTTP 200 sin sesión**. Es inherente a un sitio estático: el HTML es público y [admin-shell.tsx](src/components/admin-shell.tsx) redirige recién en el cliente. **Los datos sí están protegidos por RLS** (verificado), así que no hay fuga de información — pero toda la superficie y la lógica del panel son públicas.
- **Imágenes: SIMULADO.** [mock.ts](src/services/mock.ts) usa `URL.createObjectURL(file)` y devuelve `simulated: true`. La imagen **desaparece al recargar**: no se sube a ningún lado. Es el único mock que queda vivo.

---

## 6. Resultados de pruebas

| Comando | Resultado | Detalle |
|---|---|---|
| `npx tsc --noEmit` | ✅ exit 0 | Sin errores |
| `npm run lint` | ✅ | Sin warnings |
| `npx vitest run` | ✅ **146/146** | 19 archivos, 6.22s |
| `npx next build` | ✅ | 517 páginas, 4.5s compile |
| `npx playwright test` | ⚠️ **8/9** | 1 fallo (ver abajo) |
| `npm run validate:priority6` | ⛔ **NO EJECUTADO** | Requiere credenciales de admin |
| Lectura anónima a Supabase | ✅ ejecutado | Ver §10 |
| `/auth/v1/settings` | ✅ ejecutado | Ver §5.1 |

### El fallo E2E

```
admin-orders.spec.ts:17
strict mode violation: getByText('Recibimos tu pedido') resolved to 2 elements:
  1) <h1>Recibimos tu pedido</h1>
  2) <div id="__next-route-announcer__">Recibimos tu pedido</div>
```

**Es un test frágil, no una feature rota.** El anunciador de rutas de Next duplica el texto; el selector debe ser `getByRole('heading', ...)`. La app funciona. Lo relevante es *por qué nadie lo notó*: **el CI no ejecuta Playwright**.

### Los E2E validan el modo demo, no producción

Evidencia concreta:
- Todos los specs de admin usan `admin@litoralmaq.com` / `admin123`, credenciales que **solo existen en [local-auth-adapter.ts:15-16](src/services/auth/local-auth-adapter.ts#L15)**. Con `provider=supabase` no existen.
- [account-session.spec.ts](tests/e2e/account-session.spec.ts) registra y espera navegar de inmediato a `/cuenta/pedidos`. Con el proyecto real (`mailer_autoconfirm: false`) **eso no puede pasar**: hay que confirmar el email primero.

**Conclusión:** el verde de la suite E2E no es evidencia del camino de producción. Fue necesario correrla con `PROVIDER=local` justamente para no escribir cuentas y pedidos de prueba en la base real.

### Matriz mínima de pruebas manuales pendientes

Ninguna fue ejecutada contra Supabase; todas requieren credenciales o entorno de staging.

| # | Caso | Estado |
|---|---|---|
| 1 | Registro real → llega el email → confirmar → login | ⛔ Pendiente |
| 2 | Recuperar clave real end-to-end | ⛔ Pendiente |
| 3 | Cliente A no ve pedidos de cliente B (en la app, no solo RLS) | ⛔ Pendiente |
| 4 | Cliente no accede a `/admin` ni muta productos | ⛔ Pendiente |
| 5 | Alta/edición/baja de producto persiste tras recarga | ⛔ Pendiente |
| 6 | Checkout como invitado real en producción | ⛔ Pendiente |
| 7 | Doble clic en "Enviar solicitud" no duplica el pedido | ⛔ Pendiente |
| 8 | Dos pestañas simultáneas con el mismo carrito | ⛔ Pendiente |
| 9 | Estados vacíos (carrito vacío, sin pedidos, búsqueda sin resultados) | ⛔ Pendiente |
| 10 | Datos inválidos (email malformado, CP no numérico, cantidad 0) | ⛔ Pendiente |
| 11 | Subida de imagen en el panel → sobrevive a recarga | ❌ Se sabe que falla |
| 12 | Navegación mobile real en dispositivo | ⛔ Pendiente |
| 13 | Caída de Supabase: ¿mensaje claro o pantalla rota? | ⛔ Pendiente |
| 14 | Sesión expirada durante el checkout | ⛔ Pendiente |

---

## 7. Fallas encontradas

1. **Cuenta compartida accesible públicamente** (P0) — §5.1.
2. **Repositorio público con credencial y rutas de infraestructura** (P0) — §10.
3. **E2E rotos y no ejecutados por el CI** (P1) — §6.
4. **E2E no cubren el camino de producción** (P1) — §6.
5. **Subida de imágenes no persiste** (P2) — §5.4.
6. **Dominios contradictorios** (P2): `.env.local` apunta a `www.litoralmaq.com`, que **no resuelve** (HTTP 000); el CI publica en `rendercorrientes.com`.
7. **Comentarios de migración desactualizados** (P3): las migraciones dicen `-- No ejecutar contra un proyecto real todavía` pero **están aplicadas** (verificado). Contradicción documentación↔realidad; prevalece la realidad.

---

## 8. Funciones demo o simuladas

| Función | Dónde | Nota |
|---|---|---|
| Login con Google | [login/page.tsx:58](src/app/login/page.tsx#L58) | Etiquetado "DEMO" en la UI, pero **operativo y peligroso** |
| Subida de imágenes | [mock.ts](src/services/mock.ts) | `simulated: true`, no persiste |
| Admin local `admin123` | [local-auth-adapter.ts](src/services/auth/local-auth-adapter.ts) | Solo modo local; README ya lo aclara |
| Estado `pago_simulado` | [0001_schema.sql](supabase/migrations/0001_schema.sql) | Residuo histórico en el `check` de `status` |

---

## 9. Funciones incompletas

- **Cobro online** — `PaymentAdapter` sin implementación. Decisión de negocio pendiente.
- **Cotización de envío** — `ShippingAdapter` sin implementación; el checkout dice "A cotizar".
- **Storage de imágenes** — `ImageStorageAdapter` solo con el mock.
- **`validate:priority6`** — escrito y nunca ejecutado en CI; requiere credenciales.
- **Observabilidad** — no hay logging, ni monitoreo de errores, ni alertas. Un fallo en producción es invisible hasta que un cliente lo reporte.
- **Backups** — no verificable; depende del plan de Supabase.

---

## 10. Riesgos técnicos y de seguridad

### Verificación real ejecutada contra la base

Consulta anónima con la clave pública (solo `SELECT`, sin escrituras):

| Tabla | HTTP | Filas visibles | Lectura |
|---|---|---|---|
| `products` | 200 | 3 | ✅ Correcto (catálogo público) |
| `orders` | 200 | **0** | ✅ RLS aísla |
| `profiles` | 200 | **0** | ✅ RLS aísla |
| `audit_log` | 200 | **0** | ✅ RLS aísla |
| `carts` | **401** | — | ✅ Sin GRANT, intencional |

**El aislamiento RLS funciona.** Este es el resultado más importante de la auditoría en el lado positivo.

### Riesgo P0: repositorio público + cuenta compartida

- `https://api.github.com/repos/Render-audiovisual/litoral-maq-ecommerce` → `"private": false`, `"visibility": "public"`.
- El repo contiene la **contraseña en texto plano** de la cuenta compartida de "Google" ([supabase-auth-adapter.ts:20-21](src/services/auth/supabase-auth-adapter.ts#L20)).
- La cuenta existe en el proyecto Supabase real y el signup por email está habilitado.
- **Cualquier persona puede iniciar sesión en la tienda de producción con esa credencial** y ver lo que haya en esa cuenta.

También quedan expuestos en el repo público:
- La ruta absoluta del servidor Hostinger (`/home/u471562620/domains/...`) en el workflow.
- La URL del proyecto Supabase y la publishable key, hardcodeadas en el YAML. **Esto no es una fuga de secreto:** la publishable/anon key está diseñada para viajar al navegador y ser pública, igual que la URL del proyecto. Moverlas a variables es prolijidad y separación de ambientes, no contención de seguridad. **La protección real es y debe seguir siendo RLS con políticas correctas** — verificadas en este mismo informe.

### Riesgo P1: el test de RLS no prueba RLS

[rls-policies.test.ts](src/services/persistence/rls-policies.test.ts) hace `readFileSync` del `.sql` y verifica que el **texto** contenga ciertas cadenas. Es útil como candado contra borrados accidentales de la policy, pero **no comprueba comportamiento**. Si alguien cambia la policy en el dashboard de Supabase, el test sigue verde. La verificación real de §10 la hice manualmente y **no está automatizada**.

### Riesgo P1: despliegue sin red de contención

`on: push: branches: [main]` → **todo push a `main` publica en producción**, con `rsync --delete` sobre `public_html`. No hay staging, ni aprobación manual, ni rollback automático, ni healthcheck posterior. El `--delete` borra en destino lo que no esté en el artefacto.

### Otros

- Sin rate limiting posible (no hay backend). Un script puede crear cuentas anónimas y pedidos sin límite.
- Sin validación de servidor: toda validación de [checkout/page.tsx:41-51](src/app/checkout/page.tsx#L41) es del navegador. Los `CHECK` de Postgres son la única barrera real.
- Integridad: `orders.lines` es `jsonb` sin FK a `products`. Es deliberado (permite el snapshot histórico) pero implica que nada garantiza que un `productId` exista.
- Rollback de migraciones: las 6 migraciones son forward-only, sin scripts de reversa.

---

## 11. Backlog priorizado

### P0 — Crítico

| # | Hallazgo | Estado |
|---|---|---|
| 1 | Quitar el botón "Continuar con Google" y la credencial compartida del código | **[RESUELTO]** |
| 2 | Auditar qué datos quedaron en la cuenta compartida | **[RESUELTO]** — nunca se creó; sin datos vinculados |
| 3 | Decidir si el repo pasa a privado; la credencial sigue en el historial | Pendiente — decisión del dueño |

La contención efectiva fue #1: elimina el vector aunque el repo siga público. #3 queda abierto porque purgar el historial reescribe SHAs y es una decisión aparte.

### P1 — Bloquea producción

| # | Hallazgo | Estado / depende de |
|---|---|---|
| 4 | Confirmar SMTP propio; sin él, el registro real no escala | Pendiente — dashboard |
| 5 | Arreglar `admin-orders.spec.ts` y agregar E2E al CI | **[RESUELTO]** |
| 5b | Impedir que los E2E escriban en la base productiva | **[RESUELTO]** — guard en `playwright.config.ts` |
| 6 | Crear un proyecto Supabase de staging y correr los E2E ahí | Pendiente — decisión + costo |
| 7 | Ejecutar `validate:priority6` contra staging, nunca producción | Pendiente — depende de #6 |
| 8 | Aprobación manual (`environment: production`) antes del deploy | Pendiente |
| 9 | Mover URL y key de Supabase del YAML a variables por ambiente | Pendiente — prolijidad, no seguridad (ver §10) |

P1#6 desbloquea #5 y #7: sin staging, probar el camino real significa escribir en producción.

### P2 — Importante, operable con workaround

| # | Hallazgo |
|---|---|
| 10 | Storage real de imágenes (Supabase Storage) o quitar el botón |
| 11 | Resolver la contradicción de dominios |
| 12 | Verificación automatizada de RLS contra una base real |
| 13 | Snapshot de respaldo del catálogo si el Google Sheet falla |
| 14 | Monitoreo de errores y alertas |

### P3 — Deuda técnica

| # | Hallazgo |
|---|---|
| 15 | Borrar `PaymentAdapter`/`ShippingAdapter` sin implementación |
| 16 | Actualizar comentarios `-- No ejecutar contra un proyecto real todavía` |
| 17 | Quitar `pago_simulado` del `check` de `status` (requiere migración) |
| 18 | Proyecto mobile real en Playwright |
| 19 | `loading="eager"` en la imagen LCP de la home |
| 20 | Documentar rollback de migraciones |

---

## 12. Roadmap por etapas

### Etapa 1 — Contención de seguridad · **XS** · sin dependencias

- **Objetivo:** cerrar el acceso público a datos de clientes.
- **Tareas:** quitar el botón de Google de [login/page.tsx](src/app/login/page.tsx); eliminar `signInCustomerWithGoogle` y sus constantes de ambos adaptadores; borrar/rotar la cuenta en Supabase; revisar qué pedidos quedaron en ella.
- **Criterio de aceptación:** el botón no existe; la credencial del repo ya no autentica contra el proyecto.
- **Pruebas:** `tsc`, `lint`, `vitest`, `playwright`; intento manual de login con la credencial vieja → debe fallar.
- **Riesgo:** bajo. Requiere acceso al dashboard de Supabase.

### Etapa 2 — Higiene del repositorio · **S** · después de Etapa 1

- **Tareas:** decidir público/privado; mover URL y key a secrets del workflow; agregar aprobación manual al deploy.
- **Criterio:** ningún valor de configuración de Supabase en el YAML; el deploy espera aprobación.
- **Requiere decisión del dueño.** Nota: purgar el historial de Git reescribe SHAs; evaluarlo aparte.

### Etapa 3 — Entorno de staging · **M** · desbloquea 4, 5 y 6

- **Objetivo:** poder probar el camino real sin tocar producción.
- **Tareas:** segundo proyecto Supabase con las 6 migraciones; `.env.staging`; `PLAYWRIGHT_BASE_URL` apuntando ahí.
- **Criterio:** los E2E corren contra Supabase sin escribir en producción.
- **Riesgo:** ejecutar las migraciones en un proyecto nuevo — no destructivo.
- **Requiere decisión (costo) y credenciales.**

### Etapa 4 — E2E que prueben lo real · **M** · depende de Etapa 3

- **Tareas:** arreglar el selector de `admin-orders.spec.ts`; parametrizar credenciales por entorno; agregar los E2E al workflow como gate; test funcional real de aislamiento entre dos clientes.
- **Criterio:** el CI falla si un cliente puede ver el pedido de otro.

### Etapa 5 — Completar integraciones · **M** · depende de 3

- **Tareas:** confirmar/configurar SMTP propio; Supabase Storage para imágenes; snapshot de respaldo del catálogo.
- **Criterio:** registro real con email confirmado en staging; imagen subida sobrevive a recarga.

### Etapa 6 — Casos límite y errores · **M**

- **Tareas:** ejecutar la matriz de §6; bloquear doble envío del checkout; mensajes claros ante caída de Supabase; estados vacíos.
- **Criterio:** ningún caso de la matriz deja la app en estado roto o silencioso.

### Etapa 7 — Operación · **S**

- **Tareas:** monitoreo de errores; healthcheck post-deploy; verificar backups de Supabase; documentar rollback.
- **Criterio:** un fallo en producción genera una alerta sin que lo reporte un cliente.

### Etapa 8 — UX, rendimiento y deuda · **S**

- Ítems P3 del backlog.

---

## 13. Decisiones o accesos necesarios

**Decisiones del dueño:**
1. ¿El repositorio queda público o pasa a privado?
2. ¿Se implementa Google OAuth real o se elimina definitivamente?
3. ¿Se paga un proyecto Supabase de staging?
4. ¿El dominio final es `litoralmaq.com` o se sigue en `rendercorrientes.com`?
5. ¿El modelo sigue siendo "solicitud sin cobro", o se integrará pago online?

**Accesos que me faltan para completar la verificación:**
- Dashboard de Supabase (confirmar SMTP, backups, usuarios existentes, policies vigentes vs. las del repo).
- `PRIORITY6_ADMIN_EMAIL` / `PRIORITY6_ADMIN_PASSWORD`.
- Panel de Hostinger (headers, HTTPS, expiración de dominio).
- Acceso al Google Sheet del catálogo.

---

## 14. Checklist para declarar el sistema listo para producción

- [ ] Ninguna credencial funcional en el repositorio
- [ ] Sin cuentas compartidas entre clientes
- [ ] Verificado en app real: cliente A no ve datos de cliente B
- [ ] Verificado: un cliente no puede operar el panel admin
- [ ] E2E corriendo contra Supabase en el CI, como gate de deploy
- [ ] Verificación automatizada de RLS contra una base real
- [ ] SMTP propio confirmado y probado
- [ ] Registro, confirmación y recuperación probados end-to-end
- [ ] Imágenes del panel persisten
- [ ] Doble envío del checkout no duplica pedidos
- [ ] Deploy con aprobación manual y rollback documentado
- [ ] Backups verificados con una restauración de prueba
- [ ] Monitoreo de errores activo
- [ ] Matriz de pruebas manuales de §6 completa
- [ ] Dominio definitivo con HTTPS
- [ ] Sin funciones etiquetadas "DEMO" visibles al cliente

---

## Próximas 10 acciones exactas

1. Quitar el botón "Continuar con Google" de [login/page.tsx:58](src/app/login/page.tsx#L58).
2. Eliminar `signInCustomerWithGoogle` y las constantes de credencial de ambos adaptadores.
3. En Supabase, revisar qué pedidos y datos quedaron en la cuenta `cliente.demo@gmail.com`.
4. Borrar o rotar esa cuenta en el proyecto real.
5. Decidir si el repositorio pasa a privado.
6. Mover `NEXT_PUBLIC_SUPABASE_URL` y la publishable key del YAML a secrets del repositorio.
7. Confirmar en el dashboard si hay SMTP propio configurado.
8. Arreglar el selector de [admin-orders.spec.ts:17](tests/e2e/admin-orders.spec.ts#L17) usando `getByRole('heading', ...)`.
9. Agregar `npx playwright test` al workflow como paso obligatorio.
10. Agregar aprobación manual al job de deploy antes del rsync.

Las acciones 1-4 son contención de seguridad y no dependen de ninguna decisión. Las 5-7 requieren decisión o acceso del dueño. Las 8-10 son la red de contención que evita que vuelva a pasar.

---

## Veredicto

### MVP operable con limitaciones

**Justificación.** No es una demo: el catálogo es real, los pedidos persisten en Postgres con aislamiento por fila verificado contra la base, el panel administrativo opera, el CI está verde y el sitio está publicado y respondiendo. La base de código es de buena calidad — 146 tests, typecheck y lint limpios, y decisiones de negocio deliberadas y bien argumentadas.

No llega a **candidato a producción** por tres razones concretas, todas con evidencia en este informe:
1. Hay un acceso público a una cuenta compartida de clientes (§5.1, §10).
2. Las pruebas automatizadas validan el modo demo, no el camino real (§6).
3. Faltan verificaciones que solo pueden hacerse con accesos que hoy no tengo (§13).

Resueltas las Etapas 1 a 4, el sistema pasa razonablemente a **candidato a producción**.

---

## Resumen corto para el dueño

La tienda funciona de verdad. El catálogo de 495 productos es real, los pedidos que hacen los clientes se guardan bien, el panel para administrarlos anda y la web está publicada y online. La calidad del trabajo es buena.

Hay un problema serio que hay que arreglar ya. En la pantalla de login existe un botón "Continuar con Google" que no es Google: mete a todos los que lo usan dentro de **la misma cuenta**. Como además el código del proyecto está publicado en internet con la contraseña de esa cuenta adentro, cualquier persona puede entrar y ver los pedidos que hayan quedado ahí. Es un problema de privacidad de tus clientes, no de que la web se rompa.

Lo bueno: revisé la base de datos de verdad y el resto está bien protegido. Un cliente no puede ver los pedidos de otro por ningún otro camino.

Sigue siendo demo la subida de fotos en el panel (la foto desaparece al recargar) y no hay cobro ni cálculo de envío online, aunque eso último parece haber sido una decisión tomada a propósito: la web toma pedidos y vos confirmás por WhatsApp.

El otro riesgo es que las pruebas automáticas revisan una versión "de práctica" del sistema y no la real, así que el hecho de que den bien no garantiza tanto como parece. Y cada cambio que se sube se publica solo, sin que nadie apruebe.

Lo primero que conviene hacer: sacar ese botón de Google y dar de baja esa cuenta. Es rápido y no rompe nada.

---

*Auditoría realizada sin modificar código funcional. Único cambio en el árbol: fast-forward de `main` a `origin/main` para auditar el código desplegado.*
