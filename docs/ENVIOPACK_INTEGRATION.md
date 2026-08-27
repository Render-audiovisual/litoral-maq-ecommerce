# Integración Envíopack

## Estado

La integración está implementada y lista para activarse con credenciales reales.
No se incluye ninguna clave en el repositorio y no se crean envíos durante tests.

El frontend sigue siendo una exportación estática en Hostinger. Toda llamada a
Envíopack se ejecuta en Supabase Edge Functions.

## Arquitectura

- `shipping-quote`: autentica al comprador, relee productos en Postgres,
  valida peso/medidas, consulta Envíopack y persiste opciones con vencimiento.
- `shipping-create`: solo administradores; exige pago confirmado, reclama el
  pedido de forma única y reconcilia por `id_externo` antes de crear una guía.
- `shipping-label`: solo administradores; descarga PDF/JPG sin exponer tokens.
- `enviopack-webhook`: recibe `envio-procesado` y
  `envio-cambio-condicion`, responde en menos de cinco segundos y actualiza el
  pedido en segundo plano.
- `_shared/shipping/ShippingProvider`: contrato estable. Envíopack es el primer
  adaptador; un futuro `AndreaniProvider` implementará el mismo contrato.

## Reglas operativas iniciales

- Carriers habilitados por defecto: `oca,urbano`.
- Despacho inicial: sucursal (`S`) desde el depósito configurado.
- Máximo automático inicial por bulto: 35 kg y 40 × 40 × 40 cm.
- Si falta un dato embalado o se supera un límite, el checkout conserva la
  venta como `manual_quote`; nunca inventa peso, medidas, tarifa o plazo.
- La guía se crea solamente con `payment_status=approved`.
- Las cotizaciones vencen a las 24 horas por defecto. Si una tarifa vencida
  subió o desapareció, la creación se bloquea y exige recotizar.

## Secretos de Edge Functions

Configurar con `supabase secrets set` o desde el panel. Nunca usar prefijo
`NEXT_PUBLIC_` para estos valores:

```text
SHIPPING_PROVIDER=enviopack
ENVIOPACK_API_KEY=...
ENVIOPACK_SECRET_KEY=...
ENVIOPACK_DEPOT_ID=...
ENVIOPACK_WEBHOOK_SECRET=...
ENVIOPACK_ALLOWED_CARRIERS=oca,urbano
ENVIOPACK_DISPATCH_MODE=S
SHIPPING_PRICE_MARKUP_PERCENT=0
CORS_ALLOWED_ORIGINS=https://DOMINIO-TIENDA,https://DOMINIO-ADMIN
```

Opcionales:

```text
SHIPPING_AUTO_MAX_PACKAGES=99
SHIPPING_AUTO_MAX_WEIGHT_KG=35
SHIPPING_AUTO_MAX_HEIGHT_CM=40
SHIPPING_AUTO_MAX_WIDTH_CM=40
SHIPPING_AUTO_MAX_LENGTH_CM=40
SHIPPING_QUOTE_TTL_MINUTES=1440
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son provistos por Supabase a las
Edge Functions. La service role nunca debe entrar al bundle de Next.js.

## Activación

1. Aplicar migraciones, incluida `0007_shipping_enviopack.sql`.
2. Cargar secretos de las funciones.
3. Desplegar `shipping-quote`, `shipping-create`, `shipping-label` y
   `enviopack-webhook`.
4. Configurar en Envíopack la URL:
   `https://PROJECT.supabase.co/functions/v1/enviopack-webhook?token=SECRETO`.
5. Activar los eventos `envio-procesado` y `envio-cambio-condicion`.
6. Cargar y verificar peso/alto/ancho/largo embalados en tres productos reales.
7. Ejecutar las nueve cotizaciones desde CP 3400 y validar tarifa, carrier,
   plazo, domicilio/sucursal y límites.
8. Recién después compilar con `NEXT_PUBLIC_SHIPPING_ENABLED=true`.

## Pruebas de aceptación

- Producto sin medidas: cotización manual, sin llamada de creación.
- Producto permitido: opciones reales y cotización persistida.
- Precio manipulado en navegador: ignorado; la guía usa la fila persistida.
- Pago pendiente: `shipping-create` responde conflicto y no crea guía.
- Dos clics/reintentos: una sola fila por pedido y reconciliación por
  `id_externo` de Envíopack.
- Timeout después de crear pedido: el reintento recupera IDs antes de escribir.
- Webhook repetido: evento deduplicado y estado actualizado una vez.
- Etiqueta antes de estado procesado: bloqueada.
- Cliente: solo ve sus pedidos; etiqueta y creación: solo administrador.

## Pendientes externos para producción

- Credenciales API reales de Envíopack.
- ID del depósito configurado en Envíopack para Sáenz 1587 / origen operativo.
- Confirmación comercial de carriers y tarifas habilitados desde CP 3400.
- Peso y medidas embaladas del catálogo inicial.
- Aplicación y despliegue contra el proyecto Supabase real.
