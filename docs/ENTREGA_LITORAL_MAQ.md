# Entrega — Litoral Maq

Documento de entrega y guion de demo. Preparado a partir de una auditoría
independiente sobre `main` (`833684c`) y sobre los dos sitios publicados, sin
crear pedidos, cuentas ni datos reales.

- **Tienda**: https://litoralmaqrender.rendercorrientes.com
- **Panel**: https://admin-litoralmaqrender.rendercorrientes.com/admin.html

> **Veredicto de la auditoría: BLOQUEADO.** Hay un defecto de servidor que
> rompe todo acceso por URL directa, recarga (F5) o enlace compartido, en
> ambos sitios. Está detallado en "Riesgos reales" §7.1 y **no fue corregido**
> en esta rama, que es solo documentación. Todo lo demás de este documento
> está verificado y en pie.

---

## 1. Qué funciona hoy

Verificado en producción el día de la auditoría, navegando como lo haría una
persona (sin enviar formularios ni crear datos).

### Tienda

| Área | Estado | Evidencia |
|---|---|---|
| Home (desktop y móvil) | ✅ | HTTP 200, sin desborde horizontal, sin errores de consola propios |
| Catálogo | ✅ | 24 productos por página, navegando desde el menú |
| Búsqueda | ✅ | "amoladora" desde el buscador → 8 resultados |
| Filtros por familia | ✅ | taladros, amoladoras, escaleras, compresores, aspiradoras, motosierras, kits |
| Ficha de producto | ✅ | abre desde la grilla, con código y precio |
| Carrito | ✅ | agrega, muestra código, precio unitario, cantidad ± y total |
| Inicio de checkout | ✅ | formulario con nombre, email y teléfono; entrega por envío (domicilio o sucursal) o retiro en Sáenz 1587. **No se envió ninguna solicitud** |
| Login / registro de clientes | ✅ | el formulario carga y valida |

### Panel de administración

| Área | Estado | Evidencia |
|---|---|---|
| Entrada por `/admin.html` | ✅ | redirige a `/admin/login?next=%2Fadmin.html` |
| Formulario de acceso | ✅ | campos Email y Contraseña presentes; el botón "Ingresar" queda deshabilitado hasta pasar la verificación antiabuso |
| Separación tienda / panel | ✅ | 4 de 4 pruebas: la tienda no sirve el panel ni `admin.html`; el panel no sirve catálogo ni checkout |

### Calidad del código (todo desde cero, en limpio)

| Gate | Resultado |
|---|---|
| `npm ci` | ✅ 0 vulnerabilidades |
| `npx tsc --noEmit` | ✅ sin errores |
| `npm run lint` | ✅ sin errores |
| `npm test` (unitarios) | ✅ **259 de 259** en 27 archivos |
| `npx playwright test` (E2E) | ✅ **45 pasaron**, 2 salteados (los de staging, sin backend declarado) |
| `npm run validate:catalog` | ✅ **PASS** — 508 productos, 0 filas inválidas, 0 códigos duplicados, 0 sin código/nombre/precio |
| `npm run build` / `build:hostinger` / `build:admin` | ✅ los tres artefactos se generan |
| `npm run validate:separation` | ✅ 25 de 25 comprobaciones |

### Backend

Las 7 Edge Functions están **ACTIVE** en el proyecto de producción:
`shipping-quote`, `shipping-create`, `shipping-label`, `enviopack-webhook`,
`payment-create`, `mercado-pago-webhook`, `order-notifications`.

---

## 2. Guion de demo — 10 minutos

> **Regla de oro para la demo: navegá siempre haciendo clic. No escribas URLs
> a mano, no uses F5 y no abras enlaces guardados.** Mientras el defecto §7.1
> siga abierto, eso muestra una pantalla de error del servidor. Si pasa,
> volvé al inicio del sitio y seguí navegando con clics.

