# Pulida visual de la web y del panel — Plan

> **Para agentes:** SUB-SKILL requerida: superpowers:subagent-driven-development o superpowers:executing-plans. Cada sección se diseña con la skill **Impeccable** (registro *product*), se verifica con capturas antes/después y la aprueba Franco en local antes de pasar a la siguiente. Los pasos usan checkboxes (`- [ ]`).

**Goal:** Llevar todas las secciones que todavía tienen el formato de la primera demo al nivel del checkout y del detalle del pedido: tipografía legible, jerarquía clara, controles consistentes y nada que parezca "hecho por IA". Primero la web (ficha del producto y demás), después el panel sección por sección. Un solo deploy al final.

**Architecture:** Solo frontend (`src/app/**`, `src/components/**`, `src/app/globals.css`). Sin migraciones ni cambios en Edge Functions. Se trabaja sobre la rama `feat/checkout-animacion-whatsapp`, que ya tiene el checkout, el WhatsApp y el detalle del pedido; se prueba todo en local y se publica junto.

**Tech Stack:** Next.js, CSS global (`globals.css`, ~919 líneas), Playwright (`npm run test:e2e`), vitest.

## Lenguaje visual común (se define una vez, se aplica en todo)

Sale de lo que ya gustó en el checkout y en el detalle del pedido. Cada tarea lo respeta; si una sección necesita romperlo, se avisa.

1. **Tipografía con piso.** Nada de datos ni etiquetas por debajo de 12 px. Hoy `globals.css` tiene 50 declaraciones de 9, 10 y 11 px (11 de 9 px, 15 de 10 px, 24 de 11 px). Escala: etiquetas 12 px, texto de apoyo 13 px, cuerpo 14–15 px, valores y títulos de tarjeta 16 px. Las insignias (badges) pueden quedar en 11 px con peso 700.
2. **Color con propósito.** Azul (`--navy`) para selección, foco y títulos; naranja (`--orange`) solo para la acción principal de cada pantalla y para precios. Verde solo para WhatsApp y estados "ok". Nada de naranja en estados inactivos ni en enlaces secundarios repetidos.
3. **Controles iguales en todos lados.** Radio y checkbox chicos con `accent-color` azul; tarjetas de elección con borde `#bfcbd3`, radio 6 px, seleccionada = borde azul + aro de 1 px + fondo `#f2f7fb`; selects con borde visible; botones con la misma altura (40–42 px) y peso 750.
4. **Sin emojis ni glifos sueltos como iconos de interfaz** (🚚 📍 ✓ ⌘ en tarjetas, iconos de menú inconsistentes). Se reemplazan por texto o por un set de iconos SVG único (mismo trazo y tamaño). Los emojis quedan solo en los mensajes de WhatsApp.
5. **Menos "tarjetas idénticas".** Donde hay una grilla de tarjetas iguales con el mismo icono y dos enlaces naranjas, se pasa a lista o tabla con acciones claras.
6. **Movimiento:** transiciones de 150–250 ms, solo para estado. Las animaciones de entrada ya pedidas (checkout, hero, testimonios) no se tocan.
7. **Accesibilidad:** contraste ≥ 4,5:1 en texto (`#566472` como gris de apoyo mínimo sobre blanco), foco visible en todo control, objetivos táctiles ≥ 40 px en celular.

## Global Constraints

