# Publicar en Hostinger — tienda y administración por separado (Etapa 6)

Este MVP se aloja como **dos sitios estáticos independientes**, cada uno con
su propia raíz de publicación en Hostinger:

| Superficie | Dominio | Artefacto local | Document root en Hostinger |
|---|---|---|---|
| Tienda pública | dominio principal (ej. `www.litoralmaq.com`) | `hostinger-ready/` | `public_html` del dominio principal |
| Administración | subdominio (ej. `admin.litoralmaq.com`) | `admin-ready/` | document root propio del subdominio |

No necesita Node.js, PHP ni base de datos mientras siga usando los flujos
simulados del navegador (`localStorage`, Etapa 5 preparada pero no
conectada — ver `supabase/README.md`).

## 0. Qué separación demuestra esto y qué no

Antes de desplegar, es importante entender qué nivel de separación es real:

- **Rutas y HTML: separación real y verificada.** `hostinger-ready/` no
  contiene `admin.html` ni `admin/**`; `admin-ready/` no contiene
  `index.html`, `productos.html`, `carrito.html`, `checkout.html`,
  `login.html`, `registro.html` ni `cuenta/**`. Verificado con
  `npm run validate:separation` (26 chequeos automáticos, ver más abajo) y
  con inspección manual del navegador contra ambos artefactos reales.
- **Bundle JS: NO está separado.** Los directorios `_next/static/chunks/`
  de ambos artefactos son **idénticos byte a byte** (mismos nombres de
  archivo, que en Next.js son hash de contenido). Esto es así porque los
  dos artefactos parten del mismo `next build` — Next.js genera un único
  bundle con el código de **todas** las rutas del proyecto (tienda y admin),
  y separar solo recorta qué páginas HTML quedan como punto de entrada. El
  código de checkout, por ejemplo, viaja también dentro del JS de
  `admin-ready/`, aunque ninguna página admin lo ejecute ni exista un
  `checkout.html` para llegar ahí. Separar esto de verdad requeriría dos
  proyectos Next.js (o al menos dos builds con `webpack` splitChunks
  configurado por separado), cambio de arquitectura fuera de esta etapa.
- **Enlaces cruzados: revisados dos veces.** La validación automática
  revisa el HTML estático exportado. Un caso real se escapó de esa
  revisión porque se renderiza solo del lado del cliente (leyendo
  `localStorage`) y no aparece en el HTML exportado:
  `admin/categorias` tenía un link "Ver en tienda" por categoría que usaba
  el router interno de Next.js hacia `/productos`, ruta ausente en
  `admin-ready/`. Se encontró probando la página real en el navegador (no
  con el validador), y se corrigió para usar `getStoreUrl()` — mismo patrón
  domain-aware que el único link "Ver tienda" del panel — con un `<a>`
  normal en vez de un `<Link>` de Next.js, para que sea una navegación de
  browser real y no un intento de ruteo interno hacia una página que no
  existe en ese artefacto.

## 1. Configuración de dominios (variables de entorno)

`src/lib/domain-config.ts` lee dos variables en tiempo de build:

```bash
NEXT_PUBLIC_STORE_DOMAIN=www.litoralmaq.com
NEXT_PUBLIC_ADMIN_DOMAIN=admin.litoralmaq.com
```

