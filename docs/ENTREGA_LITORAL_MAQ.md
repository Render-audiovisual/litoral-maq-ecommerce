# Entrega — Litoral Maq

Documento de entrega y guion de demo. Preparado a partir de una auditoría
independiente sobre `main` y sobre los dos sitios publicados, sin crear
pedidos, cuentas ni datos reales. La corrida de control que sostiene el
veredicto se hizo **después** del despliegue del PR #9.

- **Tienda**: https://litoralmaqrender.rendercorrientes.com
- **Panel**: https://admin-litoralmaqrender.rendercorrientes.com/admin.html

> ## ✅ Veredicto: APTO PARA ENTREGA
>
> El único bloqueo que tenía esta auditoría —el error 403 al abrir cualquier
> ruta por URL directa o recarga— **está resuelto y verificado en producción**
> (PR #9). La corrida de control posterior al despliegue da **20 de 20 vistas
> en HTTP 200**, **35 enlaces internos todos en 200**, **0 hallazgos
> críticos**, 0 enlaces rotos, 0 desbordes y 0 textos de prueba. Detalle y
> evidencia en §7.1.
>
> Queda un solo punto abierto, y **no bloquea la demo**: la confirmación del
> acceso del dueño (§3).

---

## 1. Qué funciona hoy

Verificado en producción el día de la auditoría, navegando como lo haría una
persona (sin enviar formularios ni crear datos).

### Tienda

| Área | Estado | Evidencia |
|---|---|---|
| Home (desktop y móvil) | ✅ | HTTP 200, sin desborde horizontal, sin errores de consola propios |
| Catálogo | ✅ | 24 productos por página, navegando desde el menú. **60 productos activos** a la vista del público |
| Búsqueda | ✅ | "amoladora" desde el buscador → 8 resultados |
| Filtros por familia | ✅ | taladros, amoladoras, escaleras, compresores, aspiradoras, motosierras, kits |
| Ficha de producto | ✅ | abre desde la grilla, con código y precio |
| Carrito | ✅ | agrega, muestra código, precio unitario, cantidad ± y total |
| Inicio de checkout | ✅ | formulario con nombre, email y teléfono; entrega por envío (domicilio o sucursal) o retiro en Sáenz 1587. **No se envió ninguna solicitud** |
| Login / registro de clientes | ✅ | el formulario carga y valida |
| **URL directa, F5 y enlaces compartidos** | ✅ | 20 de 20 vistas en HTTP 200 tras el PR #9; 35 enlaces internos todos en 200 (§7.1) |

### Panel de administración

| Área | Estado | Evidencia |
|---|---|---|
| Entrada por `/admin.html` | ✅ | redirige a `/admin/login?next=%2Fadmin.html` |
| Formulario de acceso | ✅ | campos Email y Contraseña presentes; el botón "Ingresar" queda deshabilitado hasta pasar la verificación antiabuso |
| Separación tienda / panel | ✅ | 4 de 4 pruebas: la tienda no sirve el panel ni `admin.html`; el panel no sirve catálogo ni checkout |

### Calidad del código (todo desde cero, en limpio)

Reejecutado sobre `main` con el PR #9 ya incorporado:

| Gate | Resultado |
|---|---|
| `npm ci` | ✅ 0 vulnerabilidades |
| `npx tsc --noEmit` | ✅ sin errores |
| `npm run lint` | ✅ sin errores |
| `npm test` (unitarios) | ✅ **259 de 259** en 27 archivos |
| `npx playwright test` (E2E) | ✅ **45 pasaron**, 2 salteados (los de staging, sin backend declarado). En una corrida en frío puede fallar 1 por compilación lenta; pasa al repetirla (§7.5) |
| `npm run validate:catalog` | ✅ **PASS** — 508 productos vigentes del Sheet, 0 filas inválidas, 0 códigos duplicados, 0 sin código/nombre/precio |
| `npm run build` / `build:hostinger` / `build:admin` | ✅ los tres artefactos se generan (en Windows, ver §7.5) |
| `npm run validate:separation` | ✅ **34 de 34** comprobaciones, incluidas las de índice físico por ruta que agregó el PR #9 |

### El catálogo: dos números, y no son lo mismo

Es la confusión más fácil de cometer en la demo, así que conviene tenerla
clara:

| Número | Qué es |
|---|---|
| **60 productos activos** | Lo que **ve el público** hoy. Son los que se muestran en el catálogo, y las 60 fichas que genera el sitio. |
| **528 productos versionados** | El histórico completo guardado en el repositorio: 508 vigentes en el Google Sheet + 20 ya retirados. |

Los 468 restantes están cargados pero **inactivos**: no aparecen en la tienda.
Publicar más es cambiarles la visibilidad desde el panel, sin tocar código ni
volver a publicar el sitio. Ninguno de los productos retirados quedó activo por
error (`activeRetiredProducts: 0`).

### Backend

Las 7 Edge Functions están **ACTIVE** en el proyecto de producción:
`shipping-quote`, `shipping-create`, `shipping-label`, `enviopack-webhook`,
`payment-create`, `mercado-pago-webhook`, `order-notifications`.

---

## 2. Guion de demo — 10 minutos

> **Sin restricciones para demostrar.** El defecto que obligaba a navegar solo
> con clics está resuelto y verificado (§7.1): se puede escribir la dirección,
> recargar con F5, usar el historial y abrir enlaces guardados. Es más: **abrir
> un enlace de producto como si llegara por WhatsApp es una buena cosa para
> mostrar**, porque es exactamente como llegan los clientes.

| Min | Qué mostrar | Cómo |
|---|---|---|
| 0–1 | **Portada** | Abrir la tienda. Mostrar el carrusel, las categorías y el pie con datos de contacto. |
| 1–3 | **Encontrar un producto** | Buscar "amoladora" en el buscador → resultados. Volver e ir por menú a *Productos* → filtrar por *Amoladoras*. Abrir una ficha: código, precio, descripción. |
| 3–4 | **Carrito** | "Agregar al carrito" → ir al carrito. Cambiar la cantidad con ± y mostrar cómo se recalcula el total. |
| 4–6 | **Checkout, sin comprar** | "Solicitar compra". Mostrar los datos de contacto, y las dos formas de entrega: retiro gratis en Sáenz 1587, o envío a domicilio / sucursal. Señalar el texto "Confirmamos stock y entrega antes de cobrar": **hoy no se cobra en el sitio**. *No enviar la solicitud durante la demo.* |
| 6–7 | **Cuenta de cliente** | Mostrar "Ingresar": alta con email o con Google, y recuperación de contraseña. Explicar que se puede comprar como invitado, sin cuenta. |
| 7–9 | **Panel** | Abrir el panel en el subdominio. Mostrar que pide acceso. Ya dentro: *Pedidos* (estados y detalle), *Productos* (el Google Sheet manda código, nombre y precio; el panel controla visibilidad, ficha y límite por compra), *Clientes*. |
| 9–10 | **Cierre** | 60 productos publicados hoy, sobre un catálogo de 508 ya cargado y sincronizado desde el Google Sheet: ampliar la vidriera es cambiar una visibilidad, no rehacer el sitio. Los pedidos llegan por correo al equipo. Pagos y envíos automáticos están listos para encenderse cuando se decida. |

**Preparación previa (5 minutos antes):** entrar al panel y dejar la sesión
abierta en una pestaña, con el navegador ya verificado; así el captcha no
interrumpe la demo.

---

## 3. Acceso del dueño — pendiente de confirmar email

> ⏳ **Estado: pendiente. Se confirma mañana.** La consulta de solo lectura a
> la base de producción fue bloqueada por la política de permisos del entorno,
> y no la forcé: el estado que sigue lo reporta el equipo, no lo verificó esta
> auditoría. Lo que sigue es el procedimiento.

El alta de un administrador tiene dos pasos y **el segundo lo tiene que hacer
la persona dueña, desde su propia casilla**:

1. La cuenta se registra como usuario común. Supabase envía un correo de
   confirmación.
2. **Hasta que no se hace clic en ese enlace, la cuenta no puede iniciar
   sesión.** El rol de administrador se asigna aparte, a mano, en el proyecto
   Supabase (ver `supabase/README.md` §9, paso 6): ningún registro público ni
   inicio de sesión con Google puede crear un administrador por su cuenta.

**Qué hacer mañana, antes de la reunión:**

- [ ] Confirmar que la persona dueña recibió el correo (revisar spam).
- [ ] Que haga clic en el enlace de confirmación.
- [ ] Verificar que puede entrar al panel.
- [ ] Si el correo venció o no llegó, reenviarlo desde el panel de Supabase.

Si al momento de la reunión el acceso todavía no está confirmado, **la demo
del panel se hace igual** con la cuenta administrativa que ya funciona, y el
traspaso queda como primer paso posterior a la entrega. No es un bloqueo para
mostrar el producto.

---

## 4. Resend — correos operativos

**Estado: activo y probado con envío real.** La función `order-notifications`
está `ACTIVE` en producción, y ya se hizo una prueba real de punta a punta:
**2 correos aceptados, 0 fallidos.**

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

### Qué recibe el cliente después de comprar

Al confirmar la solicitud salen **dos correos en el mismo momento**: uno al
cliente ("Recibimos tu pedido", con productos, total y forma de entrega) y otro
al equipo ("Nuevo pedido", con botón directo al panel).

Los demás avisos —pedido listo, enviado, entregado— **salen cuando alguien
cambia el estado en el panel**. Los de pago aprobado o rechazado no se disparan
hoy, porque dependen de Mercado Pago, que está apagado (§5).

**No hay WhatsApp automático.** Los botones de WhatsApp del sitio los aprieta
una persona: en la pantalla de confirmación hay un "Avisar por WhatsApp" que
abre un mensaje ya redactado con el número de solicitud y los productos, pero
lo envía el cliente si quiere. El sistema nunca manda un WhatsApp por su
cuenta.

> **Pendiente menor**: la cola de correos se procesa al crear un pedido, al
> cambiar un estado, con el botón "Reintentar correos pendientes" del panel, o
> por un proceso periódico (`ORDER_NOTIFICATIONS_CRON_SECRET`). **No pude
> verificar si ese proceso periódico está efectivamente programado** — la
> consulta a la base fue bloqueada por la política de permisos del entorno. Si
> no lo estuviera, un correo que falle esperaría hasta que alguien entre al
> panel y apriete el botón. Conviene confirmarlo.

> **Alcance de lo verificado**: confirmé que la función está desplegada y
> activa, y revisé el código del envío y de la cola. **No envié correos yo**,
> porque hacerlo habría creado datos reales. La prueba real de envío (2
> aceptados, 0 fallidos) la ejecutó y confirmó el equipo.

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

**El deploy actual ya hace backup y rollback automáticos.** Antes de publicar,
guarda el sitio que está en línea; si la publicación falla, restaura sola la
versión anterior. No hay que conservar carpetas a mano ni resubir nada.

Los dos sitios son archivos estáticos, así que la recuperación es inmediata:
no hay base de datos que migrar ni servidor que reiniciar.

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

### 7.1 ✅ RESUELTO — el 403 en URL directa y recarga

> **Estado: cerrado.** Corregido en el **PR #9**, fusionado y desplegado.
> Wilson verificó URL directa y recarga en tienda y panel, en escritorio y
> móvil, con HTTP 200 y contenido real. Confirmado además por una corrida
> independiente del script de auditoría (evidencia abajo).

**Qué pasaba.** Cualquier ruta que no fuera la portada, abierta escribiendo la
dirección, recargando con F5, volviendo con el historial o entrando por un
enlace compartido, respondía **403 Forbidden**. Afectaba a los dos sitios. La
navegación por clics funcionaba, porque no le pide la página al servidor.

**Por qué pasaba.** El sitio exportaba cada ruta como archivo
(`productos.html`) y además como carpeta homónima (`productos/`, con los datos
internos de la página). Apache veía la carpeta primero, agregaba la barra final
y, al no haber índice adentro, respondía 403 antes de que la regla de
`.htaccess` sirviera el `.html`.

**Cómo se resolvió.** El primer intento fue desactivar ese comportamiento de
Apache con `DirectorySlash Off` (PR #8), que funcionaba en un Apache de
laboratorio. **Hostinger lo ignora**, así que no alcanzó. La solución
definitiva, en el **PR #9**, ataca la causa en vez del síntoma: materializa
cada ruta también como `ruta/index.html`. Ahora la carpeta sí tiene índice, y
la barra final que agrega Apache deja de ser un problema — deja de depender de
qué directivas respete el hosting.

**Evidencia de la verificación posterior al despliegue** (`node
scripts/audit-produccion.mjs`, recorrido de solo lectura):

| Comprobación | Resultado |
|---|---|
| Vistas en HTTP 200 con contenido renderizado | **20 de 20** (10 rutas × escritorio y móvil) |
| Enlaces internos verificados uno por uno | **35, todos 200** |
| Hallazgos críticos | **0** |
| Enlaces rotos · desbordes · textos de prueba | **0 · 0 · 0** |
| Separación tienda / panel | **4 de 4** |
| `/admin.html` → login del panel con formulario | ✅ |
| Código de salida del script | **0** |

Rutas confirmadas por URL directa, que antes daban 403:

```
tienda: /productos  /carrito  /checkout  /login  /registro  /productos/<ficha>
panel:  /admin/login  /admin/pedidos  /admin/productos  /admin/clientes
        /admin/configuracion
```

**Comprobación rápida**, si alguien quiere repetirla en 10 segundos:

```bash
for u in /productos /carrito /checkout /login; do
  curl -sSL -o /dev/null -w "$u -> %{http_code}
"     https://litoralmaqrender.rendercorrientes.com$u
done
```

Nota: es normal ver un salto intermedio `301` hacia la misma ruta con barra
final (`/productos/`). Lo que importa es que **termina en 200 con la página
real**; por eso el `-L` en el comando.

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

### 7.5 🟡 Dos asperezas del entorno de desarrollo (no afectan a producción)

Ninguna toca el sitio publicado; son molestias para quien trabaje en el
código.

**Los builds de tienda y panel no corren en Windows.** Los scripts
`build:hostinger` y `build:admin` usan la forma
`ALLOW_LOCAL_ADAPTER=false next build`, que es sintaxis de Linux y macOS.
En Windows falla con *"ALLOW_LOCAL_ADAPTER no se reconoce como un comando"*.
**No afecta a la publicación**: el workflow corre en `ubuntu-latest`, donde
esa sintaxis es la correcta, y verifiqué que ambos artefactos se generan bien
al ejecutarlos con la variable puesta a la manera de Linux. Quien compile
desde Windows tiene que hacer lo mismo.

**Un E2E falla en frío.** `next dev` compila cada ruta la primera vez que se
visita, y en una corrida desde cero eso puede pasarse del tiempo de espera
—le tocó a `admin-orders`—. Repetida en caliente pasa sin problema, y en CI lo
cubre `retries: 2`. Es preexistente y no lo introduce ningún cambio reciente.

### Pasos posteriores, en orden

1. **Confirmar el acceso del dueño** (§3) — pendiente para mañana. Único punto
   abierto, y no bloquea la demo.
2. Confirmar que el procesador periódico de correos está programado (§4).
3. Decidir fecha para encender Mercado Pago y Envíopack (§5).
4. Mejorar los mensajes de error del panel (§7.3).

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