- No tocar `supabase/` ni `.github/`.
- Textos de cara al cliente en español rioplatense.
- Ningún test existente puede romperse: cuando un test depende de un texto o de la estructura que se rediseña, se ajusta el test de forma explícita y se dice en el commit.
- Los selectores que ya usan los e2e se conservan salvo que la tarea diga lo contrario (`.product-card`, `.order-detail-modal`, `.checkout-layout`, `tbody tr`, botones "Ver detalle", "Agregar al carrito", etc.).
- Cada tarea termina con: capturas antes/después en escritorio (1280 px) y celular (390 px), `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, los e2e de la sección y `tests/e2e/mobile-layout.spec.ts` (sin desborde horizontal).
- Un commit por tarea, con el trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Franco aprueba cada tarea mirando el servidor local antes de seguir.** No se pushea hasta cerrar todo el plan.

## Qué se vio en la auditoría (capturas del 2026-09-24, modo demo local)

**Web**
- **Ficha del producto** (`/producto?slug=…`): el nombre ocupa 3–4 líneas gigantes en mayúsculas; la imagen queda con franjas grises arriba y abajo; no hay ficha técnica (la descripción es un solo párrafo con "Peso: 1 Kg. Tipo: E71T-GS…"); las 3 tarjetas de confianza usan emojis y letra de 10 px; queda mucho vacío debajo de la imagen.
- **Catálogo** (`/productos`): bien encaminado; el filtro lateral y las tarjetas ya se ven prolijos. Ajustes chicos de tamaños de letra y del encabezado azul.
- **Carrito:** funciona, pero la línea del producto usa letra de 10–11 px y el resumen tiene mucho aire muerto.
- **"Recibimos tu pedido"** (`/checkout/exito`): tres enlaces naranjas apilados sin jerarquía, kicker en mayúsculas diminutas y el bloque verde de WhatsApp con texto de 11 px.
- **Login / registro:** el titular gigante a la izquierda y los enlaces "Creala gratis / Reenviar confirmación" apilados en naranja.

**Panel**
- **Estructura común:** el logo ocupa un bloque blanco enorme en la barra lateral; los iconos del menú son glifos sueltos e inconsistentes; el encabezado dice "Datos demo persistidos en este navegador" en 10 px.
- **Resumen:** las tarjetas de números están bien, pero los subtítulos son de 10–11 px, la tabla "Pedidos recientes" tiene encabezados diminutos en mayúsculas y "Calidad de catálogo" mezcla ✓ y ! en texto coloreado.
- **Pedidos (lista):** una barra gris vacía (el contenedor de scroll) aparece encima de la tabla; los datos secundarios son de 10–11 px; "Ver detalle" es un botón muy chico.
- **Productos:** 58 filas sin paginación (528 productos en total); la columna Stock se corta ("Gestion…"); "Editar / Eliminar" son textos diminutos pegados; la nota naranja de "Fuente de verdad" ocupa mucho.
- **Categorías:** 12 tarjetas idénticas con el mismo icono y dos enlaces naranjas repetidos ("Administrar categoría →", "Ver en tienda →").
- **Clientes:** página mínima (10 líneas); revisar cuando haya datos.
- **Configuración:** dos tarjetas con títulos enormes y texto de 10–11 px; lista de integraciones con chips monoespaciados.

## File Structure (por tarea)

| Tarea | Archivos principales |
| --- | --- |
| A1 Ficha del producto | `src/app/productos/[slug]/product-detail-client.tsx`, `src/app/producto/page.tsx`, bloque `.detail-*` de `globals.css` |
| A2 Catálogo y tarjetas | `src/app/productos/catalog-client.tsx`, `src/components/product-card.tsx`, bloques `.product-card`, `.catalog-*` |
| A3 Carrito y resultados de compra | `src/app/carrito/page.tsx`, `src/app/checkout/exito|error|pendiente/page.tsx`, bloques `.cart-*`, `.success-*`, `.whatsapp-confirmation` |
| A4 Ingreso y cuenta | `src/app/login`, `registro`, `recuperar-clave`, `cuenta/pedidos`, bloques `.auth-*` |
| B1 Estructura del panel | `src/components/admin-shell.tsx`, bloques `.admin-shell`, `.admin-sidebar`, `.admin-topbar` |
| B2 Resumen | `src/app/admin/page.tsx`, bloques `.metric-*`, `.admin-card` |
| B3 Pedidos (lista y filtros) | `src/app/admin/pedidos/page.tsx`, bloques `.admin-table`, `.order-filters`, `.table-toolbar` |
| B4 Productos | `src/app/admin/productos/page.tsx`, bloques de la tabla y del formulario de producto |
| B5 Categorías, Clientes, Configuración, Login del panel | `src/app/admin/categorias|clientes|configuracion|login/page.tsx` |

---

## Fase A — La web

### Task A1: Ficha del producto y ficha técnica (misma plantilla para todos los productos)

**Datos reales (producción, 2026-09-24):** 86 productos activos; 78 tienen descripción; los 86 tienen imagen y marca; 74 tienen más de una imagen; ninguno tiene peso cargado. Las descripciones vienen en tres formatos: (1) bloque `Datos técnicos:` con viñetas `• Clave: valor` y una línea `Contenido: …`; (2) frases seguidas `Clave: valor. Clave: valor. Contiene. 1 x …`; (3) solo una frase de introducción.

**Principio:** la plantilla visual es **la misma para los 86 productos y para los que se carguen después**. Nunca depende de que la descripción esté completa: la tarjeta "Ficha técnica" siempre muestra Marca, Categoría y Código (datos que todo producto tiene) y, cuando la descripción trae más, suma las especificaciones debajo; "Descripción" y "Qué incluye" aparecen solo si hay texto. Un producto sin ficha detallada se ve prolijo, no roto ni vacío.

**Entregable, en dos partes:**

**A1a — Lectura de la descripción (lógica pura, con TDD).** `src/lib/product-description.ts` exporta `parseProductDescription(raw?: string | null): { intro: string; specs: { label: string; value: string }[]; extras: string[]; contents: string }`.
- Formato con saltos de línea: el primer párrafo es `intro`; las viñetas (`•`, `-`, `*`) con `Clave: valor` son `specs`; las viñetas sin dos puntos son `extras`; la línea o sección `Contenido:` / `Contiene:` es `contents`.
- Formato en frases: se corta en frases (punto + espacio + mayúscula o dígito); la primera es `intro`; las frases `Clave: valor` son `specs`; las demás antes de `Contiene`/`Contenido` son `extras`; todo lo posterior a `Contiene.` / `Contenido.` es `contents`.
- Etiqueta = texto hasta el primer `: ` (máx. 45 caracteres, sin punto). Valores con decimales (`1.8m`, `10.3 bar`), fracciones (`1/2"`) y símbolos (`°`, `~`, `&`) se conservan intactos. Se quita el punto final del valor.
- Sin descripción o vacía: todo vacío, sin errores. Los tests usan textos reales de productos (3535, 3569, 3387, 3499, 3653, 3540).

