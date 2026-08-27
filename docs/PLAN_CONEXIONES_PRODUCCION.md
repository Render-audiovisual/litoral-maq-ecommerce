# Plan de conexiones para producción — Litoral Maq

Documento de trabajo para Agus, Chobi y el equipo técnico.

## 1. Resumen ejecutivo

La interfaz de la tienda, el catálogo, el carrito y el panel administrativo ya
están desarrollados, pero varias funciones todavía operan en modo demostración.
El paso siguiente no es solamente "poner una clave de Mercado Pago": hay que
incorporar un backend seguro que conecte pagos, pedidos, stock, envíos y
notificaciones sin exponer credenciales en el navegador.

La arquitectura recomendada es:

```text
Tienda y admin estáticos (Hostinger)
              │
              ▼
Supabase Auth + Postgres + Storage
              │
              ▼
Supabase Edge Functions (backend seguro)
       ├── Mercado Pago Checkout Pro
       ├── Zipnova / operador logístico
       ├── Google Sheets
       └── email / WhatsApp transaccional
```

Hostinger seguirá alojando el frontend. Supabase guardará los datos compartidos
y ejecutará las funciones que necesitan secretos o recibir webhooks. No hace
falta mover la interfaz a otro hosting.

## 2. Estado actual verificado

### Ya funciona

- Catálogo público, búsqueda, filtros, categorías y fichas de producto.
- Carrito persistente en el navegador.
- Checkout visual con datos de contacto, envío o retiro.
- Panel de productos, clientes y pedidos en modo demostración.
- Sincronización manual desde el Google Sheet real.
- Adaptadores iniciales y migraciones de Supabase versionados en el repositorio.
- Tienda y administración preparadas como artefactos estáticos para Hostinger.

### Sigue simulado o incompleto

- Los pedidos, clientes y cambios del admin se guardan principalmente en
  `localStorage`; no son compartidos entre navegadores o dominios.
- El botón de Mercado Pago no crea un cobro real.
- El costo de envío es una regla fija de prueba.
- No se crea guía, etiqueta ni tracking logístico.
- No hay webhook que confirme pagos o movimientos del envío.
- No hay reserva transaccional de stock.
- Las imágenes todavía no usan un almacenamiento administrable.
- El acceso admin de demo no debe llegar a producción.
- El Google Sheet actual no contiene todos los datos logísticos requeridos.

## 3. Decisión de arquitectura

El proyecto usa `output: "export"`, por lo que lo publicado en Hostinger es
HTML, JavaScript y assets estáticos. Eso es correcto para el frontend, pero un
sitio estático no puede guardar de forma segura un `MP_ACCESS_TOKEN`, claves de
correo o claves logísticas, ni recibir y validar webhooks.

Por eso se propone:

1. **Hostinger:** tienda pública y panel administrativo estáticos.
2. **Supabase Postgres:** productos, perfiles, pedidos, pagos, envíos y auditoría.
3. **Supabase Auth:** clientes invitados/registrados y administradores reales.
4. **Supabase Storage:** imágenes de productos y documentación que corresponda.
5. **Supabase Edge Functions:** endpoints de checkout, Mercado Pago, logística,
   sincronización y notificaciones.
6. **RLS:** cada comprador ve solamente sus pedidos; los administradores ven y
   operan todo lo autorizado.

Las Edge Functions están diseñadas para integraciones con terceros y recepción
de webhooks. Los secretos se guardan en el proyecto y nunca se publican en el
bundle del navegador:

- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/functions/secrets

## 4. Flujo final de compra

```text
1. Cliente arma carrito
2. Completa contacto y entrega
3. Backend recalcula productos, precios, stock y envío
4. Se muestra revisión final
5. Backend crea pedido pendiente + preferencia de Mercado Pago
6. Cliente paga en Mercado Pago
7. Mercado Pago llama al webhook
8. Backend valida firma y consulta el pago en la API
9. Si está aprobado: confirma pedido y stock
10. Backend crea el envío y obtiene etiqueta/tracking
11. Cliente y admin reciben la actualización
```