- Sin configurar (build local, ambos artefactos servidos en el mismo
  origen durante pruebas): los links entre superficies (el único "Ver
  tienda" de admin, y los links "Ver en tienda" por categoría) usan **ruta
  relativa** — nunca un dominio hardcodeado.
- Configuradas: los links arman una URL absoluta al dominio real
  correspondiente.
- Mal formadas (con ruta, con query, o que no parseen como URL): las
  funciones **lanzan** un error explícito en vez de armar un link roto en
  silencio. La UI que las usa (`AdminShell`, `admin/categorias`) atrapa ese
  error y muestra un aviso visible ("⚠ Dominio de tienda mal configurado")
  en vez de romper el render de toda la página.

Ver `.env.example` para el formato exacto (valores ficticios).

## 2. Generar los dos artefactos

Cada superficie se construye y valida con su propio comando — **no
reutilizan archivos de una corrida anterior**, cada uno corre su propio
`next build` desde cero antes de recortar:

```bash
npm install

# Tienda → hostinger-ready/
NEXT_PUBLIC_STORE_DOMAIN=www.litoralmaq.com \
NEXT_PUBLIC_ADMIN_DOMAIN=admin.litoralmaq.com \
npm run build:hostinger

# Administración → admin-ready/
NEXT_PUBLIC_STORE_DOMAIN=www.litoralmaq.com \
NEXT_PUBLIC_ADMIN_DOMAIN=admin.litoralmaq.com \
npm run build:admin

# Validación automática de separación (falla con exit code 1 si algo no cumple)
npm run validate:separation
```

En desarrollo/prueba local sin dominios reales todavía, se puede omitir las
variables — los links quedan relativos (ver §1) y ambos artefactos siguen
siendo válidos para revisar con `npm run preview:hostinger` (puerto 3111,
`hostinger-ready/`) y `npm run preview:admin` (puerto 3112, `admin-ready/`).

`hostinger-ready/` y `admin-ready/` están en `.gitignore` y excluidos de
ESLint (`eslint.config.mjs`) — son artefactos generados, no código fuente.

## 3. Configurar el subdominio en Hostinger (hPanel)

**No verificado contra una cuenta Hostinger real en este entorno** (sin
acceso a un panel real ni credenciales) — estos son los pasos estándar
documentados por Hostinger para crear un subdominio con document root
propio; quedan como **pendiente manual de verificación** por quien tenga
acceso al hPanel real antes de la publicación:

1. hPanel → **Dominios** → **Subdominios** → crear `admin` sobre el dominio
   `litoralmaq.com` (queda `admin.litoralmaq.com`).
2. Al crearlo, Hostinger pide (o genera automáticamente) una carpeta de
   document root propia, normalmente `public_html/admin.litoralmaq.com` —
   **distinta** de `public_html` del dominio principal. Confirmar que
   quede así: si el subdominio comparte carpeta con el dominio principal,
   la separación de artefactos no tiene efecto (ambos servirían el mismo
   contenido).
3. Verificar propagación DNS del subdominio (puede tardar) antes de subir
   contenido o probar.
4. Confirmar en el administrador de archivos que existen dos carpetas
   distintas antes de subir nada: `public_html/` (tienda) y
   `public_html/admin.litoralmaq.com/` (o el nombre real que haya asignado
   Hostinger — verificar el path exacto en el propio hPanel).

## 4. Subir cada artefacto a su raíz

| Artefacto | Sube a |
|---|---|
| Contenido de `hostinger-ready/` (incluido `.htaccess`) | `public_html/` (dominio principal) |
| Contenido de `admin-ready/` (incluido `.htaccess`) | document root del subdominio admin |

Si `public_html` contiene una web anterior, hacer una copia antes de
reemplazar archivos. No subir `node_modules`, `src`, `.git` ni
credenciales — ninguno de los dos artefactos los contiene (son solo HTML
+ JS + assets exportados).

## 5. Qué hace cada `.htaccess`

**Tienda** (`hostinger-ready/.htaccess`):
- Bloquea explícitamente cualquier intento de acceder a `/admin*` con un
  403 (`RewriteRule ^admin(/.*)?$ - [F,L]`) — no debería haber ninguna ruta
  admin en este artefacto, pero la regla queda como defensa adicional.
- Sirve archivos/carpetas existentes tal cual.
- Reescribe rutas limpias (`/productos` → `productos.html`) para que
  funcionen sin extensión, incluida cualquier ruta profunda o refresh del
  navegador.
- `/` → `index.html`.

**Administración** (`admin-ready/.htaccess`):
- Sirve archivos/carpetas existentes tal cual.
- Reescribe rutas limpias (`/admin/productos` → `admin/productos.html`).
- La **raíz del subdominio** (`/`) reescribe a `admin.html` — no hay
  `index.html` en este artefacto. `AdminShell` decide desde ahí, en el
  cliente, si mostrar el dashboard o redirigir a `/admin/login` según haya
  o no sesión válida.

Ambos incluyen `ErrorDocument 404 /404.html`.

## 6. Validar después de subir

1. Abrir el dominio principal: navegar catálogo, agregar al carrito,
   completar checkout (pago simulado). Confirmar que no hay ningún enlace
   visible a `/admin` en ningún lado (header, footer, menú móvil).
2. Refrescar el navegador en una ruta profunda (ej. `/productos/<slug>`,
   `/carrito`) — debe seguir funcionando, no dar 404 (confirma que el
   `.htaccess` de reescritura quedó bien subido).
3. Abrir el subdominio admin: debe redirigir a `/admin/login` sin sesión.
   Iniciar sesión con la credencial demo (`admin@litoralmaq.com` /
   `admin123`), confirmar acceso al panel, y que "Ver tienda" abre el
   dominio principal (no una ruta 404 dentro del propio subdominio).
4. Refrescar en una ruta admin profunda (ej. `/admin/pedidos`) — debe
   mantener la sesión y seguir funcionando.
5. Confirmar en la pestaña Network del navegador que la tienda no hace
   ninguna petición a rutas `/admin/*`, y que el admin no carga
   `productos.html`, `carrito.html` ni `checkout.html`.

## 7. Rollback independiente

Cada superficie se reemplaza de forma independiente — no hace falta tocar
la otra:

- **Tienda**: volver a subir una versión anterior de `hostinger-ready/` a
  `public_html/` (o restaurar backup previo). No afecta al subdominio
  admin, que sigue sirviendo su propio contenido sin cambios.
- **Admin**: volver a subir una versión anterior de `admin-ready/` al
  document root del subdominio. No afecta a la tienda pública.
- Si algo sale mal después de publicar, es más simple restaurar backup de
  **una sola carpeta** que de un despliegue mezclado — esa es la ganancia
  concreta de tener document roots separados.

Recomendado: conservar el `hostinger-ready/`/`admin-ready/` previos (o un
zip de cada `public_html`) antes de cada reemplazo, para poder rollback
sin tener que reconstruir desde el código.

## 8. Modificar el código

El código editable está en:

- `src/app`: páginas y rutas (`src/app/admin/**` es la superficie
  administrativa; el resto es tienda pública).
- `src/components`: componentes compartidos.
- `src/store`: carrito, sesión, catálogo y persistencia demo.
- `src/services`: adaptadores para las conexiones futuras (Supabase,
  Etapa 5 — preparado, no conectado).
- `src/lib/domain-config.ts`: dominios de tienda/admin.
- `src/data/products.json`: catálogo inicial.
- `public`: imágenes y recursos públicos.

Después de cada modificación, volver a ejecutar:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run validate:catalog
npm run build:hostinger
npm run build:admin
npm run validate:separation
```

Luego reemplazar en cada `public_html` el contenido por la nueva salida
del artefacto correspondiente (§4).

## 9. Importante sobre esta versión

- Productos, carrito, usuarios, pedidos y cambios del administrador se
  guardan en `localStorage`. Los cambios existen solamente en el navegador
  y dispositivo donde se hicieron — **tienda y admin, al estar en dominios
  distintos, tampoco comparten `localStorage` entre sí** (son orígenes
  distintos); esto ya era así en la práctica porque cada visitante tiene su
  propio navegador, pero ahora es además estructural.
- Para una tienda productiva multiusuario con datos compartidos entre
  dispositivos hace falta conectar la base de datos real (Etapa 5,
  preparada pero no conectada — ver `supabase/README.md`), autenticación
  segura, Mercado Pago, envíos e imágenes.
- Las variables previstas están documentadas en `.env.example`; no deben
  publicarse claves reales dentro de ningún artefacto ni de `public_html`.
- `NEXT_PUBLIC_STORE_DOMAIN` / `NEXT_PUBLIC_ADMIN_DOMAIN` son públicas por
  diseño (terminan en el bundle del navegador) — nunca son secretas, son
  solo los dominios donde vive cada superficie.
