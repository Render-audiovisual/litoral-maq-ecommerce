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

Acceso administrador de demostración:

- Email: `admin@litoralmaq.com`
- Contraseña: `admin123`

## Validar

```bash
npm run lint
npm run build
npm run validate:catalog
```

## Preparar para Hostinger

```bash
npm run build:hostinger
```

La salida queda en `hostinger-ready/`. Subir el contenido de esa carpeta a
`public_html`, incluido el archivo oculto `.htaccess`. Ver
[`HOSTINGER.md`](./HOSTINGER.md) para el paso a paso y las limitaciones de esta
versión sin base de datos.

Para la prueba de navegador, iniciar la aplicación en el puerto 3111 y luego
ejecutar:

```bash
npm run dev -- --port 3111
npm run validate:e2e
```

La validación E2E recorre catálogo, filtros, carrito persistente, checkout,
registro, login, protección del panel, CRUD de productos, visibilidad pública,
pedidos y vistas de escritorio/celular.

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
- Envíos: sustituir `mockShippingAdapter`.
- Imágenes: sustituir `mockImageStorageAdapter` por S3, Cloudinary o equivalente.
- Google Sheets: sustituir `mockSheetSyncAdapter` por sincronización autenticada.

Copiar `.env.example` a `.env.local` y completar únicamente las credenciales
del servicio que se vaya conectando.

## Importación del catálogo

`npm run import:sheet` descarga el CSV público y regenera:

- `src/data/products.json`
- `src/data/import-report.json`

`npm run validate:catalog` compara nuevamente las 460 filas comerciales del
Sheet con el JSON importado y falla ante diferencias, datos inválidos o pérdidas.
