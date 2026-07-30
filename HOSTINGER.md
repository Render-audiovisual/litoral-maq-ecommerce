# Publicar en Hostinger

Este MVP se puede alojar como un sitio estático. No necesita Node.js, PHP ni
una base de datos mientras continúe usando los flujos simulados del navegador.

## Opción rápida

1. Ejecutar `npm install`.
2. Ejecutar `npm run build:hostinger`.
3. Opcional: ejecutar `npm run preview:hostinger` y abrir
   `http://localhost:3111` para revisar exactamente la salida exportada.
4. Abrir la carpeta `hostinger-ready`.
5. Subir **el contenido de esa carpeta** a `public_html` desde el Administrador
   de archivos de Hostinger.
6. Conservar el archivo oculto `.htaccess`; es necesario para que rutas como
   `/admin`, `/productos` y las fichas individuales funcionen sin `.html`.

Si `public_html` contiene una web anterior, hacer una copia antes de reemplazar
archivos. No subir `node_modules`, `src`, `.git` ni credenciales.

## Modificar el código

El código editable está en:

- `src/app`: páginas y rutas.
- `src/components`: componentes compartidos.
- `src/store`: carrito, sesión, catálogo y persistencia demo.
- `src/services`: adaptadores para las conexiones futuras.
- `src/data/products.json`: catálogo inicial.
- `public`: imágenes y recursos públicos.

Después de cada modificación, volver a ejecutar:

```bash
npm run lint
npm run validate:catalog
npm run build:hostinger
```

Luego reemplazar en `public_html` el contenido por la nueva salida de
`hostinger-ready`.

## Importante sobre esta versión

- Productos, carrito, usuarios, pedidos y cambios del administrador se guardan
  en `localStorage`.
- Los cambios existen solamente en el navegador y dispositivo donde se hicieron.
- Para una tienda productiva multiusuario hay que conectar base de datos,
  autenticación segura, Mercado Pago, envíos, imágenes y Google Sheets.
- Las variables previstas están documentadas en `.env.example`; no deben
  publicarse claves reales dentro del ZIP ni de `public_html`.
