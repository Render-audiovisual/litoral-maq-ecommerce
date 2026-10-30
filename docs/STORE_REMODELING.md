# Cierre temporal para migrar a Tiendanube

Pedido por el dueño el 30/10/2026. El DNS no se modifica con este cambio.

- `scripts/store-maintenance.mjs` reemplaza los HTML de **hostinger-ready** por
  el aviso, sin scripts, formularios ni botones de compra. Cubre enlaces profundos
  incluso si el hosting ignora rewrites. No modifica `admin-ready`.
- `.htaccess` sirve HTTP 503 y `Retry-After: 3600`, sin caché. Conserva el acceso
  a `/brand/`, validaciones de dominio y el redirect histórico del panel.
- `payment-create` devuelve `503 / STORE_MAINTENANCE` antes de acceder a Postgres
  o Mercado Pago. Se conserva el handler anterior para reapertura explícita.
- La migración `pause_store_for_tiendanube` agrega un trigger **before insert**
  que rechaza todos los pedidos nuevos, también vía REST o pestañas antiguas.
  No bloquea actualizaciones de pedidos previos ni notificaciones/webhooks.

## Límites

Las preferencias de Mercado Pago emitidas antes del cierre viven en Mercado Pago.
Este cambio no las cancela ni impide que un pago iniciado antes se confirme.
No borrar pedidos ni desactivar el webhook: los pagos anteriores deben seguir
conciliándose. Tampoco altera Tiendanube, sus pagos ni los DNS de Cloudflare.

## Reabrir (solo con autorización)

1. Migración nueva que quite `orders_block_during_remodeling` y la función.
2. Quitar la respuesta de mantenimiento en `payment-create`.
3. Cambiar `STORE_MAINTENANCE_ENABLED` a `false`, compilar y publicar.
4. Comprobar el checkout antes de habilitar ventas. Si el dominio ya está en
   Tiendanube, no reactivar la tienda anterior por accidente.