La vuelta del cliente desde Mercado Pago sirve para mostrar una pantalla, pero
**no confirma el pago**. La fuente de verdad será el webhook validado y la
consulta servidor a servidor a Mercado Pago.

## 5. Conexión con Supabase

### 5.1 Preparación

1. Crear un proyecto productivo de Supabase propiedad de Litoral o RENDER.
2. Definir responsables y activar segundo factor en las cuentas con acceso.
3. Aplicar y revisar las migraciones de `supabase/migrations/`.
4. Cargar el catálogo inicial con el seed versionado.
5. Configurar en el build de Hostinger únicamente variables públicas:

```text
NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_STORE_DOMAIN=...
NEXT_PUBLIC_ADMIN_DOMAIN=...
```

6. Guardar las claves privadas solamente como secretos de Edge Functions.
7. Crear el primer usuario real y promoverlo a `admin` con el script seguro del
   repositorio. Eliminar el acceso demo `admin123` del build productivo.

### 5.2 Ajustes de base de datos necesarios

El esquema actual es una base útil, pero antes de cobrar hay que ampliarlo:

- `orders`: subtotal, descuentos, moneda, teléfono, código postal, localidad,
  provincia, dirección normalizada, estado de pago, estado logístico y timestamps.
- `order_items`: snapshot inmutable de código, nombre, precio unitario y cantidad.
  No conviene depender del precio actual del producto después de la compra.
- `payments`: proveedor, `preference_id`, `payment_id`, importe, estado,
  `external_reference`, payload mínimo auditado y fechas.
- `payment_events`: eventos idempotentes de webhooks para no procesarlos dos veces.
- `shipping_quotes`: cotización elegida, operador, modalidad, plazo y vencimiento.
- `shipments`: identificador externo, etiqueta, tracking y estado.
- `stock_reservations`: reservas con vencimiento cuando exista stock confiable.
- `integration_logs`: errores técnicos sin guardar secretos ni datos de tarjeta.

### 5.3 Autenticación

- Un comprador puede comprar como invitado usando sesión anónima de Supabase.
- Si luego crea una cuenta, se debe conservar el vínculo con sus pedidos.
- El admin usa Auth real; el rol vive en `profiles` y RLS decide el acceso.
- El frontend nunca recibe una clave con capacidad de saltar RLS.

## 6. Mercado Pago Checkout Pro

Se recomienda **Checkout Pro**: el comprador sale al entorno seguro de Mercado
Pago y puede pagar con los medios que la cuenta de Litoral tenga habilitados.
Mercado Pago exige crear una preferencia desde backend y devuelve el enlace de
checkout (`init_point`).

Documentación oficial:

- Crear preferencia: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/create-payment-preference
- API de preferencias: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/preferences/create-preference/post
- Webhooks: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/payment-notifications

### 6.1 Requisitos del cliente

- Cuenta vendedora de Mercado Pago de Litoral, validada y en condiciones de cobrar.
- Aplicación creada en "Tus integraciones".
- Credenciales de prueba y producción.
- Access Token productivo guardado como secreto, nunca enviado al frontend.
- Webhook secret generado en la configuración de notificaciones.
- Dominio final con HTTPS.
- Definición comercial de cuotas, medios aceptados y vencimiento de pagos.

### 6.2 Función `checkout-create`

La tienda enviará solamente IDs y cantidades, datos de entrega y la cotización
seleccionada. La Edge Function deberá:

1. Validar la sesión del comprador.
2. Leer precios y productos activos desde Postgres.
3. Recalcular el total; nunca confiar en el total enviado por el navegador.
4. Validar la cotización logística o volver a cotizar si venció.
5. Crear un pedido `pending_payment` con clave de idempotencia.
6. Crear una preferencia de Mercado Pago con:
   - ítems y cantidades;
   - costo de envío;
   - `external_reference` igual al ID interno del pedido;
   - URLs de éxito, pendiente y rechazo;
   - URL de notificación si se decide configurarla por transacción.
7. Guardar el `preference_id`.
8. Devolver `init_point` al frontend para redirigir al comprador.

### 6.3 Función `mercado-pago-webhook`