| Min | Qué mostrar | Cómo |
|---|---|---|
| 0–1 | **Portada** | Abrir la tienda. Mostrar el carrusel, las categorías y el pie con datos de contacto. |
| 1–3 | **Encontrar un producto** | Buscar "amoladora" en el buscador → resultados. Volver e ir por menú a *Productos* → filtrar por *Amoladoras*. Abrir una ficha: código, precio, descripción. |
| 3–4 | **Carrito** | "Agregar al carrito" → ir al carrito. Cambiar la cantidad con ± y mostrar cómo se recalcula el total. |
| 4–6 | **Checkout, sin comprar** | "Solicitar compra". Mostrar los datos de contacto, y las dos formas de entrega: retiro gratis en Sáenz 1587, o envío a domicilio / sucursal. Señalar el texto "Confirmamos stock y entrega antes de cobrar": **hoy no se cobra en el sitio**. *No enviar la solicitud durante la demo.* |
| 6–7 | **Cuenta de cliente** | Mostrar "Ingresar": alta con email o con Google, y recuperación de contraseña. Explicar que se puede comprar como invitado, sin cuenta. |
| 7–9 | **Panel** | Abrir el panel en el subdominio. Mostrar que pide acceso. Ya dentro: *Pedidos* (estados y detalle), *Productos* (el Google Sheet manda código, nombre y precio; el panel controla visibilidad, ficha y límite por compra), *Clientes*. |
| 9–10 | **Cierre** | Catálogo de 508 productos sincronizado desde el Google Sheet; los pedidos llegan por correo al equipo; pagos y envíos automáticos están listos para encenderse cuando se decida. |

**Preparación previa (5 minutos antes):** entrar al panel y dejar la sesión
abierta en una pestaña, con el navegador ya verificado; así el captcha no
interrumpe la demo.

---

## 3. Acceso del dueño — pendiente de confirmar email

> ⚠️ **No verificado por esta auditoría.** La consulta de solo lectura a la
> base de producción fue bloqueada por la política de permisos del entorno, y
> no la forcé. Lo que sigue es el procedimiento, no una confirmación del
> estado actual.

El alta de un administrador tiene dos pasos y **el segundo lo tiene que hacer
la persona dueña, desde su propia casilla**:

1. La cuenta se registra como usuario común. Supabase envía un correo de
   confirmación.
2. **Hasta que no se hace clic en ese enlace, la cuenta no puede iniciar
   sesión.** El rol de administrador se asigna aparte, a mano, en el proyecto
   Supabase (ver `supabase/README.md` §9, paso 6): ningún registro público ni
   inicio de sesión con Google puede crear un administrador por su cuenta.

**Qué hacer antes de la reunión:**

- [ ] Confirmar que la persona dueña recibió el correo (revisar spam).
- [ ] Que haga clic en el enlace de confirmación.
- [ ] Verificar que puede entrar al panel.
- [ ] Si el correo venció o no llegó, reenviarlo desde el panel de Supabase.

Si el acceso todavía no está confirmado, la demo del panel se hace con la
cuenta administrativa que ya funciona, y el traspaso queda como primer paso
posterior a la entrega.

---

## 4. Resend — correos operativos

**Estado: configurado y desplegado.** La función `order-notifications` está
`ACTIVE` en producción.

Cómo funciona:

- Cada cambio relevante de un pedido deja primero un evento en la tabla
  `order_notification_outbox` (alta del pedido, aviso al equipo, pago aprobado
  o rechazado, pedido listo, despachado y entregado).
- La función toma los eventos con bloqueo `SKIP LOCKED`, los envía por Resend
  usando `Idempotency-Key` y reintenta con espera progresiva.
- **Un webhook repetido no duplica el correo**, y si el envío falla, el pedido
  se guarda igual y el correo queda encolado para reintento. Nunca se pierde
  un pedido por un problema de correo.

Secretos que consume, cargados directamente en Supabase (nunca en Git ni en
variables `NEXT_PUBLIC_*`): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`LITORAL_ORDERS_EMAIL`, `STORE_PUBLIC_URL`, `ADMIN_PUBLIC_URL`,
`ORDER_NOTIFICATIONS_CRON_SECRET`.

