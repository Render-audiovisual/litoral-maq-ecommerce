# Fotos de productos

En Administración → Fotos de productos, abrir un grupo y seleccionar Agregar/Cambiar foto.
Se pueden elegir hasta tres archivos JPG, PNG o WebP de hasta 5 MB cada uno, desde computadora o galería móvil. La primera imagen es la principal. Es posible reemplazar un archivo, elegir otra principal o quitar una referencia. Guardar aplica únicamente los campos de imagen mediante el control de concurrencia existente.

## Almacenamiento

La función `admin-upload-product-photo` usa `verify_jwt=true` y la comprobación administrativa existente. No cambia Auth, profiles ni roles. Comprueba que exista el producto, limita tamaño y verifica firma binaria y tipo MIME. Guarda archivos con nombres aleatorios sin sobrescribir, en el bucket público `product-photos`, creado en la primera carga autorizada. No existen políticas nuevas que permitan escritura directa de clientes en Storage.

Las fotos de catálogo son públicas. No subir documentos personales. Cancelar o quitar una foto del producto no elimina el objeto almacenado: evita pérdidas, pero puede dejar archivos sin referencia. La limpieza futura requerirá una política separada y aprobación.

No aplicar migraciones SQL. Desplegar la nueva Edge Function antes del frontend. Los ajustes verify_jwt de funciones existentes y Mercado Pago permanecen intactos. Probar una carga autorizada con un producto acordado antes de anunciar la función como disponible en producción.

En modo local las imágenes se guardan como data URL solo en el navegador, no en Supabase. Los límites de espacio del navegador pueden impedir guardar imágenes grandes; el error conserva la versión previamente persistida.

## Verificación

- TypeScript, ESLint y validación de config.toml.
- Unitarias: límite 1–3, principal y preservación precio/stock.
- E2E local: agregar por enlace, subir dos archivos, límite de tres, cambiar principal, persistencia y móvil sin desbordamiento.
- La prueba local no verifica permisos ni Storage del proyecto de producción.