Debe ser pública para Mercado Pago, pero no insegura. La función deberá:

1. Leer `x-signature` y `x-request-id`.
2. Validar la firma HMAC con el secreto configurado.
3. Registrar el ID del evento con restricción única para idempotencia.
4. Consultar el pago directamente en la API de Mercado Pago.
5. Comparar importe, moneda, cuenta y `external_reference` con el pedido.
6. Traducir el estado externo al estado interno.
7. Confirmar el pedido solamente cuando la API informe `approved`.
8. Procesar repetidos sin duplicar stock, envío o notificaciones.
9. Responder rápido con HTTP 200 y dejar reintentos seguros.

Estados mínimos de pago internos:

- `pending`
- `approved`
- `rejected`
- `cancelled`
- `refunded`
- `charged_back`

### 6.4 Pantallas de retorno

- `/checkout/exito`: muestra "Estamos confirmando tu pago" hasta leer el estado
  real; nunca afirma aprobación por parámetros de URL.
- `/checkout/pendiente`: explica que el pago está en proceso.
- `/checkout/error`: conserva el carrito y permite reintentar.

El carrito no se vacía al crear la preferencia. Se marca como completado cuando
el backend confirma el pago o cuando la pantalla consulta un pedido aprobado.

### 6.5 Pruebas obligatorias

- Credenciales y compradores de prueba separados del vendedor.
- Pago aprobado, rechazado y pendiente.
- Cierre de pestaña antes de volver.
- Webhook repetido y recibido fuera de orden.
- Importe manipulado desde DevTools.
- Pedido sin stock o con precio cambiado.
- Reembolso total y contracargo.
- Caída temporal de Mercado Pago y reintento idempotente.

## 7. Envíos

### 7.1 Recomendación

La decisión vigente es **Envíopack como primer agregador multilogística**. La
integración implementada cotiza operadores habilitados desde Corrientes, crea el
pedido y el envío, descarga etiquetas y recibe tracking por webhook:

- https://developers.enviopack.com.ar/
- https://developers.enviopack.com.ar/cotiza-un-envio
- https://developers.enviopack.com.ar/realiza-un-envio
- https://developers.enviopack.com.ar/notificaciones

Si Litoral consigue tarifas directas mejores, el contrato interno
`ShippingAdapter` permitirá reemplazar o sumar un operador sin rehacer el
checkout.

Alternativas directas oficiales evaluadas:

- OCA e-Pak: cotización, sucursales, creación, etiquetas PDF/ZPL y tracking:
  https://developers.oca.com.ar/epak.html
- Correo Argentino PAQ.AR: integración e-commerce, órdenes, sucursales y
  seguimiento:
  https://www.correoargentino.com.ar/servicios/paqueteria/paqueteria-ecommerce-0
- Manual API 2.0 PAQ.AR:
  https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiPaqAr-v2.pdf

### 7.2 Información faltante en productos

No se puede cotizar un envío real únicamente con nombre y precio. El Sheet o la
base deben incorporar por producto:

- peso embalado en kg;
- alto, ancho y largo embalado en cm;
- cantidad de bultos;
- valor declarado;
- si admite envío normal;
- si requiere cotización manual por volumen/peso;
- stock real;
- opcional: tiempo de preparación.

También hace falta confirmar:

- código postal y dirección del depósito;
- horarios de retiro;
- modalidades habilitadas: domicilio, sucursal y retiro en local;
- política de envío gratis;
- recargo de embalaje si corresponde;
- zonas excluidas y productos no despachables.

### 7.3 Función `shipping-quote`

1. Recibe código postal y líneas del carrito.
2. Relee peso, medidas y precio desde la base.
3. Calcula bultos y valor declarado del pedido.
4. Consulta Envíopack con credenciales guardadas como secretos.
5. Normaliza cada opción: operador, domicilio/sucursal, precio y plazo.
6. Guarda una cotización con vencimiento y devuelve su ID al frontend.
7. Si el cliente elige sucursal, guarda el ID exacto devuelto por Envíopack.

No se debe aceptar un precio de envío enviado directamente por el navegador.

### 7.4 Función `shipping-create`

