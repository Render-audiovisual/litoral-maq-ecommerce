# Integración OCA ePak

## Estado

Código completo y probado contra el ambiente **QA** de OCA (cotizar, sucursales,
crear envío, etiqueta PDF, seguimiento, anular). Falta cargar credenciales
reales de producción y activar `NEXT_PUBLIC_SHIPPING_ENABLED`.
Envíopack fue descartado y su código se eliminó.

El frontend sigue siendo estático. Toda llamada a OCA corre en Supabase Edge
Functions; las credenciales nunca llegan al navegador.

## Arquitectura

- `shipping-quote`: autentica al comprador, relee productos y precios en
  Postgres, valida peso/medidas, cotiza con OCA y guarda las opciones con
  vencimiento. Si algo no se puede cotizar, el checkout cae a "cotización manual".
- `shipping-create` (admin): exige pago aprobado, reserva el envío de forma
  única por pedido y crea la orden de retiro en OCA (`remito` = n.º de pedido).
- `shipping-label` (admin): descarga la etiqueta PDF sin exponer credenciales.
- `shipping-refresh` (admin): consulta el seguimiento de OCA y actualiza el
  estado del pedido. OCA no ofrece webhooks, por eso es a pedido (botón
  "Actualizar seguimiento" en Admin → Pedidos).
- `_shared/shipping/ShippingProvider`: contrato estable. `oca.ts` es el
  adaptador; `oca-xml.ts` arma/parsea el XML (puro, con tests).

Web services de ePak usados (`Oep_TrackEPak.asmx`): `Tarifar_Envio_Corporativo`,
`GetCentrosImposicionConServiciosByCP`, `IngresoORMultiplesRetiros_v2`,
`GetPdfDeEtiquetasPorOrdenOrNumeroEnvio`, `Tracking_PiezaNumeroEnvio`,
`AnularOrdenGenerada`.

## Servicios

| Entrega al cliente | Operativa (variable) | Cotización |
|---|---|---|
| A domicilio | puerta a puerta (`OCA_OPERATIVA_DOMICILIO`) | una opción |
| A sucursal | puerta a sucursal (`OCA_OPERATIVA_SUCURSAL`) | una opción por sucursal OCA con servicio de entrega en el CP (máx. 10) |

El paquete siempre se **retira en el depósito** (Sáenz 1587, Corrientes). Si se
prefiere llevarlo a una sucursal OCA, hay que usar otras operativas y completar
`idcentroimposicionorigen` en `oca-xml.ts`.

## Secretos de Edge Functions

Cargar con `supabase secrets set`. Nunca con prefijo `NEXT_PUBLIC_`.

```text
SHIPPING_PROVIDER=oca
OCA_ENV=qa            # "qa" o "prod". Sin default a propósito.
OCA_CUIT=30-71888320-9
OCA_ACCOUNT=...       # n.º de cuenta ePak (ej. 111757/001 en QA)
OCA_USER=...          # usuario ePak (mail)
OCA_PASSWORD=...
OCA_OPERATIVA_DOMICILIO=...   # n.º de operativa puerta a puerta
OCA_OPERATIVA_SUCURSAL=...    # n.º de operativa puerta a sucursal
OCA_COST_CENTER=...   # de GetCentroCostoPorOperativa
CORS_ALLOWED_ORIGINS=https://DOMINIO-TIENDA,https://DOMINIO-ADMIN
```

Opcionales (defaults entre paréntesis):

```text
OCA_PICKUP_SLOT=1             # 1 = 8-17, 2 = 8-12, 3 = 14-17 (1)
OCA_INSURED=false             # true solo si la operativa lleva Seguro OCA (false)
OCA_ORIGIN_STREET/NUMBER/POSTAL_CODE/LOCALITY/PROVINCE   (Saenz/1587/3400/Corrientes/Corrientes)
OCA_ORIGIN_CONTACT / OCA_ORIGIN_EMAIL                    (Litoral Maq / maqlitoral@gmail.com)
SHIPPING_AUTO_MAX_WEIGHT_KG / _HEIGHT_CM / _WIDTH_CM / _LENGTH_CM / _PACKAGES
SHIPPING_QUOTE_TTL_MINUTES=1440
```

### Datos de prueba públicos de OCA (QA)

Usuario `test@oca.com.ar`, clave `123456`, cuenta `111757/001`, CUIT
`30-53625919-4`, centro de costo `1`, operativas: puerta a puerta `64665`,
puerta a sucursal `62342`. En QA el retiro de prueba sale de Lanús (CP 1824):
usar `OCA_ORIGIN_*` acorde si se quiere un envío de prueba que OCA acepte.

## Activación

1. Aplicar migraciones (las tablas de `0007_shipping_enviopack.sql` siguen
   siendo válidas: guardan `provider`; no se renombran para no tocar producción).
2. Cargar secretos con `OCA_ENV=qa` y los datos de prueba.
3. Desplegar `shipping-quote`, `shipping-create`, `shipping-label`,
   `shipping-refresh`.
4. Cargar peso/alto/ancho/largo embalados en productos reales (Admin → Productos).
5. Probar con `NEXT_PUBLIC_SHIPPING_ENABLED=true` en un build de staging:
   cotizar, pagar en sandbox, crear guía, bajar etiqueta, actualizar seguimiento.
6. Cuando OCA entregue credenciales reales: cambiar secretos y `OCA_ENV=prod`,
   y repetir la prueba con un pedido real de bajo monto.

## Pendiente de confirmar con OCA

- Si la tarifa de `Tarifar_Envio_Corporativo` incluye **IVA** (el checkout
  muestra el monto tal cual lo devuelve OCA).
- Peso y medidas máximas por bulto y por servicio. Los límites automáticos hoy
  son los heredados: 35 kg y 40×40×40 cm (se ajustan con `SHIPPING_AUTO_MAX_*`).
- Si las operativas llevan seguro (`OCA_INSURED`) y cómo se factura.
- Reintentos: si `shipping-create` da timeout, la orden pudo crearse igual en
  OCA. Antes de reintentar, buscar el remito (n.º de pedido `LM-…`) en ePak.
