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

## Tutorial operativo para la visita a Litoral

### 1. Preparar Mercado Pago sin exponer claves

1. El dueño de la cuenta vendedora inicia sesión en Mercado Pago Developers.
2. Abrir `Tus integraciones` y crear una aplicación para **Checkout Pro** con
   el nombre `Litoral Maq Ecommerce`.
3. Confirmar que la aplicación pertenece a la cuenta que efectivamente recibirá
   el dinero. No usar la cuenta personal de un desarrollador.
4. Abrir `Credenciales de prueba`. Copiar el **Access Token** únicamente para
   pegarlo en Supabase; no enviarlo por Telegram, WhatsApp ni correo.
5. Anotar el `ID de usuario` de la aplicación para `MP_COLLECTOR_ID`.

Checkpoint: capturar solo el nombre de la aplicación y la pantalla general, con
las credenciales ocultas.

### 2. Configurar Webhooks

En `Tus integraciones → Litoral Maq Ecommerce → Webhooks`:

1. Agregar la URL de prueba y producción:
   `https://bhtaecnzpuotlsenbdlz.supabase.co/functions/v1/mercado-pago-webhook`
2. Seleccionar únicamente el evento **Pagos**.
3. Guardar y copiar la clave secreta generada para pegarla como
   `MP_WEBHOOK_SECRET` en Supabase.
4. Si Mercado Pago ofrece una simulación, enviarla recién después de desplegar
   la función. Una firma incorrecta debe responder `401`; la firma real debe
   aceptarse.

### 3. Preparar Supabase

1. Ejecutar una sola vez `supabase/migrations/0008_mercado_pago_checkout.sql`
   en `SQL Editor`. El resultado esperado es `Success. No rows returned`.
2. Desplegar `payment-create` con verificación JWT y
   `mercado-pago-webhook` sin verificación JWT de Supabase. El webhook valida
   la firma propia de Mercado Pago antes de consultar el pago.
3. Cargar en `Edge Functions → Secrets`:

```text
MP_ACCESS_TOKEN=<access token de prueba>
MP_WEBHOOK_SECRET=<secreto del webhook>
MP_COLLECTOR_ID=<ID de usuario vendedor>
STORE_PUBLIC_URL=https://litoralmaq.com
MP_USE_SANDBOX=true
MP_MAX_INSTALLMENTS=12
CORS_ALLOWED_ORIGINS=https://litoralmaq.com,https://www.litoralmaq.com,https://admin.litoralmaq.com
```

Checkpoint: mostrar solo los nombres de los secretos y que están guardados;
nunca sus valores.

### 4. Elegir el producto de prueba

Antes de cobrar, abrir el producto en el panel de Litoral y confirmar:

- precio real y vigente;
- producto activo;
- al menos 3 unidades de stock real;
- que `stock` ya no figure como dato incompleto.

La función de pago rechaza cualquier producto con stock no verificado aunque el
catálogo lo muestre como disponible. Es una protección deliberada: no activar
Mercado Pago para todo el público hasta definir el stock o el máximo vendible de
todo el catálogo.

### 5. Hacer pruebas controladas

Mantener `MP_USE_SANDBOX=true`. Usar una cuenta de prueba **comprador**, nunca
la misma cuenta vendedora, y abrir la tienda en incógnito.

Tarjeta de crédito Visa de prueba:

```text
Número: 4509 9535 6623 3704
Vencimiento: 11/30
CVV: 123
Documento para aprobado/rechazado: DNI 12345678
```

Ejecutar tres pedidos diferentes cambiando el nombre del titular:

- `APRO`: pago aprobado;
- `CONT`: pago pendiente;
- `OTHE`: pago rechazado por error general.

Después de cada prueba verificar en Mercado Pago, Supabase y el panel:

- el mismo `order_id` en orden, pago y referencia externa;
- importe recalculado desde la base, sin aceptar el precio del navegador;
- estado correcto (`approved`, `pending` o `rejected`);
- un webhook duplicado no duplica pago, orden ni evento;
- el retorno del navegador por sí solo no aprueba el pedido;
- la orden aprobada cambia una única vez.

### 6. Pasar a producción

Solo después de aprobar las tres pruebas:

1. Activar credenciales productivas en Mercado Pago con el sitio HTTPS real.
2. Reemplazar en Supabase únicamente `MP_ACCESS_TOKEN` por el productivo.
3. Mantener el mismo webhook de pagos y comprobar que la clave de firma
   productiva sea la guardada como `MP_WEBHOOK_SECRET`.
4. Cambiar `MP_USE_SANDBOX=false`.
5. Hacer una compra real controlada de importe bajo y comprobar acreditación,
   webhook, panel y correo.
6. Recién con esa compra aprobada pedir el cambio técnico controlado a
   `NEXT_PUBLIC_MERCADO_PAGO_ENABLED=true` y ejecutar el workflow. Hasta ese
   momento la variable debe seguir ausente o en `false`.

No usar la Public Key en el frontend: Checkout Pro se inicia desde una
preferencia creada exclusivamente por la Edge Function.

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