**A1b — Rediseño de la ficha** (`src/app/productos/[slug]/product-detail-client.tsx` y bloque `.detail-*` de `globals.css`):
- Título en escala fija de 28–32 px (máximo 2 líneas en escritorio), marca como texto de apoyo, código y disponibilidad en una línea.
- Galería con fondo neutro y `object-fit: contain`, sin franjas de otro color ni altura fija que deje vacío; miniaturas cuando hay varias.
- Debajo del bloque de compra: "Ficha técnica" (tabla de dos columnas, siempre), "Descripción" (intro + `extras` como lista) y "Qué incluye" (`contents`), en ese orden, con encabezados de 16–18 px y filas de 14 px.
- Las 3 tarjetas de confianza pasan a una franja de tres ítems de 13 px con iconos SVG propios, sin emojis.
- "Agregar al carrito" y selector de cantidad con la altura común de 42 px; leyenda de máximo por compra a 13 px.
- Celular: galería, título, precio y botón antes del scroll; ficha técnica en una columna.

**Verificación:** capturas antes/después con 3 productos (uno con `Datos técnicos:`, uno con frases, uno sin descripción); `product-description.test.ts`; `tests/e2e/product-availability.spec.ts`, `home.spec.ts`, `catalog-mobile.spec.ts`, `mobile-layout.spec.ts`.

