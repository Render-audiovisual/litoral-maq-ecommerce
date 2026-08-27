# Mercado Pago Checkout Pro — activación segura

La implementación queda apagada por defecto. El frontend conserva el flujo de
solicitud manual mientras `NEXT_PUBLIC_MERCADO_PAGO_ENABLED=false`.

## Componentes

- `payment-create`: requiere JWT del comprador, vuelve a leer productos y
  precios desde Supabase, valida stock y cotización logística, crea la
  preferencia y devuelve exclusivamente la URL de Checkout Pro.
- `mercado-pago-webhook`: público para Mercado Pago, pero valida
  `x-signature` con HMAC, consulta el pago en la API y recién entonces actualiza
  la orden.
- `payments`: una preferencia idempotente por pedido.
- `payment_events`: historial mínimo e idempotente de notificaciones, sin datos
  de tarjeta ni secretos.

La URL de retorno del navegador nunca aprueba pagos. La fuente de verdad es
`GET /v1/payments/:id` después de validar el webhook.

## Secretos de Edge Functions

No usar prefijo `NEXT_PUBLIC_` para ninguno de estos valores:

```text
MP_ACCESS_TOKEN
MP_WEBHOOK_SECRET
MP_COLLECTOR_ID
STORE_PUBLIC_URL=https://<dominio-real-de-la-tienda>
MP_USE_SANDBOX=true
MP_MAX_INSTALLMENTS=12
CORS_ALLOWED_ORIGINS=https://<dominio-real-de-la-tienda>,https://<dominio-real-del-admin>
```

`MP_API_BASE_URL` existe solamente para pruebas controladas; en producción se
omite y se usa `https://api.mercadopago.com`.

## Reunión con el cliente

1. Ingresar en Mercado Pago Developers con la cuenta vendedora de Litoral Maq.
2. Crear una aplicación: Pagos online → desarrollo propio → Checkout Pro.
3. Activar credenciales de prueba. No copiar claves en chats ni documentos.
4. En `Tus integraciones → Webhooks`, configurar el evento **Pagos** para:
   `https://bhtaecnzpuotlsenbdlz.supabase.co/functions/v1/mercado-pago-webhook`.
5. Guardar el Access Token de prueba y el webhook secret directamente en los
   secretos del proyecto Supabase.
6. Confirmar el ID de usuario/collector de la cuenta y guardarlo como
   `MP_COLLECTOR_ID`.
7. Definir cantidad máxima de cuotas y medios que el comercio quiere aceptar.
8. Confirmar los dominios finales de tienda y administración antes de cargar
   `STORE_PUBLIC_URL` y `CORS_ALLOWED_ORIGINS`; no asumir que ya son
   `litoralmaq.com`.

## Pruebas antes de producción

1. Aplicar `0008_mercado_pago_checkout.sql` y desplegar las dos funciones.
2. Mantener `MP_USE_SANDBOX=true` y el flag público apagado durante la primera
   validación de backend.
3. Simular el webhook desde el panel: firma válida aceptada; firma falsa 401.
4. Activar el flag únicamente en una preview controlada y probar comprador de
   prueba separado del vendedor: aprobado, pendiente y rechazado.
5. Verificar reintento de preferencia, webhook duplicado, importe manipulado,
   carrito cerrado antes del retorno y ausencia de stock.
6. Confirmar que un pago aprobado actualiza una sola orden y nunca crea una guía
   logística por duplicado.
7. Activar credenciales productivas solo con cuenta verificada, HTTPS final y
   aprobación del cliente. Cambiar `MP_USE_SANDBOX=false`, repetir una compra
   controlada de importe bajo y recién después desplegar
   `NEXT_PUBLIC_MERCADO_PAGO_ENABLED=true` al sitio público.

## Rollback

Cambiar `NEXT_PUBLIC_MERCADO_PAGO_ENABLED=false` y volver a desplegar el
frontend. Las tablas y eventos se preservan para auditoría; no se borran pagos.
