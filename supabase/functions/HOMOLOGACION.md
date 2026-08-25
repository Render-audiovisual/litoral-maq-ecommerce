# Tabla de homologación — API de Envíos de Andreani

Planilla para completar **cuando Andreani entregue el paquete técnico**. Hoy
está vacía en la columna "Oficial" a propósito: la documentación pública
confirma qué credenciales y contratos hacen falta, pero **no permite validar
la spec de endpoints**.

Todo lo que figura como "Asumido hoy" está reconstruido de SDKs públicos de
terceros y **no está verificado**. Cada fila corresponde a un `TO VERIFY` en
`_shared/andreani.ts`.

> **No cambiar código ni supuestos hasta recibir el paquete.**
> `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS = false`, `ANDREANI_ENABLED = false`.

## Cómo se usa

Por cada operación, completar la columna **Oficial** con lo que diga la
documentación. Donde "Oficial" difiera de "Asumido hoy", aplicar el cambio en
el archivo indicado en **Acción si difiere** y recién ahí marcar el test como
ejecutado contra QA.

Estados: `⬜ pendiente` · `✅ coincide` · `⚠️ difiere (corregido)` · `❌ no existe`

---

## Resumen

| # | Operación | Endpoint QA asumido | Método | Estado |
|---|---|---|---|---|
| 0 | Base URL | `https://apisqa.andreani.com` | — | ⬜ |
| 1 | Autenticación / token | `/login` | POST | ⬜ |
| 2 | Cotización | `/v2/tarifas` | POST | ⬜ |
| 3 | Localidades | `/v1/localidades` | GET | ⬜ |
| 4 | Sucursales | `/v1/sucursales` | GET | ⬜ |
| 5 | Creación de preenvío | `/v2/ordenes-de-envio` | POST | ⬜ |
| 6 | Etiqueta | `/v2/ordenes-de-envio/{nro}/etiquetas` | GET | ⬜ |
| 7 | Tracking / trazas | `/v2/envios/{nro}/trazas` | GET | ⬜ |

Producción asumida: `https://apis.andreani.com`. **Confirmar ambas.**

---

## 0. Base URL y ambientes

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Base URL QA | `https://apisqa.andreani.com` | |
| Base URL producción | `https://apis.andreani.com` | |
| ¿Existe SANDBOX separado de QA? | Sí, según FAQ pública | |
| ¿Mismas credenciales en los tres? | Se asume que no | |

**Acción si difiere**: `ANDREANI_BASE_URL` es un secret por ambiente; no hay
URL hardcodeada. Solo cambia el valor del secret.

---

## 1. Autenticación / token

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `POST {base}/login` | |
| Método | POST | |
| Auth | `Authorization: Basic base64(user:password)` | |
| Request oficial | Sin body | |
| Response oficial | `{ "token": "..." }` | |
| ¿Informa `expires_in`? | **No asumido** — se lee si viene | |
| Duración del token | **No asumida** | |
| Mecanismo de renovación | Re-login | |
| Errores | 401/403 → credenciales | |
| Idempotencia | N/A | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: 9 tests de `resolveTokenLifetime` | ⬜ QA: |

**Acción si difiere**: `getToken()` en `_shared/andreani.ts`. Si informan
`expires_in` o el token es un JWT con `exp`, el código ya los usa sin cambios.
Si confirman una duración fija que **no** viaja en la respuesta, recién ahí
tiene sentido `ANDREANI_TOKEN_TTL_SECONDS`.

---

## 2. Cotización

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `POST {base}/v2/tarifas` | |
| Método | POST | |
| Auth | `Authorization: Bearer {token}` | |
| Request oficial | `cpDestino`, `contrato`, `cliente`, `pesoTotal`, `volumenTotal` (m³), `valorDeclarado` | |
| Response oficial | `tarifaConIVA` \| `tarifa`, `plazoEntrega` | |
| ¿Unidad de peso? | kg | |
| ¿Unidad de volumen? | m³ (calculado desde cm) | |
| ¿Requiere CP origen? | No asumido | |
| Errores | Genéricos por status | |
| Idempotencia | N/A (lectura) | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: 6 tests en `andreani-quote` | ⬜ QA: |

**Acción si difiere**: `quote()` en `_shared/andreani.ts`.

---

## 3. Localidades

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `GET {base}/v1/localidades?codigoPostal=` | |
| Método | GET | |
| Auth | Bearer | |
| Request oficial | Query `codigoPostal` (4 dígitos) | |
| Response oficial | Array, o `{ localidades: [...] }` con `nombre`\|`localidad`, `provincia`, `codigoPostal` | |
| ¿Paginación? | No asumida | |
| Errores | Genéricos por status | |
| Idempotencia | N/A (lectura) | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: cubierto en `andreani-geo` | ⬜ QA: |