> ⚠️ **Alcance de lo verificado**: confirmé que la función está desplegada y
> activa, y revisé el código del envío y de la cola. **No envié correos de
> prueba**, porque hacerlo habría creado datos reales. La confirmación de que
> los correos llegan a destino es del equipo, no de esta auditoría.

---

## 5. Mercado Pago y Envíopack — preparados, no activados

Ambas integraciones están **construidas, desplegadas y apagadas**. Es una
decisión explícita, no algo pendiente por olvido.

**Cómo lo verifiqué**: el workflow de publicación define
`NEXT_PUBLIC_STORE_DOMAIN`, `NEXT_PUBLIC_ADMIN_DOMAIN`,
`NEXT_PUBLIC_PERSISTENCE_PROVIDER` y las variables de Supabase, y **no**
define `NEXT_PUBLIC_MERCADO_PAGO_ENABLED` ni `NEXT_PUBLIC_SHIPPING_ENABLED`.
Sin esos interruptores, el sitio público no ofrece pago ni cotización
automática.

Qué significa en la práctica:

| | Hoy | Cuando se encienda |
|---|---|---|
| **Pago** | El checkout registra una *solicitud de compra*. No se cobra nada en el sitio; el pago se coordina aparte. | El comprador paga con Mercado Pago y el estado del pedido se actualiza solo, con el webhook firmado. |
| **Envío** | El costo de envío se cotiza a mano y se confirma con la persona compradora. | Envíopack cotiza en el checkout, y se generan guía y seguimiento desde el panel. |

Las funciones `payment-create`, `mercado-pago-webhook`, `shipping-quote`,
`shipping-create`, `shipping-label` y `enviopack-webhook` ya están activas en
Supabase: encenderlas es cargar las credenciales del proveedor y activar el
interruptor en el build. Ver `docs/MERCADO_PAGO_INTEGRATION.md` y
`docs/ENVIOPACK_INTEGRATION.md`.

---

## 6. Rollback y recuperación

### Volver a una versión anterior del sitio

Los dos sitios son archivos estáticos. Recuperar una versión previa es
resubir el artefacto anterior a `public_html`; no hay base de datos que
migrar ni servidor que reiniciar. **Conservar el contenido de
`hostinger-ready/` y `admin-ready/` de la entrega actual antes de publicar
cualquier cambio** es todo el respaldo que hace falta.

### Volver a modo local (sin Supabase)

Si la base fallara, la aplicación puede volver a funcionar con almacenamiento
del navegador, sin tocar código: poner
`NEXT_PUBLIC_PERSISTENCE_PROVIDER=local` en el entorno de publicación y
republicar. Procedimiento completo en `supabase/README.md` §10.

> **Importante**: los datos **no** se sincronizan entre los dos modos. Lo que
> se haya escrito en Supabase no aparece en modo local, ni al revés. Sirve
> para una emergencia corta, no como forma de trabajar.

### Apagar pagos o envíos

Quitar `NEXT_PUBLIC_MERCADO_PAGO_ENABLED` o `NEXT_PUBLIC_SHIPPING_ENABLED`
del build y republicar. El checkout vuelve al modo "solicitud de compra" sin
tocar la base ni las funciones.

### Si un pedido no llega por correo

El pedido **ya está guardado** en la base y se ve en el panel. El correo se
reintenta solo. La cola vive en `order_notification_outbox`; ningún pedido
depende de que el correo salga.

---

## 7. Riesgos reales y pasos posteriores

### 7.1 🔴 BLOQUEANTE — todo acceso por URL directa o recarga termina en error

**Qué pasa.** Cualquier ruta que no sea la portada, si se abre escribiendo la
dirección, recargando con F5, volviendo con el historial o entrando por un
enlace compartido, responde una redirección y después un error **403
Forbidden**. Afecta a los dos sitios.

**Cómo reproducirlo** (10 segundos, sin herramientas):