**Para los productos nuevos:** cuanto más estructurada esté la descripción en el Sheet (bloque `Datos técnicos:` con `• Clave: valor` y `Contenido: …`), más completa sale la ficha. Se deja una nota de una línea en `docs/CATALOGO_Y_CORREOS_OPERATIVOS.md` con el formato recomendado.

- [ ] A1a: tests en rojo con textos reales → implementar `parseProductDescription` → verde → commit.
- [ ] A1b: capturas "antes" → rediseño con Impeccable (`layout` + `typeset` + `polish`) → capturas "después" y aprobación de Franco → commit.

### Task A2: Catálogo y tarjetas de producto
**Entregable:** piso tipográfico de 12 px en tarjetas y filtros, precio y disponibilidad con jerarquía clara, encabezado azul más compacto, orden y contador con los mismos controles del resto. No cambia la estructura de `.product-card`.
- [ ] Capturas antes → ajustes → capturas después → aprobación → commit.

### Task A3: Carrito y pantallas de resultado de compra
**Entregable:**
- Carrito: línea de producto a 13–14 px, miniatura mayor, cantidad con el control común, resumen sin aire muerto.
- Éxito / pendiente / error: un solo bloque de mensaje con jerarquía (título, dos líneas de contexto, una acción principal y las secundarias como botones secundarios, no como tres enlaces naranjas); bloque de WhatsApp al estilo del checkout (verde oscuro, texto a 13–14 px). Los textos de reserva de 24 h se conservan.
- [ ] Capturas antes → rediseño → `assisted-checkout`, `guest-account-offer`, `checkout-layout` → aprobación → commit.

### Task A4: Ingreso, registro y cuenta
**Entregable:** panel de formulario con los controles comunes, enlaces secundarios ("Creala gratis", "Reenviar confirmación") ordenados en una sola línea de apoyo, titular del lado izquierdo con escala fija y menos alto; "Mis pedidos" con las tarjetas de pedido a 13–14 px y los pedidos vencidos ya ocultos.
- [ ] Capturas antes → rediseño → `account-session`, `password-recovery`, `guest-account-offer`, `mobile-layout` → aprobación → commit.

---

## Fase B — El panel, sección por sección

### Task B1: Estructura del panel (barra lateral y encabezado)
**Entregable:** logo compacto (altura fija ~40 px, sin bloque blanco enorme), menú con un set de iconos SVG único, ítem activo claro, cierre de sesión al pie; encabezado con título de sección y acciones a 13–14 px; el texto "Datos demo persistidos en este navegador" solo se muestra en modo demo y con 12 px; insignia de pendientes legible.
- [ ] Capturas antes → rediseño → `admin-orders`, `admin-login-layout`, `admin-session-expiry`, `admin-sheet-sync` → aprobación → commit.

### Task B2: Resumen
**Entregable:** tarjetas de números con etiqueta de 12 px y detalle de 13 px; "Pedidos recientes" con encabezado de tabla en 12 px sin mayúsculas forzadas y fila clicable hacia el pedido; "Calidad de catálogo" como lista con iconos de estado (ok / pendiente) y la cifra de pendientes como texto de apoyo; "Clientes" sin tarjeta casi vacía.
- [ ] Capturas antes → rediseño → aprobación → commit.

### Task B3: Pedidos (lista, filtros y tarjetas de resumen)
**Entregable:** se quita la barra gris vacía sobre la tabla; datos secundarios a 12–13 px; "Ver detalle" a 40 px de alto; filtros con los controles comunes; tarjetas de resumen (Paso 0, Preparando, Enviado, Total) con el mismo patrón de B2; estado de pago como insignia consistente con la del detalle. El detalle (`.order-detail-modal`) ya está hecho y no se toca salvo alinear tamaños.
- [ ] Capturas antes → rediseño → `admin-orders` y `tests/e2e/admin-orders.spec.ts` → aprobación → commit.

