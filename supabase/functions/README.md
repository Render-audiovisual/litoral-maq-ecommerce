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

Hasta tener una de las dos confirmada **por escrito en la documentación
oficial**, la revisión manual se mantiene. No es una limitación del código:
es la única opción segura sin garantías del proveedor.

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
