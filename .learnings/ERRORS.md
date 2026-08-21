# Errors

## 2026-08-11 — El build detectó un type guard demasiado amplio

El primer build del nuevo importador falló porque el predicado de filtrado no era asignable al tipo inferido. Se reemplazó `map + filter` por un `reduce<Product[]>` explícito y se volvió a ejecutar lint, tests y build completos.

## 2026-08-11 — La prueba remota navegó antes de completar el login

Una prueba contra la preview hizo `goto` inmediatamente después del clic de acceso y se adelantó al enrutamiento asíncrono. Se agregó una espera explícita por la URL `/admin` antes de abrir Productos.

## 2026-08-12 — ImageMagick no está instalado en el entorno

El comando `identify` no estaba disponible al inspeccionar dimensiones de imágenes. Para verificaciones simples de formato y resolución, usar `file`; reservar una herramienta de imágenes solo si hace falta procesamiento visual.

## 2026-08-12 — El preset móvil de Playwright intentó usar WebKit ausente

El preset `iPhone 13` del comando de capturas seleccionó un binario WebKit no instalado. Para revisar CSS responsive sin instalar navegadores adicionales, usar Chromium con `--viewport-size "390,844"`.

## 2026-08-12 — No ejecutar build y servidor dev sobre el mismo `distDir`

El build de producción se ejecutó mientras Next dev seguía abierto y ambos tocaron `dist/`, corrompiendo la caché generada de Turbopack. Para este proyecto, cerrar el servidor de capturas antes de `npm run build`; si ya ocurrió, apartar `dist/dev/cache` y dejar que Next la regenere.

## 2026-08-19 — Validar el catálogo puede fallar por cambios remotos del Sheet

El build y TypeScript pasaron, pero `validate:catalog` detectó que la planilla fuente cambió a 478 productos mientras el JSON local conserva 495. Antes de atribuir el fallo a un cambio de interfaz, comparar los conteos del reporte. No reimportar ni reemplazar el catálogo automáticamente: revisar primero las diferencias porque puede eliminar o desplazar productos reales.

## 2026-08-19 — La separación requiere construir los dos artefactos

`validate:separation` no puede ejecutarse después del build general: necesita `hostinger-ready/` y `admin-ready/`. Ejecutar primero `build:hostinger` y `build:admin`; después validar la separación.

## 2026-08-19 — No fijar el total del catálogo en una prueba

Una prueba del adaptador local esperaba exactamente 495 productos y falló cuando el Sheet vigente pasó a 478. La prueba debe comparar lo cargado con `productsSeed.length`; el total comercial puede cambiar sin que falle el adaptador.

## 2026-08-20 — El E2E integral quedó acoplado al catálogo anterior

`npm run validate:e2e` todavía espera 460 productos y el flujo anterior de carrito. Con la selección pública intencional de 20 productos, falla antes de alcanzar los chequeos del administrador. Separar las pruebas de tienda y administración y derivar los conteos desde la configuración vigente.

## 2026-08-20 — Vitest no acepta `--runInBand`

Este proyecto usa Vitest, cuyo CLI rechazó la opción de Jest `--runInBand`. Ejecutar `npm test` directamente; los 128 tests pasan con el comando definido por el proyecto.

## 2026-08-20 — El navegador aislado bloquea URLs locales

`openclaw browser open http://127.0.0.1:<puerto>` fue rechazado por la política de navegación. Para validar visualmente un servidor local de este proyecto, usar Playwright mediante su configuración E2E y cerrar antes cualquier instancia de Next dev.

## 2026-08-20 — Verificar el remoto inmediatamente antes de publicar

El push fue rechazado porque `origin/main` recibió commits durante el trabajo local. Ejecutar `git fetch origin`, revisar los cambios entrantes y rebasar de forma no destructiva antes de reintentar; nunca forzar el push ni sobrescribir trabajo ajeno.

## 2026-08-21 — `view_image` no acepta detalle `low`

La inspección visual falló al enviar `detail: "low"`. Usar `high`, `original` u omitir el parámetro.

## 2026-08-21 — Playwright CLI puede elegir WebKit al usar un dispositivo móvil

`playwright screenshot --device='iPhone 13'` intentó abrir WebKit, que no está instalado en este entorno. Para QA móvil local usar Chromium con `--viewport-size` explícito.
