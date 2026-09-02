# Catálogo productivo y correos operativos

Estado preparado: 2026-08-28.

## 1. Fuente de verdad del catálogo

- Google Sheet define código, nombre, precio y presencia comercial.
- Presente en Sheet significa disponibilidad administrada por Litoral; no significa una cantidad física inventada.
- El panel conserva imagen, descripción, marca, categoría, visibilidad, datos logísticos y `purchase_limit`.
- Un producto nuevo entra oculto. Uno ausente del Sheet se conserva como histórico con `active=false` y `sheet-absent`.
- Límite predeterminado: **3 unidades por producto y pedido**. El administrador puede cambiarlo entre 1 y 99 en la ficha.
- El límite se aplica en la UI, checkout, función de Mercado Pago y trigger de Postgres. Manipular el navegador no lo saltea.

### Auditoría actual

```bash
npm run import:sheet
npm run prepare:products-migration
npm run validate:catalog
```

Resultado esperado del validador: `verdict: PASS`, sin códigos duplicados, filas inválidas ni diferencias de nombre/precio.

## 2. Activación en Supabase

1. Ejecutar completa la migración `supabase/migrations/0010_catalog_limits_order_notifications.sql` en SQL Editor.
2. Ejecutar completa la migración `supabase/migrations/20260831160000_server_catalog_sync.sql`.
3. Desplegar `admin-sync-products` con `npx supabase functions deploy admin-sync-products --project-ref bhtaecnzpuotlsenbdlz`.
4. Desde el panel administrativo, abrir **Productos** y tocar **Actualizar desde Sheet**. El navegador llama únicamente a la Edge Function autenticada; Google Sheets se consulta desde el servidor. El RPC aplica todo en una transacción, conserva las fichas verificadas y agrega los productos nuevos como ocultos.
5. Confirmar en el mensaje del panel total, nuevos, actualizados, sin cambios y retirados. No usar `DELETE` ni `TRUNCATE` manual.

Si Google no responde, cambian los encabezados, hay filas inválidas/duplicadas o llegan menos de 100 productos, la operación se cancela antes de escribir y el catálogo anterior queda intacto. Cada intento queda registrado en `catalog_sync_runs` con fecha, resultado y detalle técnico.

La migración agrega el límite por compra, el estado `listo`, una outbox privada y triggers idempotentes. No envía correos por sí sola hasta desplegar la función y cargar el secreto.

## 3. Correos operativos

Eventos cubiertos:

- cliente: pedido recibido;
- equipo: pedido nuevo;
- cliente: pago aprobado o rechazado;
- cliente: pedido preparado (`listo`);
- cliente: pedido enviado, con tracking cuando exista;
- cliente: pedido entregado.

Los cambios crean primero un evento en `order_notification_outbox`. La función toma eventos con bloqueo `SKIP LOCKED`, usa `Idempotency-Key` de Resend y reintenta con espera progresiva. Un webhook repetido no duplica el correo.

### Secretos de Edge Functions

Crear una API key de Resend con permiso **Sending access** y cargarla directamente en Supabase; nunca en Git ni en variables `NEXT_PUBLIC_*`.

```text
RESEND_API_KEY=<secreto>
RESEND_FROM_EMAIL=Litoral Maq <pedidos@litoralmaq.com>
LITORAL_ORDERS_EMAIL=<correo operativo que recibe pedidos nuevos>
STORE_PUBLIC_URL=https://litoralmaq.com
ADMIN_PUBLIC_URL=https://admin.litoralmaq.com
ORDER_NOTIFICATIONS_CRON_SECRET=<cadena aleatoria de al menos 24 caracteres>
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son secretos provistos por Supabase a las Edge Functions. No copiarlos al navegador.

### Despliegue

Con el CLI autenticado y vinculado al proyecto `bhtaecnzpuotlsenbdlz`:

```bash
npx supabase functions deploy order-notifications --project-ref bhtaecnzpuotlsenbdlz
npx supabase functions deploy mercado-pago-webhook --project-ref bhtaecnzpuotlsenbdlz
npx supabase functions deploy enviopack-webhook --project-ref bhtaecnzpuotlsenbdlz
npx supabase functions deploy payment-create --project-ref bhtaecnzpuotlsenbdlz
```

Los últimos tres despliegues incorporan el límite y el disparo de correos a los webhooks ya preparados. Mantener Mercado Pago y Envíopack apagados hasta sus pruebas específicas.

### Reintento automático

En **Supabase → Integrations → Cron**, crear una invocación HTTP cada 5 minutos a:

```text
https://bhtaecnzpuotlsenbdlz.supabase.co/functions/v1/order-notifications
```

Usar método `POST`, body `{}` y el header privado:

```text
x-order-notifications-secret: <mismo valor de ORDER_NOTIFICATIONS_CRON_SECRET>
```

El secreto debe quedar guardado en Supabase, nunca en Git ni en el navegador. El cron reclama como máximo 25 eventos por corrida; los eventos trabados vuelven a estar disponibles a los 10 minutos y los fallidos usan espera progresiva hasta ocho intentos. El botón del panel queda como recuperación manual para un administrador.

## 4. Prueba previa al punto 5

Usar un pedido de QA, no uno real:

1. Crear una solicitud con un email controlado y comprobar un solo correo de recepción.
2. Verificar un solo aviso al correo operativo de Litoral.
3. Marcar pago `rejected`, luego `approved`; debe llegar un correo por cada transición.
4. Cambiar el pedido a `listo`, `enviado` y `entregado`; comprobar asunto, contenido y tracking.
5. Repetir el mismo estado y tocar **Reintentar correos pendientes**; no debe duplicarse ningún mensaje.
6. Intentar 4 unidades de un producto con límite 3 desde UI y mediante request manipulado; ambos deben rechazarse.
7. Revisar `order_notification_outbox`: todos los eventos deben quedar `sent`, con `provider_message_id` y sin `last_error`.

Documentación primaria: [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Supabase Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets), [Supabase Deploy to Production](https://supabase.com/docs/guides/functions/deploy).