Se ejecuta una sola vez después del pago aprobado o después de la aprobación
manual del admin, según la política elegida:

1. Toma los datos validados del pedido.
2. Crea el envío con la cotización seleccionada.
3. Guarda ID externo, tracking, operador y documentación.
4. Expone la etiqueta al admin con acceso protegido.
5. Cambia el pedido a `shipping_created`, no directamente a `shipped`.

### 7.5 Tracking

Prioridad: webhook del proveedor si está disponible. Alternativa: tarea
programada que consulte envíos no entregados. Los estados externos se normalizan:

- `shipping_pending`
- `label_ready`
- `ready_to_dispatch`
- `in_transit`
- `delivery_attempt`
- `delivered`
- `returned`
- `shipping_cancelled`

## 8. Stock y Google Sheets

El Sheet puede seguir siendo la fuente operativa inicial de catálogo, pero la
tienda no debe depender de leerlo durante cada compra.

Flujo recomendado:

```text
Google Sheet → sincronización servidor → Postgres → tienda/checkout
```

- La sincronización debe ejecutarse desde una función admin autenticada.
- Debe validar códigos duplicados, precios inválidos y filas incompletas.
- Antes de aplicar cambios, debe guardar un resumen de altas, cambios y bajas.
- La compra toma precios y stock desde Postgres, nunca directamente del CSV.
- El Sheet necesita columna de stock si va a ser la fuente de stock.
- Las modificaciones manuales del admin y del Sheet necesitan una regla de
  precedencia clara para no pisarse.

### Política de stock recomendada

Mientras Litoral no cargue stock confiable, no prometer disponibilidad automática:
el pedido aprobado puede quedar `stock_to_confirm` para revisión.

Cuando el stock sea confiable:

1. Crear reserva transaccional al iniciar el pago.
2. Asignar vencimiento a la reserva.
3. Convertirla en descuento definitivo al aprobarse el pago.
4. Liberarla ante rechazo o vencimiento.
5. Definir qué hacer con medios de pago que pueden aprobarse tarde.

## 9. Imágenes y archivos

Se recomienda Supabase Storage para fotos de productos. El admin sube una imagen
a un bucket y la base guarda su URL; el frontend no conserva archivos como
`blob:` locales.

Pendientes:

- bucket público de productos o URLs firmadas según necesidad;
- límite de tamaño, MIME permitido y normalización de nombres;
- generación de miniaturas/WebP para no degradar móvil;
- permisos de escritura exclusivos para admin;
- política para eliminar archivos huérfanos.

Las etiquetas logísticas no deberían quedar en un bucket público sin control.

## 10. Notificaciones

Versión mínima recomendada:

- Email al comprador al aprobarse el pago.
- Email al comprador al despacharse con tracking.
- Aviso al equipo ante una compra nueva o un error que requiera intervención.

WhatsApp transaccional automático requiere una API oficial y plantillas aprobadas;
no se debe automatizar usando un WhatsApp personal. Puede dejarse para una etapa
posterior. El botón flotante comercial actual es independiente de este flujo.

## 11. Panel administrativo

El panel debe mostrar por separado:

- estado del pedido;
- estado del pago;
- estado del envío;
- importe y costo de envío;
- cliente y dirección;
- productos comprados como snapshot;
- referencia de Mercado Pago;
- operador y tracking;
- etiqueta descargable;
- historial/auditoría de cambios.

Acciones sensibles como cancelar, reembolsar o recrear un envío deben pedir
confirmación y ser idempotentes. En la primera versión, un reembolso puede abrir
el panel de Mercado Pago en vez de automatizarse hasta validar el proceso comercial.

## 12. Seguridad

- Ningún Access Token o secret debe usar prefijo `NEXT_PUBLIC_`.
- Nunca subir `.env`, tokens o payloads con datos sensibles a Git.
- Recalcular precios y envío en backend.
- Validar firma de webhooks y consultar el objeto real en la API.
- Usar restricciones únicas e idempotencia en pagos y envíos.
- Aplicar RLS y probar acceso cruzado entre usuarios.
- Rate limit para cotizaciones, checkout y login.
- Registrar errores sin números de tarjeta ni secretos.
- Activar 2FA para administradores y proveedores.
- Separar credenciales de prueba y producción.
- Tener backup y procedimiento de rollback antes del deploy final.

