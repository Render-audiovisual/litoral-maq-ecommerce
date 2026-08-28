# Litoral Maq · e-commerce MVP

MVP funcional de tienda y panel administrativo construido con Next.js. El
catálogo inicial contiene 460 productos importados de la planilla comercial
`Lista de precios - LitoralMaq`.

## Ejecutar

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

Acceso administrador de demostración (solo con el adaptador local; no corresponde a producción):

- Email: `admin@litoralmaq.com`
- Contraseña: `admin123`

## Validar

```bash
npm run lint
npm run build
npm run validate:catalog
```

La integración logística de Envíopack está documentada en
[`docs/ENVIOPACK_INTEGRATION.md`](./docs/ENVIOPACK_INTEGRATION.md). El frontend
continúa siendo estático; cotización, guía, etiqueta y webhook corren en
Supabase Edge Functions para no exponer credenciales.

## Preparar para Hostinger (tienda y administración por separado)

Desde la Etapa 6, tienda y administración se despliegan como dos artefactos
independientes, pensados para dos raíces de publicación separadas (dominio
principal + subdominio admin):

```bash
npm run build:hostinger   # tienda → hostinger-ready/
npm run build:admin       # administración → admin-ready/
npm run validate:separation
```

Subir el contenido de `hostinger-ready/` a `public_html` del dominio
principal, y el contenido de `admin-ready/` al document root del subdominio
admin — cada uno con su propio `.htaccess`. Ver [`HOSTINGER.md`](./HOSTINGER.md)
para el paso a paso completo, la configuración de dominios
(`NEXT_PUBLIC_STORE_DOMAIN` / `NEXT_PUBLIC_ADMIN_DOMAIN`), qué separación
está verificada y cuál no, y las limitaciones de esta versión sin base de
datos.

Para la prueba de navegador, iniciar la aplicación en el puerto 3111 y luego
ejecutar:

```bash
npm run dev -- --port 3111
npm run validate:e2e
```

La validación E2E recorre catálogo, filtros, carrito persistente, checkout,
registro, login, protección del panel, CRUD de productos, visibilidad pública,
pedidos y vistas de escritorio/celular.

La prueba integral de producción con dos clientes aislados y un administrador se ejecuta con:

```bash
PRIORITY6_ADMIN_EMAIL="..." PRIORITY6_ADMIN_PASSWORD="..." npm run validate:priority6
```

Las credenciales se pasan únicamente por entorno y no se guardan en el repositorio. Para comprobar primero el circuito real de los dos clientes sin operar el panel se puede usar `npm run validate:priority6 -- --customers-only`.

## Datos simulados

Mientras no haya servicios reales, productos editados, carrito, sesiones,
clientes y pedidos se guardan en `localStorage`. Esto permite probar el MVP de
punta a punta en un navegador, pero no sincroniza información entre dispositivos.

Los 460 códigos, nombres y precios son reales y provienen del Sheet. Stock,
categorías, marcas, imágenes asociadas, productos destacados y descripciones son
datos iniciales simulados o inferidos.

## Adaptadores preparados

Las interfaces están en `src/services/adapters.ts` y las implementaciones demo
en `src/services/mock.ts`.

- Autenticación: sustituir `mockAuthAdapter` por el proveedor real y proteger
  rutas en servidor.
- Base de datos: implementar `DatabaseAdapter` y reemplazar `localStorage`.
- Mercado Pago: sustituir `mockPaymentAdapter`; agregar preferencia, retorno y
  webhook.
- Envíos: Envíopack implementado como primer proveedor detrás de un contrato
  desacoplado; Andreani puede agregarse como otro adaptador sin cambiar checkout.
- Imágenes: sustituir `mockImageStorageAdapter` por S3, Cloudinary o equivalente.
- Google Sheets: sustituir `mockSheetSyncAdapter` por sincronización autenticada.

El análisis completo para llevar pagos, pedidos, envíos, stock, imágenes y
notificaciones a producción está en
[`docs/PLAN_CONEXIONES_PRODUCCION.md`](./docs/PLAN_CONEXIONES_PRODUCCION.md).

Las cuentas de cliente (compra como invitado, conversión a cuenta
permanente, Google, emails transaccionales y captcha) tienen su propia guía
con los pasos manuales exactos en
[`docs/CUENTAS_DE_CLIENTE.md`](./docs/CUENTAS_DE_CLIENTE.md).

Copiar `.env.example` a `.env.local` y completar únicamente las credenciales
del servicio que se vaya conectando.

## Importación del catálogo

`npm run import:sheet` descarga el CSV público y regenera:

- `src/data/products.json`
- `src/data/import-report.json`

`npm run validate:catalog` compara nuevamente las 460 filas comerciales del
Sheet con el JSON importado y falla ante diferencias, datos inválidos o pérdidas.