### Task B4: Productos
**Entregable:** columna Stock sin cortes (insignia con texto completo), acciones "Editar" y "Eliminar" como botones de ícono/secundario con confirmación clara y separadas entre sí, paginación o "cargar más" (50 por página) en lugar de 58+ filas seguidas, nota "Fuente de verdad" colapsada en un texto de apoyo con enlace "Más info", formulario de producto con los controles comunes.
- [ ] Capturas antes → rediseño → `tests/e2e/admin-sheet-sync.spec.ts` y los que toquen productos → aprobación → commit.

### Task B5: Categorías, Clientes, Configuración y Login del panel
**Entregable:**
- Categorías: de 12 tarjetas idénticas a una tabla/lista con nombre, cantidad total, visibles y dos acciones ("Administrar", "Ver en tienda") como botones secundarios.
- Clientes: vacío con explicación y, con datos, tabla con los mismos estilos que Pedidos.
- Configuración: títulos de tarjeta a 18–20 px, texto a 13 px, integraciones como lista con estado (punto + texto) y variable técnica como texto de apoyo, no chip.
- Login del panel: mismos controles comunes que el ingreso de clientes.
- [ ] Capturas antes → rediseño → aprobación → commit.

---

## Cierre y deploy

- [ ] **Step 1: Mensaje de WhatsApp** — ya quedó con "te ayudamos a elegir las mejores máquinas para vos" (commit `e0aaf1e`). Cualquier otro ajuste de texto pasa por `src/lib/whatsapp.ts` con su test.
- [ ] **Step 2: Suite completa** — `npx tsc --noEmit && npm run lint && npm run test:unit && npx playwright test` (todo verde; un fallo se investiga, no se salta).
- [ ] **Step 3: Junto los commits** — la rama acumula muchos commits chicos; se agrupan en pocos con mensajes claros (checkout, WhatsApp/panel de pedidos, pulida web, pulida panel).
- [ ] **Step 4: Recorrido final de Franco** en local (web en escritorio y celular, panel completo).
- [ ] **Step 5: PR y deploy** — `git push -u origin feat/checkout-animacion-whatsapp`, abrir PR a `main`, checks en verde, merge con OK de Franco. El merge dispara el deploy completo (Edge Functions `payment-create`, `order-notifications`, `mercado-pago-webhook` + Hostinger). Antes: correr el workflow manual "Comprobar token de Supabase".
- [ ] **Step 6: Después del deploy** — confirmar el tag `supabase-last-deploy`, que el cron siga activo y que los 4 pedidos vencidos se cancelaron (bajan de 5 a 1 pendiente); recorrer `litoralmaq.com` y el panel en producción.

## Efecto al publicar

Igual que en los planes anteriores: al activarse `order-notifications` actualizado, el primer cron cancela los 4 pedidos pendientes que ya pasaron las 24 h; desaparecen del historial de sus clientes y quedan en el panel (filtro "Vencidos") con el botón "Contactar por WhatsApp".

## Fuera de alcance (por ahora)

- PR #61 (monitoreo de Edge Functions, 40 commits atrás de `main`): se decide aparte.
- Seguimiento automático al cliente a la hora (hoy es manual desde el panel).
- Rediseño de la home (ya recibió carruseles y animaciones); solo entra si aparece un problema en la auditoría de A2.

## Self-review

- Cobertura del pedido: web primero (ficha técnica y demás: A1–A4), panel sección por sección (pedidos, resumen y demás: B1–B5), un deploy al final, texto del mensaje de WhatsApp corregido.
- Cada tarea tiene entregable concreto, archivos, verificación y aprobación de Franco.
- Riesgo: `parseProductDescription` depende del formato "Clave: valor"; si una descripción no lo respeta, sus datos van a `intro`/`extras` y la ficha igual muestra Marca, Categoría y Código (sin regresión visual).
