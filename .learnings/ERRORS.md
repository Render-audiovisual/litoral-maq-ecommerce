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

## 2026-08-23 — Los carruseles infinitos duplican selectores E2E

La prueba de categorías encontró dos enlaces iguales porque el loop renderiza una copia normal y otra con `aria-hidden="true"`. En React, `aria-hidden={false}` omite el atributo; en Playwright, seleccionar la primera copia o excluir explícitamente `[aria-hidden="true"]`. Como el enlace se mueve con el auto-scroll, disparar `mouseover` sobre el carril para activar la pausa y recién entonces ejecutar el clic; `hover()` también espera estabilidad y no puede entrar sobre un elemento que sigue moviéndose.

## 2026-08-24 — Mantener los E2E alineados con la estructura comercial vigente

La suite visual falló porque todavía buscaba el CTA y la grilla de seis ganadores del diseño anterior, y `getByLabel("Buscar")` se volvió ambiguo al incorporar el buscador global. Después de cambios comerciales, actualizar los E2E para usar roles/nombres exactos y selectores de la sección vigente; no fijar componentes retirados como contrato permanente.

## 2026-08-24 — Hostinger puede no responder temporalmente a ssh-keyscan

El primer deploy agotó cinco intentos de `ssh-keyscan` aunque compilación y separación habían aprobado. Reejecutar el job fallido antes de tocar código o credenciales: el segundo intento conectó y publicó correctamente sin cambios adicionales.

## 2026-08-24 — Bloquear acciones que dependen de una confirmación asíncrona

El E2E pudo enviar el checkout inmediatamente después de confirmar el retiro, antes de que React aplicara `shipping = 0`, y mostró un error aunque la confirmación visual apareció después. Si una acción depende de estado asíncrono previo, mantener el botón siguiente deshabilitado hasta que ese estado esté confirmado; en la prueba, esperar también la señal visible correspondiente.

## 2026-08-24 — Esperar la navegación de login antes de abrir una ruta protegida

Una prueba aislada aprobaba pero falló al correr en paralelo porque hacía `goto('/admin/productos')` inmediatamente después del clic de ingreso. Esperar explícitamente la URL `/admin` antes de navegar a otra ruta protegida, para no competir con la escritura asíncrona de la sesión.

## 2026-08-28 — El token GitHub actual no puede modificar workflows

Un push de la integración de cuentas fue rechazado porque el commit incluía `.github/workflows/deploy-hostinger.yml` y la credencial OAuth no tiene scope `workflow`. No ampliar ni reemplazar credenciales por este motivo: separar el cambio funcional del ajuste de workflow, publicar la rama sin ese archivo y dejar la variable de build como paso explícito para una credencial autorizada.

## 2026-08-28 — Un worktree nuevo no comparte `node_modules`

La validación de la rama de cuentas falló con `vitest: not found` porque el worktree temporal no tenía dependencias instaladas. Antes de ejecutar tests o builds en un worktree nuevo, correr `npm ci`; no asumir que reutiliza el `node_modules` de otra copia del repositorio.

## 2026-08-28 — Este proyecto no define `npm run typecheck`

La cadena de validación se detuvo después de 240 tests correctos porque `package.json` no tiene un script `typecheck`. En Litoral Maq, verificar TypeScript con `npx tsc --noEmit` y después continuar con `npm run lint` y los builds; revisar los scripts antes de encadenar comandos largos.

## 2026-08-31 — Esperar la finalización real de `npm ci` antes de validar

El orquestador devolvió una sesión mientras `npm ci` seguía activo, pero se interpretó como finalización y se lanzaron TypeScript, ESLint y Vitest contra un `node_modules` incompleto. Una segunda instalación simultánea terminó en `ENOTEMPTY`. Si `exec_command` devuelve `session_id`, esperar esa sesión con `write_stdin` antes de iniciar otro proceso que lea o modifique dependencias; después comprobar `node_modules/.bin/{tsc,eslint,vitest}`.

## 2026-08-31 — Turbopack ignoró el alias configurado solo para Webpack

El build de Next 16 compiló correctamente, pero el control del artefacto encontró las credenciales demo porque `webpack.resolve.alias` no se aplica al bundler predeterminado. Configurar también `turbopack.resolveAlias` y verificar el JavaScript generado, no solo el resultado de compilación.
## 2026-09-04 — Estado derivado dentro de un efecto

- **Qué pasó:** el primer parche de recuperación calculaba el enlace del fragmento con `setState` sincrónico dentro de `useEffect`; el lint de React lo rechazó.
- **Qué hacer distinto:** para estado externo del navegador que también debe hidratar bien, usar `useSyncExternalStore` o derivar el valor durante el render, sin un efecto que copie estado.
## 2026-09-04 — Backticks dentro del cuerpo de un comando

- **Qué pasó:** al crear el PR, los backticks del texto se interpretaron como sustitución de comandos del shell y generaron un error, aunque el PR llegó a crearse.
- **Qué hacer distinto:** pasar textos de PR con comillas simples sin backticks o mediante un archivo preparado de forma segura; revisar luego el cuerpo publicado.