```
https://litoralmaqrender.rendercorrientes.com/productos   → 301 → /productos/ → 403
https://litoralmaqrender.rendercorrientes.com/carrito     → 403
https://litoralmaqrender.rendercorrientes.com/checkout    → 403
https://litoralmaqrender.rendercorrientes.com/login       → 403
https://admin-litoralmaqrender.rendercorrientes.com/admin/login    → 403
https://admin-litoralmaqrender.rendercorrientes.com/admin/pedidos  → 403
```

**Qué SÍ funciona**: navegar con clics desde la portada. La aplicación cambia
de página sin pedirle nada al servidor, así que el recorrido completo
—catálogo, búsqueda, filtros, ficha, carrito, checkout— anda bien. El error
aparece en cuanto el navegador vuelve a pedir la página al servidor.

**Por qué pasa.** El sitio exporta cada ruta como archivo (`productos.html`) y
además como carpeta con el mismo nombre (`productos/`, con los datos internos
de la página). Apache ve la carpeta primero, agrega la barra final
(`/productos/`), y como esa carpeta no tiene índice, responde 403 antes de
que la regla de `.htaccess` pueda servir el `.html`.

**Verificación hecha.** Serví el artefacto actual de `main` con un Apache real
en un contenedor: reproduce el mismo 301 → 403. Agregando una sola línea
(`DirectorySlash Off`) al principio del `.htaccess`, **las seis rutas pasan a
responder 200** y la redirección de `/admin` al subdominio sigue funcionando.
La corrección **no fue aplicada**: esta rama es solo documentación.

**Además**: producción está corriendo un artefacto **más viejo que `main`**
(`/admin` responde 404 en vez de la redirección que define el `.htaccess`
actual). Republicar tal como está **no alcanza**: el defecto también está en
`main`.

**Impacto para el negocio.** Un enlace de producto compartido por WhatsApp no
abre. Un cliente que recarga pierde la página. Quien entre al panel escribiendo
la dirección no puede trabajar. Es lo primero a resolver.

### 7.2 🟡 El captcha bloquea navegadores automatizados

El formulario de acceso al panel carga bien —campos y botón presentes— pero el
botón "Ingresar" queda deshabilitado hasta que se pasa la verificación
antiabuso, y esa verificación rechaza navegadores automatizados. **Es el
comportamiento buscado, no una falla**: una persona con un navegador normal
entra sin problema. Es solo una limitación de la auditoría automática: no pude
completar un inicio de sesión real en el panel.

### 7.3 🟡 Los errores del backend se ven todos iguales

En el panel, un código de producto repetido y un problema de permisos muestran
el mismo texto genérico ("No se pudo guardar el producto."). Se muestra el
error y **nada se guarda en silencio**, pero quien administra no puede
distinguir la causa. Documentado en `docs/staging-supabase.md`.

### 7.4 🟢 Sin textos de prueba ni mezcla de sitios

No apareció ningún texto de demo, relleno o dato de prueba en las páginas
públicas, ni desbordes horizontales en escritorio o móvil, ni mezcla entre
tienda y panel.

### Pasos posteriores, en orden

1. **Corregir el 403** (§7.1) y publicar. Sin esto no conviene difundir el
   sitio.
2. **Republicar los dos sitios** desde `main` con la corrección, para cerrar
   además la diferencia entre lo publicado y el repositorio.
3. **Confirmar el acceso del dueño** (§3).
4. Enviar un pedido de prueba real y confirmar que el correo llega (§4).
5. Decidir fecha para encender Mercado Pago y Envíopack (§5).
6. Mejorar los mensajes de error del panel (§7.3).

---

## Cómo reproducir esta auditoría

```bash
npm ci
npx tsc --noEmit
npm run lint
npm test
npx playwright test
npm run validate:catalog
npm run build && npm run build:hostinger && npm run build:admin
npm run validate:separation
node scripts/audit-produccion.mjs --out auditoria-produccion
```

El último comando recorre los dos sitios publicados en escritorio y móvil y
deja `auditoria-produccion/auditoria.json` con el detalle y una captura por
vista. **Es de solo lectura**: no envía formularios, no inicia sesión y no
crea datos. Termina con código 1 si encuentra algo crítico.