## 13. Observabilidad y soporte

- Alertas por fallo repetido de webhook.
- Vista de pedidos pagados sin envío creado.
- Vista de pagos pendientes fuera del plazo normal.
- Registro de sincronizaciones del Sheet.
- Sentry o equivalente para frontend y Edge Functions.
- Conciliación diaria entre pedidos aprobados y pagos de Mercado Pago.
- Conciliación entre envíos creados y pedidos pagados.

## 14. Orden de implementación

### Etapa A — Datos reales

1. Crear proyecto Supabase.
2. Revisar/aplicar migraciones y RLS.
3. Activar Auth real y admin real.
4. Migrar productos y habilitar persistencia compartida.
5. Probar tienda y admin desde dispositivos distintos.

**Criterio de salida:** productos, clientes y pedidos de prueba se ven igual en
todos los dispositivos autorizados.

### Etapa B — Checkout y Mercado Pago

1. Ampliar esquema de pedidos/pagos.
2. Agregar revisión final del pedido.
3. Crear `checkout-create`.
4. Crear y validar `mercado-pago-webhook`.
5. Implementar retornos de éxito, pendiente y error.
6. Probar escenarios e idempotencia con credenciales de prueba.

**Criterio de salida:** un pago de prueba aprobado genera un único pedido pagado,
aunque el webhook llegue repetido o el comprador cierre la pestaña.

### Etapa C — Envíos

1. Completar pesos/medidas y datos del depósito.
2. Abrir/configurar cuenta Zipnova o proveedor elegido.
3. Implementar `shipping-quote` y selección de sucursal.
4. Implementar `shipping-create`, etiqueta y tracking.
5. Probar domicilio, sucursal, retiro y producto no despachable.

**Criterio de salida:** un pedido pagado genera una sola guía válida y el tracking
se ve en admin y cuenta del comprador.

### Etapa D — Operación y producción

1. Storage real para imágenes.
2. Emails transaccionales.
3. Monitoreo, conciliación y auditoría.
4. Backups de Hostinger y base.
5. Deploy controlado, smoke tests y rollback documentado.
6. Rotar claves usadas durante pruebas antes de salir a producción.

## 15. Accesos y decisiones que debe conseguir el equipo

### Supabase

- Proyecto y organización propietarios.
- Invitación al desarrollador, no contraseña compartida.
- Región y política de backups.

### Mercado Pago

- Cuenta vendedora validada de Litoral.
- Aplicación en Tus integraciones.
- Credenciales de prueba y producción.
- Webhook secret.
- Definición de cuotas/medios de pago.

### Logística

- Elegir Zipnova o integración directa.
- Cuenta comercial y credenciales de prueba.
- Tarifas/convenio habilitados.
- Datos completos del depósito.
- Pesos y medidas del catálogo.

### Negocio

- Dirección y horario de retiro en local.
- Política de envío gratis.
- Política ante falta de stock.
- Plazo de preparación.
- Política de cambios, cancelaciones y devoluciones.
- Email remitente y destinatarios de alertas.

## 16. Qué no hacer

- No poner credenciales privadas en `.env` públicas de Hostinger.
- No crear pagos directamente desde JavaScript del navegador.
- No confiar en precios o totales enviados por el cliente.
- No marcar "pagado" solo porque el usuario vuelve a `/checkout/exito`.
- No crear múltiples envíos al reintentar un webhook.
- No descontar stock demo como si fuera stock real.
- No conectar tres correos a la vez antes de validar volumen, tarifas y operación.

## 17. Próximo paso concreto

El siguiente trabajo técnico debe ser **Etapa A: activar Supabase real y persistir
productos, clientes y pedidos entre dispositivos**. En paralelo, Litoral puede
abrir la aplicación de Mercado Pago y la cuenta logística, y completar en el
Sheet peso, medidas y stock. Recién con esa base validada conviene activar cobros
productivos.
