# Edge Functions de Andreani

Capa server-side de la integración con Andreani. **Hoy está desactivada y no
se desplegó a ningún proyecto Supabase.**

## Estado actual

| Guarda | Valor por defecto | Efecto |
| --- | --- | --- |
| `ANDREANI_ENABLED` (secret) | `false` | Las tres Functions rechazan **toda** operación con 503. |
| `ANDREANI_MODE` (secret) | `mock` | Sin credenciales no hay llamadas reales. |
| `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS` (constante en `_shared/andreani.ts`) | `false` | Bloquea `qa`/`production` aunque haya credenciales. |
| `NEXT_PUBLIC_ANDREANI_UI` (bundle) | `false` | El panel admin no muestra ningún control. Solo UI, no seguridad. |

Las tres primeras son independientes: hay que prender las tres a propósito
para que exista una llamada real. La cuarta solo decide si se ve el botón.

## El fallo residual: respuesta ambigua de Andreani

El caso que **no** se puede resolver automáticamente hoy:

> Se envía la creación del preenvío y Andreani responde 5xx, o no responde
> (timeout). No sabemos si el envío se creó igual del lado de ellos.

Reintentar podría generar **un segundo envío real y un segundo cargo real**.
Por eso el pedido queda con `andreani_claim_state = 'created_unsaved'`, que
`decideShipmentClaim()` nunca reclama automáticamente, ni siquiera cuando
vence el TTL. Cualquier POST posterior sobre ese pedido responde 409.

Mismo tratamiento para el caso "Andreani respondió OK pero falló el guardado
del número en nuestra base".

### Runbook de revisión manual

1. Buscar el pedido en el panel de Andreani por su referencia
   (`idOrdenOrigen` = id del pedido, ej. `LM-12345678`).
2. **Si el envío existe**: cargar el número a mano en la fila del pedido
   (`andreani_shipment_number`) y limpiar `andreani_claim_state` a `NULL`.
   A partir de ahí el pedido queda idempotente (`existing`).
3. **Si el envío no existe**: limpiar solo `andreani_claim_state` a `NULL`.
   El pedido vuelve a quedar disponible para generarlo desde el panel.

### Qué haría falta para automatizarlo

Cualquiera de estas dos, a confirmar con Andreani (está en el pedido de
documentación pendiente):

- **Búsqueda por referencia externa**: poder consultar "¿existe un envío con
  `idOrdenOrigen = LM-12345678`?". Con eso, ante una respuesta ambigua se
  consulta y se resuelve solo.
- **Idempotency key**: que acepten una clave de idempotencia en la creación,
  de modo que reintentar la misma request nunca genere un segundo envío.

Es la pregunta 4 de la lista de abajo.

Hasta tener una de las dos confirmada **por escrito en la documentación
oficial**, la revisión manual se mantiene. No es una limitación del código:
es la única opción segura sin garantías del proveedor.

## Token: el vencimiento NO está asumido

No se hardcodea ninguna duración. `resolveTokenLifetime()` la deriva, en este
orden, de datos reales:

1. `expires_in` de la respuesta de login, si viene.
2. El claim `exp` del propio JWT, si el token es decodificable.
3. `ANDREANI_TOKEN_TTL_SECONDS`, una escotilla manual que **solo se acepta con
   `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS = true`** — mientras la spec siga
   TO VERIFY, configurar un TTL sería volver a inventar el número.
4. Nada de lo anterior → **no se cachea**: se pide un token nuevo en cada
   request. Es más lento, pero es lo único correcto sin el dato.

En los tres primeros casos se descuenta un margen de 60s para no usar un
token que venza en pleno vuelo. Un token ya vencido nunca se cachea.

**Pendiente de confirmación con Andreani**: duración exacta, mecanismo de
renovación, y si la respuesta informa `expires_in`.

## Etiqueta: referencia temporal con datos personales

La etiqueta contiene nombre y domicilio del destinatario, y **no está
confirmado que su URL sea permanente**. Por eso:

- `andreani_label_url` se guarda en el pedido solo para trazabilidad, y está
  revocada por columna para `anon`/`authenticated` (migración 0007). Un
  customer leyendo su propio pedido no la recibe.
- La respuesta de creación del envío **no** devuelve la URL: una URL
  potencialmente vencida invita a guardarla y compartirla.
- El panel admin la pide on-demand con `GET ?type=label`, que la resuelve
  contra Andreani en ese momento y responde con `Cache-Control: no-store`.
  La URL se abre y se descarta; no se guarda en el estado del cliente.

### Diseño recomendado cuando se confirme el comportamiento real

Según lo que responda Andreani, una de estas dos:

- **Si las etiquetas se pueden volver a solicitar**: mantener el esquema
  actual (resolver on-demand). Es el más simple y no guarda documentos con
  datos personales en ningún lado. Es la opción preferida.
- **Si la URL vence y la etiqueta NO se puede regenerar**: descargarla
  server-side desde la Edge Function apenas se crea el envío y guardarla en
  un bucket de Supabase Storage **privado** (nunca público). El panel accede
  con **signed URLs de vida corta** (orden de minutos), generadas por la
  Function en cada pedido. Nunca se expone la ruta del bucket ni una URL
  permanente. Retención acotada: borrar el archivo cuando el envío se
  entrega o pasado un plazo definido, porque es un documento con datos
  personales.

En ningún caso la etiqueta se sirve directamente a un cliente final.

## Preguntas abiertas al contacto comercial de Andreani

Bloquean la verificación de la spec y la automatización del fallo residual:

1. **Token**: duración exacta, mecanismo de renovación, y si la respuesta de
   login informa `expires_in`.
2. **Etiquetas**: ¿las URLs expiran? ¿Cuánto tiempo permanecen disponibles?
   ¿Se puede volver a solicitar la etiqueta de un envío ya creado?
3. **Formato y contenido** de la etiqueta (PDF / ZPL) y restricciones de
   almacenamiento de ese documento.
4. **Idempotencia**: ¿existe consulta por referencia externa / `idOrdenOrigen`
   o una clave oficial de idempotencia, para reconciliar timeouts?

## Correr los tests

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions
```

No requiere credenciales ni red: usa el modo mock y un cliente Supabase
falso (`_shared/test-support.ts`).

## Datos internos

`andreani_contract` (contrato y código de cliente de la cuenta comercial) es
un dato interno: se guarda en el pedido para trazabilidad histórica, pero
está revocado por columna para `anon`/`authenticated` (migración 0007), el
adapter lo excluye de su `select` explícito, y ninguna Function lo devuelve
en una respuesta.
