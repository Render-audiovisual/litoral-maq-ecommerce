# Auditoría de catálogo y sincronización

Fecha: 2026-08-27

## Estado validado

- Catálogo histórico conservado: 495 productos.
- Filas vigentes en Google Sheets: 473.
- Productos publicables: 54, todos con imagen exacta y descripción trazable.
- Productos ocultos: 441. No se eliminaron del catálogo.
- Disponibilidad: Litoral confirma que todo código presente en el Sheet tiene stock. Como no se informan cantidades, la tienda muestra disponibilidad gestionada por Sheet sin inventar unidades.
- Producto 3336 (`JT1012 3/8`): oculto porque la imagen encontrada corresponde al modelo de 1/2 pulgada.
- Seis fichas enriquecidas quedaron ocultas porque sus códigos ya no aparecen en la planilla vigente: 3505, 3665, 3667, 3654, 3780 y 3786.

## Correcciones aplicadas

1. El importador de despliegue conserva imágenes, descripciones, visibilidad y demás datos administrados.
2. Los productos nuevos entran ocultos hasta completar su ficha.
3. Los códigos ausentes del Sheet se conservan como borradores inactivos en vez de borrarse.
4. Las rutas estáticas se generan solamente para productos activos.
5. La portada omite familias sin productos publicables.
6. El seed de Supabase fue regenerado en modo dry-run, sin tocar producción.

## Flujo recomendado

1. Google Sheets mantiene código, nombre y precio.
2. El panel o el archivo de enriquecimiento mantiene imagen, descripción, marca, stock real y datos logísticos.
3. La sincronización muestra un diff antes de aplicar y nunca publica automáticamente un producto nuevo.
4. Un producto se activa solo después de verificar imagen, descripción y precio vigente; la presencia en el Sheet confirma su disponibilidad comercial.
5. Supabase recibe un upsert idempotente; los retiros comerciales se resuelven con `active=false`.

## Riesgos pendientes

- El catálogo de Git y el de Supabase pueden divergir si no se aplica el seed después de aprobar cambios.
- `replaceCatalog` realiza el upsert y la limpieza en operaciones separadas; una interrupción puede dejar una sincronización parcial.
- La disponibilidad es binaria: el Sheet no informa cantidades ni permite limitar unidades por pedido.
- Las imágenes todavía dependen de un proceso manual de búsqueda, validación y copia local.
- Las etiquetas “más vendidos” no cuentan con ventas históricas suficientes; por ahora son una selección editorial con fallback.

## Antes de publicar pagos

- Sincronizar los 495 registros contra Supabase y verificar 54 activos / 441 inactivos.
- Definir con Litoral si habrá un límite por pedido mientras el Sheet no informe cantidades.
- Hacer una preview del frontend y revisar portada, búsqueda, categorías, ficha, carrito y checkout.