**Acción si difiere**: `localidades()` en `_shared/andreani.ts`.

---

## 4. Sucursales

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `GET {base}/v1/sucursales?codigoPostal=` | |
| Método | GET | |
| Auth | Bearer | |
| Request oficial | Query `codigoPostal` | |
| Response oficial | Array, o `{ sucursales: [...] }` con `codigo`\|`numero`, `nombre`, `direccion`, `provincia` | |
| ¿Filtra por provincia? | No asumido | |
| ¿Informa horarios / capacidad? | No asumido | |
| Errores | Genéricos por status | |
| Idempotencia | N/A (lectura) | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: cubierto en `andreani-geo` | ⬜ QA: |

**Acción si difiere**: `sucursales()` en `_shared/andreani.ts`.

---

## 5. Creación de preenvío ⚠️ la más crítica

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `POST {base}/v2/ordenes-de-envio` | |
| Método | POST | |
| Auth | Bearer | |
| Request oficial | `contrato`, `cliente`, `idOrdenOrigen`, `destinatario{nombreCompleto, email, domicilio{calle, codigoPostal}}`, `bultos[{kilos, largoCm, anchoCm, altoCm, valorDeclarado}]` | |
| Response oficial | `numeroDeEnvio`\|`numero`, `estado`, `urlTracking`, `urlEtiqueta` | |
| ¿Domicilio estructurado? | Hoy se manda `calle` como string libre | |
| ¿Campos obligatorios extra? | No asumidos (DNI, teléfono…) | |
| Errores | 4xx → datos; 5xx/timeout → **ambiguo** | |
| **Idempotencia** | **Se asume que `idOrdenOrigen` deduplica — SIN CONFIRMAR** | |
| ¿Acepta idempotency key? | Desconocido | |
| ¿Se puede consultar por `idOrdenOrigen`? | Desconocido | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: 23 tests en `andreani-shipment` | ⬜ QA: |

**Acción si difiere**: `createShipment()` en `_shared/andreani.ts`.

### ⚠️ Hallazgo del sandbox beta — nuestro payload es casi con seguridad incorrecto

`developers-sandbox.andreani.com/docs/andreani/beta/creacion-de-una-nueva-orden-de-envio`
publica el schema de request/response de esta operación. **No es el paquete
oficial** (es sandbox, sección beta, sin endpoint, sin método, sin auth y sin
base URL), así que no alcanza para cerrar la homologación — pero ya muestra
que lo que asumimos difiere en cosas de fondo:

| Nuestro supuesto | Schema publicado en sandbox/beta |
|---|---|
| `idOrdenOrigen` | **`idPedido`** |
| `destinatario` es un objeto | **`destinatario` es un array** |
| Dirección dentro de `destinatario.domicilio` | **`destino.postal{}`**, aparte del destinatario |
| `calle` recibe la dirección como texto libre | Dirección **estructurada**: `calle`, `numero`, `piso`, `departamento`, `localidad`, `region`, `pais` |
| No mandamos origen | **`origen{}`** existe (postal o sucursal) |
| No mandamos `tipoDeServicio` | **`tipoDeServicio`** existe |
| `cliente` en el body | No aparece en el body |
| `bultos[].valorDeclarado` | `valorDeclaradoSinImpuestos` / `valorDeclaradoConImpuestos` (además de `valorDeclarado`) |
| Response con `numeroDeEnvio` al tope | **`bultos[].numeroDeEnvio`** (por bulto, dentro del array) |
| Response con `urlEtiqueta` | No existe; hay `etiquetasPorAgrupador`, `etiquetaRemito` y `bultos[].linking[]` |
| Éxito 200 | **202 Accepted** → la creación podría ser **asíncrona** |
| — | Errores documentados: **400, 500** (no figuran 409 ni 429) |

Implicaciones a resolver cuando llegue el paquete oficial:

- **El 202 es lo más importante.** Si la creación es asíncrona, "Andreani
  aceptó" ≠ "el envío existe", y la máquina de estados del claim necesita un
  estado intermedio más. Confirmar si el 202 ya garantiza el alta.
- El checkout guarda la dirección como string libre
  (`CP 3400 · Corrientes · Mitre 123`). Si el destino va estructurado, hay que
  capturar calle/número/piso por separado en el checkout — **cambio de
  producto, no solo de esta capa**.
- `numeroDeEnvio` por bulto cambia el modelo: hoy la columna guarda uno solo.
  Con un bulto por pedido alcanza, pero conviene confirmarlo.

**No se aplicó ninguno de estos cambios**: son de sandbox/beta, no del paquete
oficial. Sirven para saber qué preguntar y para dimensionar el trabajo.

**Esta fila destraba el fallo residual.** Mientras idempotencia y consulta por
referencia sigan en "desconocido", un 5xx/timeout deja el pedido en
`created_unsaved` para revisión manual (ver README). Confirmar cualquiera de
las dos permite automatizar la reconciliación.

---

## 6. Etiqueta

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `GET {base}/v2/ordenes-de-envio/{nro}/etiquetas` | |
| Método | GET | |
| Auth | Bearer | |
| Request oficial | Número de envío en el path | |
| Response oficial | `{ url }` \| `{ urlEtiqueta }` | |
| Formato | **No asumido** (¿PDF? ¿ZPL? ¿ambos?) | |
| ¿Devuelve URL o binario? | Se asume URL | |
| **¿La URL vence?** | **No asumido — se trata como temporal** | |
| ¿Cuánto dura disponible? | Desconocido | |
| **¿Se puede volver a solicitar?** | **Desconocido** | |
| Restricciones de almacenamiento | Desconocidas | |
| Errores | Genéricos por status | |
| Idempotencia | N/A si es reemisión | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: 2 tests de etiqueta | ⬜ QA: |

**Acción si difiere**: `getLabel()` en `_shared/andreani.ts`.

**Decide el diseño de almacenamiento** (ver README): si se puede volver a
solicitar, se mantiene on-demand (preferido, no guarda PII). Si vence y no se
regenera, hay que bajarla server-side a un bucket **privado** de Storage con
signed URLs breves.

---

## 7. Tracking / trazas

| Campo | Asumido hoy (TO VERIFY) | Oficial (completar) |
|---|---|---|
| Endpoint QA | `GET {base}/v2/envios/{nro}/trazas` | |
| Método | GET | |
| Auth | Bearer | |
| Request oficial | Número de envío en el path | |
| Response oficial | Array o `{ trazas: [...] }` con `fecha`\|`at`, `descripcion`\|`motivo`; `estadoActual` | |
| Set de estados posibles | **No asumido** (por eso la columna no tiene `check`) | |
| Formato de fecha | No asumido | |
| ¿Existe webhook de cambios? | Desconocido | |
| Errores | Genéricos por status | |
| Idempotencia | N/A (lectura) | |
| Rate limit | Desconocido | |
| Test ejecutado | Mock: cubierto en `andreani-shipment` | ⬜ QA: |

**Acción si difiere**: `getTracking()` en `_shared/andreani.ts`. Si entregan
el set cerrado de estados, evaluar un `check` constraint sobre
`andreani_status` en una migración nueva.

---

## Transversales

| Campo | Asumido hoy | Oficial (completar) |
|---|---|---|
| Rate limit de Andreani | **Desconocido**. El nuestro es 30 req/min por usuario admin, por instancia | |
| ¿Límite por endpoint o global? | Desconocido | |
| ¿Respuesta al exceder? | Se asume 429 | |
| Reintentos recomendados | Desconocido | |
| Proceso de homologación | Desconocido | |
| Contacto técnico durante homologación | — | |

Si el límite real es más bajo que 30/min, ajustar `RATE_LIMIT_MAX_REQUESTS`
en `_shared/andreani.ts`.

---

## Gate de salida

Los cuatro candados actuales **solo** se abren cuando todo esto sea cierto:

- [ ] Las 8 secciones tienen la columna "Oficial" completa, sin `⬜`.
- [ ] Toda fila `⚠️ difiere` tiene su cambio aplicado y su test verde.
- [ ] Los 80 tests Deno siguen pasando después de esos cambios.
- [ ] Cada operación tiene al menos un test **ejecutado contra QA real**, no
      solo mock.
- [ ] La fila de idempotencia (§5) está resuelta, o se acepta explícitamente
      seguir con revisión manual del fallo residual.

Recién entonces, y en commits separados y revisables:

1. `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS = true` en `_shared/andreani.ts`.
2. `ANDREANI_MODE=qa` como secret.
3. `ANDREANI_ENABLED=true` como secret.
4. `NEXT_PUBLIC_ANDREANI_UI=true` para mostrar los controles.

Producción, después de validar QA y con credenciales productivas propias.
