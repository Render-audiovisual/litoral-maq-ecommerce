# Andreani — Roadmap Fase 2 (post-hallazgo sandbox/beta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar el modelo de datos, tipos y UI para las 5 discrepancias que el schema de `developers-sandbox.andreani.com/.../beta/creacion-de-una-nueva-orden-de-envio` reveló contra nuestros supuestos, sin tocar el payload TO VERIFY que se envía a Andreani ni abrir ningún feature flag.

**Architecture:** Cinco fases secuenciales, cada una aditiva y con compatibilidad hacia atrás explícita (columnas nuevas nullable, tipos nuevos opcionales). Cada fase deja el sistema en un estado desplegable e inerte: compila, pasa tests, pero el camino real a Andreani sigue bloqueado por `ANDREANI_ENABLED=false` y `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS=false`.

**Tech Stack:** Next.js 16 (static export) + Supabase (Postgres/RLS) + Supabase Edge Functions (Deno) + Vitest + Deno test + Playwright.

## Global Constraints

- **No tocar el payload que se envía a Andreani.** El JSON literal dentro de `request(env, "/v2/ordenes-de-envio", { body: JSON.stringify({...}) })` en `supabase/functions/_shared/andreani.ts` (función `createShipment`) no cambia de nombres de campos hasta que `HOMOLOGACION.md` §5 esté completo. Las fases de abajo preparan los DATOS (tipos, columnas, UI) que ese payload va a necesitar, pero el `JSON.stringify` en sí queda textualmente igual salvo lo que ya dice hoy.
- **No abrir flags.** `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS` sigue en `false`, `ANDREANI_ENABLED` sigue en `false` en cada `.env.example`. Ninguna tarea de este plan los toca.
- **Compatibilidad con pedidos viejos es obligatoria en cada fase**, no una revisión final: toda columna nueva es `nullable` sin default forzado, todo campo TS nuevo es opcional, y cada fase incluye un test explícito que carga una fila "vieja" (sin las columnas nuevas) y confirma que no rompe.
- **No crear una `0008` por fase suelta**: cada fase que necesite schema agrega **una** migración con el próximo número correlativo (`0008`, `0009`, `0010`, `0011` — ver Fase 3 y 4), nunca reedita `0007` (esa ya se considera cerrada del pase anterior).
- Todo archivo Deno nuevo o tocado se valida con `deno check --config supabase/functions/deno.json` y `deno lint --config supabase/functions/deno.json supabase/functions` antes de cada commit de esa tarea.
- Todo archivo TS de `src/` se valida con `npx tsc --noEmit` y `npx eslint src` antes de cada commit de esa tarea.

---

## Fase 1 — Dirección estructurada del checkout

**Por qué:** el schema publicado en sandbox/beta pide `destino.postal{calle, numero, piso, departamento, localidad, region, pais, codigoPostal}` — no el string libre `CP 3400 · Corrientes · Mitre 123` que arma hoy `checkout/page.tsx:91`.

### Task 1.1: Migración — columnas de dirección estructurada

**Files:**
- Create: `supabase/migrations/0008_structured_address.sql`

**Interfaces:**
- Produces: columnas `orders.shipping_street`, `shipping_number`, `shipping_floor`, `shipping_apartment`, `shipping_locality`, `shipping_region`, `shipping_postal_code`, `shipping_country` — todas `text`, todas `nullable`.

- [ ] **Paso 1: escribir la migración**

```sql
-- Etapa 10 — Dirección estructurada de envío.
-- El checkout actual (0001) guarda el domicilio como un string libre en
-- `address`. El schema de creación de orden de envío publicado en
-- developers-sandbox.andreani.com/.../beta/creacion-de-una-nueva-orden-de-envio
-- (no oficial, ver HOMOLOGACION.md) pide domicilio estructurado. Se agrega
-- SIN tocar `address`: los pedidos viejos (y cualquier pedido nuevo mientras
-- el checkout no se actualice) siguen usando `address` como antes; las
-- columnas nuevas quedan null hasta que el checkout las llene.
alter table public.orders
  add column if not exists shipping_street text,
  add column if not exists shipping_number text,
  add column if not exists shipping_floor text,
  add column if not exists shipping_apartment text,
  add column if not exists shipping_locality text,
  add column if not exists shipping_region text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text;

-- No aplicada a ningún proyecto remoto todavía (ver README de supabase/functions).

-- ---------------------------------------------------------------------
-- ROLLBACK:
-- alter table public.orders
--   drop column if exists shipping_street,
--   drop column if exists shipping_number,
--   drop column if exists shipping_floor,
--   drop column if exists shipping_apartment,
--   drop column if exists shipping_locality,
--   drop column if exists shipping_region,
--   drop column if exists shipping_postal_code,
--   drop column if exists shipping_country;
-- ---------------------------------------------------------------------
```

- [ ] **Paso 2: verificar contra la convención existente**

Comparar contra `supabase/migrations/0007_andreani_shipping.sql` (mismo estilo:
comentario de cabecera explicando el porqué, `add column if not exists`,
bloque de rollback comentado al final). No requiere ejecución — no hay
proyecto remoto para migrar todavía.

---

### Task 1.2: Tipos TS — `StructuredAddress` y `Order.shippingAddress`

**Files:**
- Modify: `src/lib/types.ts`
- Test: `src/lib/types.test.ts` (nuevo — hoy `types.ts` no tiene test propio porque es solo tipos; se agrega uno mínimo para fijar la forma con un type-level check, ver Paso 2)

**Interfaces:**
- Produces: `StructuredAddress` (exportado desde `@/lib/types`), `Order.shippingAddress?: StructuredAddress | null`.

- [ ] **Paso 1: agregar el tipo**

```ts
// src/lib/types.ts — agregar antes de `export type Order = {`

export type StructuredAddress = {
  street: string;
  number: string;
  floor?: string | null;
  apartment?: string | null;
  locality: string;
  region: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2. Fijo en "AR" hasta que exista envío internacional. */
  country: string;
};
```

Y agregar al `Order` existente (junto al `address?: string` actual, sin tocarlo):

```ts
  /** Ausente en pedidos anteriores a esta fase, o si el checkout no la
   * completó (ej. retiro en sucursal). `address` (arriba) sigue siendo la
   * fuente de verdad para mostrar/loguear mientras convive con pedidos
   * viejos — no se elimina. */
  shippingAddress?: StructuredAddress | null;
```

- [ ] **Paso 2: test de forma (compat)**

```ts
// src/lib/types.test.ts
import { describe, expect, it } from "vitest";
import type { Order, StructuredAddress } from "./types";

describe("StructuredAddress", () => {
  it("un pedido sin shippingAddress (formato viejo) sigue siendo un Order válido", () => {
    const legacyOrder: Order = {
      id: "LM-1",
      customerId: "c1",
      customerName: "X",
      email: "x@test.com",
      lines: [],
      total: 100,
      shipping: 0,
      deliveryMethod: "envio",
      address: "CP 3400 · Corrientes · Mitre 123",
      status: "pendiente",
      createdAt: new Date().toISOString(),
      paymentReference: "Pago a coordinar",
      // sin shippingAddress: debe compilar y no debe hacer falta en runtime.
    };
    expect(legacyOrder.shippingAddress).toBeUndefined();
  });

  it("un pedido nuevo puede traer shippingAddress completo", () => {
    const address: StructuredAddress = {
      street: "Mitre", number: "123", locality: "Corrientes",
      region: "Corrientes", postalCode: "3400", country: "AR",
    };
    expect(address.floor).toBeUndefined();
  });
});
```

- [ ] **Paso 3: correr**

```bash
npx vitest run src/lib/types.test.ts
```
Esperado: 2 tests, PASS.

---

### Task 1.3: Checkout — formulario con campos estructurados

**Files:**
- Modify: `src/app/checkout/page.tsx:20-95`

**Interfaces:**
- Consumes: `StructuredAddress` de `@/lib/types` (Task 1.2).
- Produces: `order.shippingAddress` poblado en el submit; `order.address` se sigue armando igual que hoy (compat con todo lector existente: tabla admin, WhatsApp).

- [ ] **Paso 1: reemplazar el único input `address` por los campos estructurados**

```tsx
// checkout/page.tsx — reemplaza el `form` state actual
const [form, setForm] = useState({
  name: customerSession?.user.name || "",
  email: customerSession?.user.email || "",
  phone: "",
  postalCode: "",
  locality: "",
  region: "",
  street: "",
  number: "",
  floor: "",
  apartment: "",
});
```

Validación (`confirmDelivery` y `submit`, hoy en las líneas 31 y 45) pasa de
chequear `form.address.trim()` a chequear `form.street.trim()` y
`form.number.trim()` (piso/depto quedan opcionales):

```tsx
if (method === "envio" && (!/^\d{4}$/.test(form.postalCode) || !form.locality.trim() || !form.region.trim() || !form.street.trim() || !form.number.trim())) {
  setError("Completá código postal, provincia, localidad, calle y número de entrega.");
  return;
}
```

- [ ] **Paso 2: armar `shippingAddress` y mantener `address` (compat)**

```tsx
// dentro de submit(), reemplaza la línea 91:
const shippingAddress: StructuredAddress | undefined = method === "envio" ? {
  street: form.street.trim(),
  number: form.number.trim(),
  floor: form.floor.trim() || null,
  apartment: form.apartment.trim() || null,
  locality: form.locality.trim(),
  region: form.region.trim(),
  postalCode: form.postalCode,
  country: "AR",
} : undefined;

const order: Order = {
  // ...campos existentes sin cambios...
  address: method === "envio"
    ? `CP ${form.postalCode} · ${form.locality.trim()} · ${form.street.trim()} ${form.number.trim()}`
    : undefined,
  shippingAddress,
  // ...resto sin cambios...
};
```

No hace falta importar nada nuevo salvo el tipo: agregar `StructuredAddress`
al `import type { Order, Session }` existente en la línea 10.

- [ ] **Paso 3: agregar los inputs al JSX**

Reemplazar el único `<input>` de domicilio (buscar el que hoy bindea
`form.address`) por seis inputs (calle, número, piso, depto, localidad,
provincia), siguiendo el mismo patrón de `onChange={(e) => setForm((f) => ({...f, campo: e.target.value}))}` que ya usan `postalCode`/`locality` en el archivo. No se muestra el JSX completo acá porque depende del layout visual actual del formulario — el criterio de aceptación (abajo) es funcional, no de diseño.

---

### Task 1.4: Migración de tipos generados + adapter

**Files:**
- Modify: `src/services/persistence/supabase/database.types.ts`
- Modify: `src/services/persistence/supabase-adapter.ts`
- Modify: `src/services/persistence/supabase-adapter.test.ts`

**Interfaces:**
- Consumes: `StructuredAddress` (Task 1.2), columnas de Task 1.1.
- Produces: `rowToOrder`/`orderToInsert` mapean `shippingAddress ⇄` las 8 columnas `shipping_*`.

- [ ] **Paso 1: extender `database.types.ts`**

Agregar a `orders.Row` e `Insert` (siguiendo el patrón de los `andreani_*`
agregados en el pase anterior):

```ts
          shipping_street: string | null;
          shipping_number: string | null;
          shipping_floor: string | null;
          shipping_apartment: string | null;
          shipping_locality: string | null;
          shipping_region: string | null;
          shipping_postal_code: string | null;
          shipping_country: string | null;
```
(y su equivalente opcional `?:` en `Insert`).

- [ ] **Paso 2: agregar a `ORDER_COLUMNS` y mapear en el adapter**

```ts
// supabase-adapter.ts — ORDER_COLUMNS gana las 8 columnas al final.
// orderToInsert():
    shipping_street: order.shippingAddress?.street ?? null,
    shipping_number: order.shippingAddress?.number ?? null,
    shipping_floor: order.shippingAddress?.floor ?? null,
    shipping_apartment: order.shippingAddress?.apartment ?? null,
    shipping_locality: order.shippingAddress?.locality ?? null,
    shipping_region: order.shippingAddress?.region ?? null,
    shipping_postal_code: order.shippingAddress?.postalCode ?? null,
    shipping_country: order.shippingAddress?.country ?? null,

// rowToOrder(): reconstruye el objeto SOLO si los campos obligatorios están
// presentes — una fila vieja (todo null) da shippingAddress: undefined, no
// un objeto con campos vacíos.
    shippingAddress: (row.shipping_street && row.shipping_number && row.shipping_locality && row.shipping_region && row.shipping_postal_code)
      ? {
          street: row.shipping_street,
          number: row.shipping_number,
          floor: row.shipping_floor,
          apartment: row.shipping_apartment,
          locality: row.shipping_locality,
          region: row.shipping_region,
          postalCode: row.shipping_postal_code,
          country: row.shipping_country ?? "AR",
        }
      : undefined,
```

- [ ] **Paso 3: test de compatibilidad — fila vieja sin columnas estructuradas**

```ts
// supabase-adapter.test.ts
it("rowToOrder sobre un pedido viejo (sin columnas shipping_*) no arma shippingAddress", async () => {
  const orderRow = {
    id: "o-viejo", customer_id: "c1", customer_name: "X", email: "x@test.com",
    lines: [], total: 100, shipping: 0, delivery_method: "envio",
    address: "CP 3400 · Corrientes · Mitre 123", status: "pendiente",
    created_at: new Date().toISOString(), payment_reference: "MP-1",
    andreani_shipment_number: null, andreani_status: null, andreani_tracking_url: null,
    // shipping_street, shipping_number, etc: AUSENTES del todo, como una
    // fila real traída antes de aplicar 0008.
  };
  const { client } = createFakeClient({ orders: { data: orderRow, error: null } });
  const adapter = createSupabasePersistenceAdapter(client);
  const orders = await adapter.listOrders();
  expect(orders[0].shippingAddress).toBeUndefined();
  expect(orders[0].address).toBe("CP 3400 · Corrientes · Mitre 123"); // sigue funcionando.
});

it("rowToOrder arma shippingAddress completo cuando las columnas están", async () => {
  const orderRow = {
    id: "o-nuevo", customer_id: "c1", customer_name: "X", email: "x@test.com",
    lines: [], total: 100, shipping: 0, delivery_method: "envio",
    address: "CP 3400 · Corrientes · Mitre 123", status: "pendiente",
    created_at: new Date().toISOString(), payment_reference: "MP-1",
    andreani_shipment_number: null, andreani_status: null, andreani_tracking_url: null,
    shipping_street: "Mitre", shipping_number: "123", shipping_floor: null,
    shipping_apartment: null, shipping_locality: "Corrientes",
    shipping_region: "Corrientes", shipping_postal_code: "3400", shipping_country: "AR",
  };
  const { client } = createFakeClient({ orders: { data: orderRow, error: null } });
  const adapter = createSupabasePersistenceAdapter(client);
  const orders = await adapter.listOrders();
  expect(orders[0].shippingAddress).toEqual({
    street: "Mitre", number: "123", floor: null, apartment: null,
    locality: "Corrientes", region: "Corrientes", postalCode: "3400", country: "AR",
  });
});
```

- [ ] **Paso 4: correr**

```bash
npx tsc --noEmit
npx vitest run src/services/persistence
```
Esperado: sin errores de tipos; los tests existentes + los 2 nuevos, PASS.

---

### Task 1.5: E2E — checkout con campos estructurados

**Files:**
- Modify: `tests/e2e/assisted-checkout.spec.ts`

- [ ] **Paso 1: actualizar el spec para llenar los campos nuevos**

Reemplazar el `fill` del input único de domicilio por los fills de calle,
número, localidad y provincia (piso/depto quedan sin completar, para
ejercitar el camino opcional). Agregar una aserción de que el pedido creado
en el panel admin muestra el domicilio correctamente armado (mismo texto de
`order.address` que ya se verificaba antes — el spec no necesita saber de
`shippingAddress` para pasar, porque `address` se sigue mostrando igual).

- [ ] **Paso 2: correr**

```bash
npx playwright test tests/e2e/assisted-checkout.spec.ts tests/e2e/admin-orders.spec.ts
```
Esperado: ambos specs PASS (checkout arma el pedido nuevo; admin sigue
mostrando `address` como siempre).

---

### Task 1.6: Function — leer dirección estructurada cuando exista

**Files:**
- Modify: `supabase/functions/andreani-shipment/index.ts`

**Interfaces:**
- Consumes: columnas `shipping_*` (Task 1.1).
- Produces: `handleCreate` arma el input de `createShipment()` con dirección
  estructurada cuando está disponible; sigue usando `extractPostalCode(address)`
  como fallback para pedidos viejos.

- [ ] **Paso 1: extender `SHIPMENT_SELECT`**

```ts
const SHIPMENT_SELECT = "id, customer_name, email, address, shipping_street, shipping_number, shipping_floor, shipping_apartment, shipping_locality, shipping_region, shipping_postal_code, shipping_country, total, andreani_shipment_number, andreani_status, andreani_tracking_url, andreani_claim_state, andreani_claimed_at";
```

- [ ] **Paso 2: resolver el domicilio a usar (estructurado > legacy)**

```ts
// en handleCreate, reemplaza la resolución actual de postalCode:
const structuredAddress = claimed.row!.shipping_street && claimed.row!.shipping_number
  ? {
      street: claimed.row!.shipping_street as string,
      number: claimed.row!.shipping_number as string,
      floor: claimed.row!.shipping_floor as string | null,
      apartment: claimed.row!.shipping_apartment as string | null,
      locality: claimed.row!.shipping_locality as string,
      region: claimed.row!.shipping_region as string,
      postalCode: claimed.row!.shipping_postal_code as string,
      country: (claimed.row!.shipping_country as string | null) ?? "AR",
    }
  : null;
const postalCode = body?.postalCode || structuredAddress?.postalCode || extractPostalCode(claimed.row!.address);
```

**IMPORTANTE — respeta la restricción global**: `createShipment()` en
`_shared/andreani.ts` sigue recibiendo `address: string` como hoy (no se le
agrega un parámetro `structuredAddress` todavía, y el JSON que arma
internamente no cambia). `structuredAddress` queda calculado y disponible acá
pero **sin conectarse al payload real** — eso es explícitamente la Fase que
sigue después de homologar (ver HOMOLOGACION.md §5, fila "Request oficial").
Dejar un comentario en el código marcando esto:

```ts
// TO VERIFY (HOMOLOGACION.md §5): structuredAddress ya está armado pero
// createShipment() todavía manda `address` como string libre — conectarlo
// al payload real es parte de cerrar la homologación, no de esta fase.
```

- [ ] **Paso 3: test — usa dirección estructurada cuando está, cae a legacy si no**

```ts
// andreani-shipment/index.test.ts
Deno.test("usa postalCode de shipping_postal_code cuando la fila tiene dirección estructurada", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-direccion-estructurada";
  const row = baseOrderRow(orderId);
  row.address = null; // pedido nuevo: podría no tener el string legacy.
  row.shipping_street = "Mitre";
  row.shipping_number = "123";
  row.shipping_postal_code = "3400";
  row.shipping_locality = "Corrientes";
  row.shipping_region = "Corrientes";
  client.tables.orders.set(orderId, row);

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 200); // no debe caer en 422 "no se pudo determinar el CP".
});

Deno.test("sin dirección estructurada, sigue usando extractPostalCode(address) como antes", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-legacy";
  client.tables.orders.set(orderId, baseOrderRow(orderId)); // address string libre, sin shipping_*.
  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 200);
});
```

Ajustar `baseOrderRow()` en el mismo archivo para incluir las 8 columnas
nuevas (todas `null` por defecto), y agregarlas también a `FakeAdminClient`
si `pick()` en `test-support.ts` las necesita explícitamente (no debería:
`pick` ya soporta cualquier set de columnas por nombre).

- [ ] **Paso 4: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions
```
Esperado: todos los tests existentes + los 2 nuevos, PASS.

---

### Compatibilidad con pedidos viejos (Fase 1)

Un pedido creado antes de esta fase: `shipping_*` todas `null` en la fila,
`Order.shippingAddress` resuelve a `undefined`, `Order.address` intacto. El
panel admin, el WhatsApp de confirmación y `extractPostalCode()` siguen
funcionando exactamente igual que hoy porque ninguno de los tres deja de leer
`address`. Cubierto por los tests de Task 1.4 (fila vieja) y 1.6 (fallback).

### Criterio de aceptación (Fase 1)

- [ ] `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` — limpios.
- [ ] `deno check` / `deno lint` / `deno test` sobre `supabase/functions` — limpios.
- [ ] `npx playwright test tests/e2e/assisted-checkout.spec.ts tests/e2e/admin-orders.spec.ts` — verdes.
- [ ] Un pedido nuevo (checkout real) tiene `shippingAddress` poblado en la
      fila de `orders`.
- [ ] Un pedido viejo simulado (fixture sin columnas `shipping_*`) carga sin
      error y `shippingAddress` es `undefined`.
- [ ] `git diff supabase/functions/_shared/andreani.ts` no toca ninguna línea
      dentro del `JSON.stringify({...})` de `createShipment()`.
- [ ] `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS` y `ANDREANI_ENABLED` siguen en
      `false` en el diff.

---

## Fase 2 — Atributos logísticos de productos y bultos

**Por qué:** hoy `createShipment()` usa `DEFAULT_PARCEL` (3kg/30x20x15cm)
siempre — el catálogo (`Product`) no tiene peso ni dimensiones. Sin datos
reales, cualquier cotización o preenvío declara un bulto inventado.

### Task 2.1: Migración — atributos logísticos de `products`

**Files:**
- Create: `supabase/migrations/0009_product_logistics.sql`

- [ ] **Paso 1: escribir la migración**

```sql
-- Etapa 11 — Atributos logísticos del catálogo.
-- Sin esto, createShipment() (supabase/functions/_shared/andreani.ts) usa
-- siempre DEFAULT_PARCEL: un bulto inventado, igual para un tornillo que
-- para una amoladora. Nullable y sin backfill: el catálogo existente sigue
-- funcionando idéntico (el fallback a DEFAULT_PARCEL se mantiene, ver
-- Task 2.3) hasta que se carguen los valores reales producto por producto.
alter table public.products
  add column if not exists weight_kg numeric,
  add column if not exists length_cm numeric,
  add column if not exists width_cm numeric,
  add column if not exists height_cm numeric;

-- No aplicada a ningún proyecto remoto todavía.

-- ---------------------------------------------------------------------
-- ROLLBACK:
-- alter table public.products
--   drop column if exists weight_kg,
--   drop column if exists length_cm,
--   drop column if exists width_cm,
--   drop column if exists height_cm;
-- ---------------------------------------------------------------------
```

---

### Task 2.2: Tipos TS — `Product` y snapshot en `OrderLine`

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/order-details.ts:33-44` (`snapshotOrderLines`)
- Modify: `src/lib/order-details.test.ts`

**Interfaces:**
- Produces: `Product.weightKg?/lengthCm?/widthCm?/heightCm?: number | null`;
  `OrderLine` gana los mismos 4 campos, snapshotados al momento del pedido
  (mismo criterio que `unitPrice`/`productName`: "para no depender del
  catálogo actual", comentario ya existente en `types.ts:30-31`).

- [ ] **Paso 1: extender `Product`**

```ts
// src/lib/types.ts, dentro de `export type Product = { ... }`, junto a stock:
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
```

- [ ] **Paso 2: extender `OrderLine`**

```ts
// OrderLine (types.ts:32-36) gana, junto a unitPrice:
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
```

- [ ] **Paso 3: `snapshotOrderLines` copia los 4 campos**

```ts
// order-details.ts:33-44 — dentro del return del .map():
      unitPrice: product?.price ?? line.unitPrice ?? null,
      weightKg: product?.weightKg ?? line.weightKg ?? null,
      lengthCm: product?.lengthCm ?? line.lengthCm ?? null,
      widthCm: product?.widthCm ?? line.widthCm ?? null,
      heightCm: product?.heightCm ?? line.heightCm ?? null,
```

- [ ] **Paso 4: test — snapshot con y sin datos logísticos**

```ts
// order-details.test.ts
it("snapshotOrderLines copia peso/dimensiones cuando el producto los tiene", () => {
  const products: Product[] = [{ ...baseProduct, id: "p1", weightKg: 2.5, lengthCm: 20, widthCm: 15, heightCm: 10 }];
  const [line] = snapshotOrderLines([{ productId: "p1", quantity: 1 }], products);
  expect(line.weightKg).toBe(2.5);
});

it("snapshotOrderLines deja weightKg en null cuando el producto no lo tiene cargado (compat)", () => {
  const products: Product[] = [{ ...baseProduct, id: "p1" }]; // sin weightKg.
  const [line] = snapshotOrderLines([{ productId: "p1", quantity: 1 }], products);
  expect(line.weightKg).toBeNull();
});
```

- [ ] **Paso 5: correr**

```bash
npx tsc --noEmit && npx vitest run src/lib
```
Esperado: sin errores; tests existentes + 2 nuevos, PASS.

---

### Task 2.3: Función pura — bulto calculado desde las líneas del pedido

**Files:**
- Modify: `supabase/functions/_shared/andreani.ts`
- Modify: `supabase/functions/_shared/andreani.test.ts`

**Interfaces:**
- Consumes: nada de red — recibe un array de líneas con los 4 campos de
  Task 2.2 ya snapshotados.
- Produces: `computeParcelFromLines(lines): { parcel: Parcel; usedDefault: boolean }`.

- [ ] **Paso 1: escribir la función pura**

```ts
// supabase/functions/_shared/andreani.ts, junto a DEFAULT_PARCEL:

export type OrderLineForParcel = {
  quantity: number;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
};

export type ParcelComputation = { parcel: Parcel; usedDefault: boolean };

/**
 * Bulto agregado del pedido. Conservador a propósito: si CUALQUIER línea no
 * tiene peso cargado, se descarta todo el cálculo y se usa DEFAULT_PARCEL
 * completo — mejor declarar de más (bulto por defecto) que de menos
 * (subdeclarar peso real a un transportista es el error caro). Las
 * dimensiones se aproximan apilando: ancho/largo = el máximo de cada eje
 * entre las líneas, alto = suma de alturas × cantidad. Es una aproximación
 * de "caja que contiene todo", no un empaquetado real — no existe bin
 * packing acá.
 */
export function computeParcelFromLines(lines: OrderLineForParcel[]): ParcelComputation {
  const hasCompleteData = lines.length > 0 && lines.every(
    (line) => line.weightKg != null && line.lengthCm != null && line.widthCm != null && line.heightCm != null,
  );
  if (!hasCompleteData) return { parcel: DEFAULT_PARCEL, usedDefault: true };

  const parcel = lines.reduce<Parcel>(
    (acc, line) => ({
      weightKg: acc.weightKg + line.weightKg! * line.quantity,
      lengthCm: Math.max(acc.lengthCm, line.lengthCm!),
      widthCm: Math.max(acc.widthCm, line.widthCm!),
      heightCm: acc.heightCm + line.heightCm! * line.quantity,
    }),
    { weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0 },
  );
  return { parcel, usedDefault: false };
}
```

- [ ] **Paso 2: tests**

```ts
// andreani.test.ts
Deno.test("computeParcelFromLines - con datos completos, suma peso y apila dimensiones", () => {
  const result = computeParcelFromLines([
    { quantity: 2, weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 5 },
    { quantity: 1, weightKg: 3, lengthCm: 20, widthCm: 15, heightCm: 8 },
  ]);
  assertEquals(result.usedDefault, false);
  assertEquals(result.parcel.weightKg, 2 * 1 + 1 * 3); // 5
  assertEquals(result.parcel.lengthCm, 20); // max
  assertEquals(result.parcel.heightCm, 2 * 5 + 1 * 8); // 18
});

Deno.test("computeParcelFromLines - si falta el peso de UNA línea, usa DEFAULT_PARCEL completo", () => {
  const result = computeParcelFromLines([
    { quantity: 1, weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 5 },
    { quantity: 1, weightKg: null, lengthCm: 10, widthCm: 10, heightCm: 5 }, // falta.
  ]);
  assertEquals(result.usedDefault, true);
  assertEquals(result.parcel, DEFAULT_PARCEL);
});

Deno.test("computeParcelFromLines - lista vacía usa DEFAULT_PARCEL", () => {
  assertEquals(computeParcelFromLines([]).usedDefault, true);
});
```

- [ ] **Paso 3: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/andreani.test.ts
```
Esperado: 3 tests nuevos, PASS.

---

### Task 2.4: Function — usar el bulto calculado en `handleCreate`

**Files:**
- Modify: `supabase/functions/andreani-shipment/index.ts`
- Modify: `supabase/functions/andreani-shipment/index.test.ts`

**Interfaces:**
- Consumes: `computeParcelFromLines` (Task 2.3).
- Produces: `handleCreate` calcula el `parcel` real cuando hay datos, en vez
  de depender ciegamente de `DEFAULT_PARCEL`. `body?.parcel` (override
  manual, ya existente hoy) sigue teniendo prioridad si el admin lo manda
  explícito desde el panel.

- [ ] **Paso 1: agregar `lines` a `SHIPMENT_SELECT` y calcular el bulto**

```ts
const SHIPMENT_SELECT = "... , lines"; // agregar al final de la lista existente.

// en handleCreate, antes de llamar a createShipment():
const { parcel: computedParcel, usedDefault } = body?.parcel
  ? { parcel: body.parcel, usedDefault: false }
  : computeParcelFromLines(claimed.row!.lines ?? []);
```
Y pasar `parcel: computedParcel` en vez de `parcel: body?.parcel` al llamado
existente de `createShipment(...)`.

- [ ] **Paso 2: exponer `usedDefault` en la respuesta (visibilidad para el admin)**

```ts
// shipmentFields() o el punto donde se arma la Response.json de éxito:
return Response.json({ idempotent: false, usedDefaultParcel: usedDefault, ...shipmentFields(saved) });
```

- [ ] **Paso 3: test**

```ts
Deno.test("usa el bulto calculado de las líneas cuando todas tienen peso/dimensiones", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-bulto-real";
  const row = baseOrderRow(orderId);
  row.lines = [{ productId: "p1", quantity: 1, weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 15 }];
  client.tables.orders.set(orderId, row);
  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  const body = await response.json();
  assertEquals(body.usedDefaultParcel, false);
});

Deno.test("sin datos logísticos en las líneas, usedDefaultParcel es true (compat con pedidos viejos)", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-sin-logistica";
  const row = baseOrderRow(orderId);
  row.lines = [{ productId: "p1", quantity: 1 }]; // sin weightKg: pedido de antes de esta fase.
  client.tables.orders.set(orderId, row);
  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  const body = await response.json();
  assertEquals(body.usedDefaultParcel, true);
});
```

- [ ] **Paso 4: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions
```

---

### Task 2.5: Admin — formulario de producto y panel de confirmación

**Files:**
- Modify: `src/app/admin/productos/page.tsx`
- Modify: `src/app/admin/pedidos/page.tsx` (reemplaza `DEFAULT_PARCEL_LABEL` hardcodeado)

- [ ] **Paso 1: agregar 4 inputs numéricos opcionales al form de producto**

Mismo patrón que los inputs existentes de `price`/`stock` (numéricos,
opcionales, sin validación de obligatoriedad — un producto sin estos datos
sigue siendo válido, solo hace que sus pedidos caigan al bulto por defecto).

- [ ] **Paso 2: el resumen de confirmación de envío muestra el bulto real**

```tsx
// admin/pedidos/page.tsx — reemplaza el uso estático de DEFAULT_PARCEL_LABEL
// por un cálculo con la misma lógica que el server (duplicada a propósito,
// mismo criterio que el pase anterior con el bulto por defecto: son
// runtimes distintos sin paquete compartido). Si falta algún dato, mostrar
// una advertencia en vez de fingir precisión:
<dt>Bultos</dt>
<dd>
  {allLinesHaveLogistics
    ? `${totalWeightKg} kg · ${maxLengthCm}×${maxWidthCm}×${totalHeightCm} cm`
    : "3 kg · 30×20×15 cm (bulto por defecto — faltan peso/dimensiones en uno o más productos de este pedido)"}
</dd>
```

- [ ] **Paso 3: correr**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
```

---

### Compatibilidad con pedidos viejos (Fase 2)

Un `OrderLine` guardado antes de esta fase no tiene `weightKg` — es
`undefined`, no `null` ni `0`. `computeParcelFromLines` trata `undefined` y
`null` igual (`!= null` cubre ambos) y cae a `DEFAULT_PARCEL`. Cubierto por
el test "sin datos logísticos... usedDefaultParcel es true".

### Criterio de aceptación (Fase 2)

- [ ] Migración 0009 revisada, no aplicada a ningún proyecto remoto.
- [ ] `computeParcelFromLines` tiene 3 tests puros, todos PASS.
- [ ] Un pedido con todas las líneas cargadas con logística usa el bulto
      calculado (`usedDefaultParcel: false`).
- [ ] Un pedido con al menos una línea sin logística (o un pedido viejo) usa
      `DEFAULT_PARCEL` sin romper (`usedDefaultParcel: true`).
- [ ] El payload real (`JSON.stringify` en `createShipment`) sigue mandando
      el mismo shape de `bultos[0]` que hoy — solo cambian los VALORES de
      `kilos/largoCm/anchoCm/altoCm`, no los nombres de campo.

---

## Fase 3 — Estado asíncrono `accepted` después del 202

**Por qué:** el schema de sandbox/beta documenta `Responses 202 400 500` para
la creación de orden de envío. Un 202 Accepted típicamente significa "la
solicitud se aceptó para procesamiento, todavía no está confirmada" — tratarlo
como éxito terminal (como hace `persistShipmentResult` hoy) puede ser
prematuro. **No confirmado**: si el body del 202 ya incluye
`bultos[].numeroDeEnvio` definitivo o no. Esta fase prepara el estado para
ambos casos sin asumir cuál es real.

### Task 3.1: Migración — nuevo valor del `claim_state`

**Files:**
- Create: `supabase/migrations/0010_shipment_pending_confirmation.sql`

- [ ] **Paso 1: escribir la migración**

El constraint de `andreani_claim_state` en `0007` es inline y sin nombre
explícito — Postgres le asigna `orders_andreani_claim_state_check` por
convención (`<tabla>_<columna>_check`). Confirmar el nombre real antes de
aplicar esto a un proyecto de verdad con:
```sql
select conname from pg_constraint where conrelid = 'public.orders'::regclass and contype = 'c' and conname like '%claim_state%';
```

```sql
-- Etapa 12 — Estado intermedio para una posible creación asíncrona.
-- El schema de sandbox/beta (no oficial, ver HOMOLOGACION.md §5) documenta
-- 202 Accepted para la creación de orden de envío. Mientras no esté
-- confirmado si ese 202 ya trae el número final o si hace falta confirmar
-- después (HOMOLOGACION.md, pregunta 5 del README), se agrega un tercer
-- estado de claim que NO se trata como éxito ni como fallo: registra que
-- Andreani aceptó la solicitud pero el número todavía no está confirmado.
--
-- IMPORTANTE: a diferencia de 'created_unsaved' (0007), este estado SÍ es
-- reconciliable automáticamente — es lo que la Fase 5 (GET de estado) va a
-- resolver. No se toca decideShipmentClaim() en esta migración; el código
-- que interpreta este valor es la Fase 3/Fase 5 del plan, no esta migración.
alter table public.orders
  drop constraint if exists orders_andreani_claim_state_check;
alter table public.orders
  add constraint orders_andreani_claim_state_check
  check (andreani_claim_state in ('claimed', 'created_unsaved', 'accepted_pending_confirmation'));

-- No aplicada a ningún proyecto remoto todavía.

-- ---------------------------------------------------------------------
-- ROLLBACK (solo revierte el constraint; fallará si alguna fila real ya
-- tiene 'accepted_pending_confirmation' — resolver esas filas primero):
-- alter table public.orders drop constraint if exists orders_andreani_claim_state_check;
-- alter table public.orders add constraint orders_andreani_claim_state_check
--   check (andreani_claim_state in ('claimed', 'created_unsaved'));
-- ---------------------------------------------------------------------
```

---

### Task 3.2: Tipos y máquina de estados

**Files:**
- Modify: `supabase/functions/_shared/andreani.ts`
- Modify: `supabase/functions/_shared/andreani.test.ts`

**Interfaces:**
- Produces: `ShipmentClaimRow.andreani_claim_state` incluye
  `'accepted_pending_confirmation'`; `decideShipmentClaim()` devuelve una
  quinta decisión `"pending_confirmation"`.

- [ ] **Paso 1: extender el tipo y la función**

```ts
// ShipmentClaimRow:
export type ShipmentClaimRow = {
  andreani_shipment_number: string | null;
  andreani_claim_state: "claimed" | "created_unsaved" | "accepted_pending_confirmation" | null;
  andreani_claimed_at: string | null;
};

export type ShipmentClaimDecision =
  | "existing"
  | "in_progress"
  | "needs_manual_review"
  | "pending_confirmation"
  | "claim";

export function decideShipmentClaim(order: ShipmentClaimRow, now: number = Date.now()): ShipmentClaimDecision {
  if (order.andreani_shipment_number) return "existing";
  if (order.andreani_claim_state === "created_unsaved") return "needs_manual_review";
  if (order.andreani_claim_state === "accepted_pending_confirmation") return "pending_confirmation";
  if (order.andreani_claim_state === "claimed") {
    const claimedAt = order.andreani_claimed_at ? new Date(order.andreani_claimed_at).getTime() : 0;
    if (now - claimedAt < CLAIM_TTL_MS) return "in_progress";
    return "claim";
  }
  return "claim";
}
```

- [ ] **Paso 2: `ShipmentResult` — forma aditiva para el caso 202**

```ts
export type ShipmentResult = {
  // ...campos existentes sin cambios (shipmentNumber, status, trackingUrl,
  // labelUrl, contract, simulated)...
  /**
   * true si Andreani respondió 202 (aceptado, no confirmado) en vez de una
   * creación síncrona. TO VERIFY (HOMOLOGACION.md §5): si el 202 ya trae
   * shipmentNumber definitivo, este flag puede terminar siendo innecesario
   * — se decide al homologar, no acá. Mientras tanto, mock siempre
   * responde con `pending: false` (comportamiento síncrono actual, sin
   * cambios de conducta en modo mock).
   */
  pending: boolean;
};
```
Actualizar `mockQuote`/`createShipment` (rama mock) para incluir
`pending: false` explícito — sin cambiar ningún otro valor.

**No tocar** la rama real de `createShipment()` (el branch `env.mode !==
"mock"`) más allá de agregar `pending: false` al objeto que ya arma hoy — NO
agregar todavía un chequeo de `response.status === 202` contra la API real:
ese chequeo depende de confirmar si el 202 llega con o sin
`numeroDeEnvio`, que es exactamente la pregunta abierta. Dejar comentado:

```ts
// TO VERIFY (HOMOLOGACION.md §5, "¿La creación es asíncrona?"): falta
// decidir acá si `response.status === 202` debe interpretarse como
// pending:true. No implementado a propósito hasta confirmar si el body del
// 202 ya trae numeroDeEnvio o no.
```

- [ ] **Paso 3: tests**

```ts
Deno.test("decideShipmentClaim - accepted_pending_confirmation es reconciliable, no bloquea como created_unsaved", () => {
  assertEquals(
    decideShipmentClaim({ andreani_shipment_number: null, andreani_claim_state: "accepted_pending_confirmation", andreani_claimed_at: null }),
    "pending_confirmation",
  );
});

Deno.test("mockQuote/createShipment en modo mock siempre pending:false (sin cambio de conducta)", () => {
  // usar createShipment en modo mock (SPEC_VERIFIED sigue false -> mock)
  // y assertEquals(result.pending, false).
});
```

- [ ] **Paso 4: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/andreani.test.ts
```

---

### Task 3.3: `andreani-shipment/index.ts` — manejar la decisión `pending_confirmation`

**Files:**
- Modify: `supabase/functions/andreani-shipment/index.ts`
- Modify: `supabase/functions/andreani-shipment/index.test.ts`

- [ ] **Paso 1: extender `respondForNonClaimDecision`**

```ts
function respondForNonClaimDecision(decision: ShipmentClaimDecision, row: any): Response {
  if (decision === "existing") return Response.json({ idempotent: true, ...shipmentFields(row) });
  if (decision === "pending_confirmation") {
    // Distinto de needs_manual_review: acá SÍ se puede reintentar la
    // confirmación (no la creación) — la Fase 5 agrega la acción real de
    // reconciliar. Por ahora, informar el estado sin bloquear para siempre.
    throw new HttpError(
      202,
      `Andreani aceptó la creación del envío para el pedido ${row.id} pero todavía no está confirmada. ` +
        "Reintentá la verificación en unos minutos.",
    );
  }
  if (decision === "needs_manual_review") { /* ...sin cambios... */ }
  throw new HttpError(409, "Ya hay una creación de envío en curso para este pedido. Reintentá en unos segundos.");
}
```

- [ ] **Paso 2: `persistShipmentResult` guarda el estado intermedio cuando corresponde**

```ts
// al principio de persistShipmentResult, antes del guardado completo:
if (result.pending) {
  await admin.from("orders").update({
    andreani_claim_state: "accepted_pending_confirmation",
    andreani_claimed_at: new Date().toISOString(),
  }).eq("id", orderId);
  return Response.json({ idempotent: false, pending: true, orderId });
}
// resto de la función sin cambios (camino síncrono actual).
```

- [ ] **Paso 3: test**

```ts
Deno.test("createShipment con pending:true dejar el pedido en accepted_pending_confirmation, no en éxito ni en manual review", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-pending";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: async () => ({ shipmentNumber: "", status: "", trackingUrl: "", labelUrl: null, contract: null, simulated: false, pending: true }),
  });
  const body = await response.json();
  assertEquals(body.pending, true);
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, "accepted_pending_confirmation");
});

Deno.test("un segundo POST sobre un pedido pending_confirmation responde 202, no reintenta la creación", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-pending-retry";
  const row = baseOrderRow(orderId);
  row.andreani_claim_state = "accepted_pending_confirmation";
  client.tables.orders.set(orderId, row);
  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 202);
});
```

- [ ] **Paso 4: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions
```

---

### Compatibilidad con pedidos viejos (Fase 3)

Ningún pedido existente tiene `andreani_claim_state = 'accepted_pending_confirmation'`
(el valor no existía antes de 0010). `decideShipmentClaim` para
`'claimed'`/`'created_unsaved'`/`null` sigue exactamente igual que antes —
solo se agregó una rama nueva, ninguna existente cambió de comportamiento.

### Criterio de aceptación (Fase 3)

- [ ] Migración 0010 revisada; nombre real del constraint confirmado antes
      de aplicar a cualquier proyecto (no en esta fase — no hay proyecto
      remoto todavía).
- [ ] `decideShipmentClaim` y `ShipmentResult.pending` tienen tests, PASS.
- [ ] En modo mock, ningún test observa `pending: true` — la conducta
      síncrona actual no cambió.
- [ ] El chequeo real de `response.status === 202` contra Andreani **no está
      implementado** — queda explícitamente TO VERIFY en el código y en
      `HOMOLOGACION.md`.

---

## Fase 4 — Número y etiqueta por bulto

**Por qué:** el response del schema de sandbox/beta tiene `numeroDeEnvio`
**dentro de `bultos[]`**, no como campo único al tope. Hoy todo el modelo
(`andreani_shipment_number` singular, `getLabel(shipmentNumber)`) asume un
solo número por pedido.

**Alcance explícito**: esta fase prepara el ALMACENAMIENTO para múltiples
bultos por pedido — **no** implementa dividir un pedido en varios bultos
(eso seguiría siendo 1 bulto por pedido, calculado por `computeParcelFromLines`
de la Fase 2). Es forward-compat, no una feature nueva de packing.

### Task 4.1: Migración — `andreani_bultos` jsonb

**Files:**
- Create: `supabase/migrations/0011_shipment_bultos.sql`

- [ ] **Paso 1: escribir la migración**

```sql
-- Etapa 13 — Soporte de múltiples bultos por envío.
-- El schema de sandbox/beta (no oficial) devuelve numeroDeEnvio POR bulto,
-- no uno solo por pedido. andreani_shipment_number (0007) se mantiene como
-- está — sigue siendo la fuente de verdad para el índice único y para todo
-- el código existente que asume un único número — y pasa a representar el
-- número del PRIMER bulto. andreani_bultos guarda el detalle completo.
--
-- Hoy el pedido siempre genera 1 bulto (Fase 2: computeParcelFromLines
-- agrega un único Parcel), así que en la práctica `andreani_bultos` tendrá
-- length 1 hasta que exista una feature real de dividir en múltiples
-- bultos — que NO es parte de este cambio.
alter table public.orders
  add column if not exists andreani_bultos jsonb;

comment on column public.orders.andreani_bultos is
  'Array de {numeroDeBulto, numeroDeEnvio, labelRef}. andreani_shipment_number sigue siendo bultos[0].numeroDeEnvio para compat con el código existente.';

-- No aplicada a ningún proyecto remoto todavía.

-- ---------------------------------------------------------------------
-- ROLLBACK:
-- alter table public.orders drop column if exists andreani_bultos;
-- ---------------------------------------------------------------------
```

---

### Task 4.2: Tipos — `ShipmentResult.bultos`

**Files:**
- Modify: `supabase/functions/_shared/andreani.ts`
- Modify: `supabase/functions/_shared/andreani.test.ts`

- [ ] **Paso 1: extender el tipo**

```ts
export type BultoResult = {
  numeroDeBulto: string | null;
  numeroDeEnvio: string;
  labelRef: string | null;
};

export type ShipmentResult = {
  shipmentNumber: string; // = bultos[0].numeroDeEnvio, mantenido por compat.
  status: string;
  trackingUrl: string;
  labelUrl: string | null; // = bultos[0].labelRef, mantenido por compat.
  bultos: BultoResult[];
  contract: string | null;
  pending: boolean;
  simulated: boolean;
};
```

- [ ] **Paso 2: mock y real arman `bultos` con 1 elemento**

```ts
// rama mock de createShipment():
const bulto: BultoResult = { numeroDeBulto: "1", numeroDeEnvio: `MOCK-${input.orderId}`, labelRef: null };
return {
  shipmentNumber: bulto.numeroDeEnvio,
  status: "Pendiente de retiro (mock)",
  trackingUrl: `https://mock.andreani.local/tracking/${input.orderId}`,
  labelUrl: bulto.labelRef,
  bultos: [bulto],
  contract: null,
  pending: false,
  simulated: true,
};
```
La rama real (`TO VERIFY`) sigue sin tocarse — el `data.numeroDeEnvio ??
data.numero` actual se deja intacto; conectarlo a `data.bultos[].numeroDeEnvio`
es parte de cerrar la homologación (HOMOLOGACION.md §5), no de esta fase.

- [ ] **Paso 3: test — compat, `bultos[0]` coincide con los campos singulares**

```ts
Deno.test("createShipment (mock) - shipmentNumber/labelUrl siguen coincidiendo con bultos[0] (compat)", async () => {
  const result = await createShipment({ orderId: "o1", recipientName: "X", email: "x@test.com", address: "", postalCode: "3400", declaredValue: 100 });
  assertEquals(result.shipmentNumber, result.bultos[0].numeroDeEnvio);
  assertEquals(result.labelUrl, result.bultos[0].labelRef);
  assertEquals(result.bultos.length, 1);
});
```

---

### Task 4.3: Migración de guardado — `andreani-shipment/index.ts`

**Files:**
- Modify: `supabase/functions/andreani-shipment/index.ts`
- Modify: `supabase/functions/andreani-shipment/index.test.ts`

- [ ] **Paso 1: guardar `andreani_bultos` junto al resto**

```ts
// fullUpdate en persistShipmentResult():
const fullUpdate = {
  andreani_shipment_number: result.shipmentNumber,
  andreani_status: result.status,
  andreani_tracking_url: result.trackingUrl,
  andreani_contract: result.contract,
  andreani_bultos: result.bultos,
  andreani_claim_state: claimStateColumnFor(true),
  andreani_claimed_at: null,
};
```

- [ ] **Paso 2: `getLabel` acepta un bulto opcional**

```ts
// _shared/andreani.ts
export async function getLabel(shipmentNumber: string, bultoRef?: string): Promise<{ url: string; simulated: boolean }> {
  // mock: sin cambios de comportamiento si bultoRef no se usa.
  // real (TO VERIFY): sin cambios todavía — el endpoint sigue siendo
  // /v2/ordenes-de-envio/{shipmentNumber}/etiquetas; adaptarlo a por-bulto
  // es parte de la homologación.
}
```
`GET ?type=label` en `andreani-shipment/index.ts` puede aceptar un
querystring opcional `&bulto=N`, ignorado hasta que exista más de un bulto
real (hoy siempre hay 1 → `bultoRef` no cambia nada observable).

- [ ] **Paso 3: test — pedido viejo (sin `andreani_bultos`) sigue resolviendo por `andreani_shipment_number`**

```ts
Deno.test("GET label sobre un pedido creado antes de esta fase (sin andreani_bultos) sigue funcionando", async () => {
  const { client, getReq } = setupStaffClient();
  const orderId = "o-viejo-sin-bultos";
  const row = baseOrderRow(orderId);
  row.andreani_shipment_number = "OLD-123"; // como quedaría un pedido del pase anterior.
  // sin row.andreani_bultos: undefined.
  client.tables.orders.set(orderId, row);
  const response = await handler(getReq(orderId, "label"), { adminClient: client });
  assertEquals(response.status, 200);
});
```

- [ ] **Paso 4: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions
```

---

### Task 4.4: Admin — mostrar bultos cuando hay más de uno

**Files:**
- Modify: `src/app/admin/pedidos/page.tsx`
- Modify: `src/lib/types.ts` (`Order` no necesita `bultos` — sigue sin
  exponer `andreani_bultos` al cliente por el mismo motivo que la etiqueta:
  contiene referencias de etiqueta por bulto, mismo tratamiento de "dato
  interno" que ya tiene `andreani_label_url`)

- [ ] **Paso 1: no agregar `andreani_bultos` a `ORDER_COLUMNS`**

Sigue el mismo criterio ya aplicado a `andreani_contract`/`andreani_label_url`
en el pase anterior: es información operativa por bulto (puede incluir
referencias de etiqueta), no debe viajar al navegador del cliente vía el
adapter normal. El panel admin la consulta on-demand si hace falta mostrar
detalle por bulto — hoy, con 1 bulto siempre, no hace falta UI nueva: el
`shipmentNumber`/botón de etiqueta que ya existen siguen alcanzando.

- [ ] **Paso 2: revocar la columna por consistencia**

Agregar a la migración 0011 (Task 4.1) el mismo patrón de revoke que
`andreani_contract`/`andreani_label_url` en 0007:
```sql
revoke select (andreani_bultos) on public.orders from anon;
revoke select (andreani_bultos) on public.orders from authenticated;
revoke update (andreani_bultos) on public.orders from authenticated;
```
(Y su contrapartida en el bloque de rollback comentado, mismo criterio que 0007.)

---

### Compatibilidad con pedidos viejos (Fase 4)

`andreani_bultos` es `null` en cualquier fila creada antes de 0011.
`andreani_shipment_number` sigue siendo la fuente de verdad para todo el
código que ya existe (índice único, `shipmentFields()`, UI). Cubierto por el
test de Task 4.3 ("pedido viejo sin `andreani_bultos` sigue funcionando").

### Criterio de aceptación (Fase 4)

- [ ] Migración 0011 revisada, con el revoke por columna incluido.
- [ ] `ShipmentResult.bultos[0]` coincide siempre con
      `shipmentNumber`/`labelUrl` (test de compat, Task 4.2).
- [ ] Un pedido creado antes de esta fase resuelve `GET ?type=label`
      correctamente sin `andreani_bultos`.
- [ ] `andreani_bultos` no aparece en `ORDER_COLUMNS` del adapter ni en
      ninguna respuesta HTTP al navegador.

---

## Fase 5 — Reconciliación mediante GET de estado

**Por qué:** la FAQ pública menciona un **"GET estado de orden de envío"**
para confirmar que el preenvío quedó creado en el TMS. Es el mecanismo que
puede resolver automáticamente tanto el estado `accepted_pending_confirmation`
(Fase 3) como parte del fallo residual documentado en el README
(`created_unsaved` tras un 5xx/timeout) — sin esto, ambos requieren revisión
manual.

**El endpoint real sigue siendo TO VERIFY.** Esta fase construye la lógica de
reconciliación y la deja completamente testeada contra un cliente/consulta
simulados; la función que golpearía el endpoint real de Andreani se escribe
con la ruta marcada como pendiente, gateada igual que el resto por
`readAndreaniEnv()` — inerte mientras `SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS`
sea `false`.

### Task 5.1: Función pura — qué hacer con el resultado de la consulta

**Files:**
- Modify: `supabase/functions/_shared/andreani.ts`
- Modify: `supabase/functions/_shared/andreani.test.ts`

**Interfaces:**
- Produces: `reconcileOutcome(query): "resolved" | "released" | "still_pending"`.

- [ ] **Paso 1: escribir la función**

```ts
export type ReconciliationQuery =
  | { found: true; shipmentNumber: string; status: string }
  | { found: false }
  | { found: "unknown" }; // Andreani respondió pero sin poder confirmar ninguna de las dos.

export type ReconciliationOutcome = "resolved" | "released" | "still_pending";

/**
 * Traduce la respuesta del GET de estado a qué hacer con el claim. Pura:
 * no toca la DB ni la red, así que es testeable sin ninguno de los dos.
 *   - found:true  -> "resolved": ya tenemos el número, se guarda como un
 *                     éxito normal (mismo camino que persistShipmentResult).
 *   - found:false -> "released": Andreani confirma que NO existe -> seguro
 *                     reintentar la creación desde cero.
 *   - found:"unknown" -> "still_pending": ni confirma ni descarta, se deja
 *                     como está para reintentar la consulta más tarde.
 */
export function reconcileOutcome(query: ReconciliationQuery): ReconciliationOutcome {
  if (query.found === true) return "resolved";
  if (query.found === false) return "released";
  return "still_pending";
}
```

- [ ] **Paso 2: tests**

```ts
Deno.test("reconcileOutcome - encontrado -> resolved", () => {
  assertEquals(reconcileOutcome({ found: true, shipmentNumber: "123", status: "Creado" }), "resolved");
});
Deno.test("reconcileOutcome - no encontrado -> released (seguro reintentar)", () => {
  assertEquals(reconcileOutcome({ found: false }), "released");
});
Deno.test("reconcileOutcome - ambiguo -> still_pending (ni se libera ni se resuelve)", () => {
  assertEquals(reconcileOutcome({ found: "unknown" }), "still_pending");
});
```

---

### Task 5.2: `queryShipmentStatus` — llamada real, gateada igual que el resto

**Files:**
- Modify: `supabase/functions/_shared/andreani.ts`

- [ ] **Paso 1: función con rama mock + rama real marcada TO VERIFY**

```ts
/**
 * TO VERIFY (HOMOLOGACION.md, pregunta "GET estado de orden de envío"):
 * endpoint, forma del request (¿por idPedido? ¿por numeroDeEnvio?) y forma
 * exacta de la response no confirmados. La rama mock existe para poder
 * testear reconcileOutcome() y el flujo del handler de punta a punta ya
 * mismo, sin esperar la homologación.
 */
export async function queryShipmentStatus(orderId: string): Promise<ReconciliationQuery> {
  const env = readAndreaniEnv(); // mismo gate que toda otra operación real.
  if (env.mode === "mock") {
    // Mock siempre "no encontrado": el caso más seguro por defecto — no
    // inventa un número que no existe. Los tests de integración fuerzan
    // los otros dos casos inyectando queryShipmentStatus directamente.
    return { found: false };
  }
  // No implementado: falta el endpoint real. Cuando se confirme:
  // const data = await request(env, `/v2/.../${orderId}/estado`);
  // return data.existe ? { found: true, shipmentNumber: data.numero, status: data.estado } : { found: false };
  throw new Error("queryShipmentStatus: endpoint real no confirmado todavía (ver HOMOLOGACION.md).");
}
```

---

### Task 5.3: Acción de reconciliación en `andreani-shipment`

**Files:**
- Modify: `supabase/functions/andreani-shipment/index.ts`
- Modify: `supabase/functions/andreani-shipment/index.test.ts`

**Interfaces:**
- Produces: `POST ?orderId=X&action=reconcile`, disponible para pedidos en
  `created_unsaved` o `accepted_pending_confirmation`. Acepta
  `queryShipmentStatus` inyectable (mismo patrón que `createShipment` ya
  usa) para poder testear los 3 desenlaces sin red.

- [ ] **Paso 1: extender `ShipmentDeps` y el router del handler**

```ts
export type ShipmentDeps = {
  adminClient?: MinimalSupabaseClient;
  createShipment?: typeof realCreateShipment;
  queryShipmentStatus?: typeof realQueryShipmentStatus;
};

// en handler(), antes de despachar a handleCreate:
const url = new URL(req.url);
if (req.method === "POST" && url.searchParams.get("action") === "reconcile") {
  return await handleReconcile(client, orderId, deps.queryShipmentStatus ?? realQueryShipmentStatus);
}
```

- [ ] **Paso 2: `handleReconcile`**

```ts
async function handleReconcile(
  admin: MinimalSupabaseClient,
  orderId: string,
  queryShipmentStatus: typeof realQueryShipmentStatus,
): Promise<Response> {
  const { data: current, error } = await admin.from("orders").select(SHIPMENT_SELECT).eq("id", orderId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!current) throw new HttpError(404, "Pedido no encontrado.");
  if (current.andreani_shipment_number) return Response.json({ idempotent: true, ...shipmentFields(current) });
  if (current.andreani_claim_state !== "created_unsaved" && current.andreani_claim_state !== "accepted_pending_confirmation") {
    throw new HttpError(409, "Este pedido no está en un estado que necesite reconciliación.");
  }

  const query = await queryShipmentStatus(orderId);
  const outcome = reconcileOutcome(query);

  if (outcome === "resolved" && query.found === true) {
    const { data: saved, error: saveError } = await admin.from("orders").update({
      andreani_shipment_number: query.shipmentNumber,
      andreani_status: query.status,
      andreani_claim_state: null,
      andreani_claimed_at: null,
    }).eq("id", orderId).select(SHIPMENT_SELECT).maybeSingle();
    if (saveError) throw new HttpError(500, saveError.message);
    return Response.json({ idempotent: false, reconciled: true, ...shipmentFields(saved) });
  }
  if (outcome === "released") {
    await admin.from("orders").update({ andreani_claim_state: null, andreani_claimed_at: null }).eq("id", orderId);
    return Response.json({ reconciled: false, released: true, message: "Andreani confirma que no existe un envío para este pedido. Se puede generar uno nuevo." });
  }
  return Response.json({ reconciled: false, released: false, message: "Andreani no pudo confirmar el estado todavía. Reintentá en unos minutos." });
}
```

- [ ] **Paso 3: tests — los 3 desenlaces + guardas**

```ts
Deno.test("reconcile - Andreani confirma que existe: resuelve el pedido sin volver a crear", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-reconcile-resolved";
  const row = baseOrderRow(orderId);
  row.andreani_claim_state = "created_unsaved";
  client.tables.orders.set(orderId, row);

  const reconcileReq = new Request(`https://example.com/andreani-shipment?orderId=${orderId}&action=reconcile`, {
    method: "POST", headers: (req(orderId, "POST") as Request).headers,
  });
  const response = await handler(reconcileReq, {
    adminClient: client,
    queryShipmentStatus: async () => ({ found: true, shipmentNumber: "REAL-123", status: "Creado" }),
  });
  const body = await response.json();
  assertEquals(body.reconciled, true);
  assertEquals(client.tables.orders.get(orderId)?.andreani_shipment_number, "REAL-123");
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null);
});

Deno.test("reconcile - Andreani confirma que NO existe: libera el claim, permite recrear", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-reconcile-released";
  const row = baseOrderRow(orderId);
  row.andreani_claim_state = "created_unsaved";
  client.tables.orders.set(orderId, row);

  const reconcileReq = new Request(`https://example.com/andreani-shipment?orderId=${orderId}&action=reconcile`, {
    method: "POST", headers: (req(orderId, "POST") as Request).headers,
  });
  await handler(reconcileReq, { adminClient: client, queryShipmentStatus: async () => ({ found: false }) });
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null);

  // Y ahora SÍ se puede crear de nuevo sin quedar bloqueado.
  const createResponse = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(createResponse.status, 200);
});

Deno.test("reconcile - ambiguo: no libera ni resuelve, queda igual", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-reconcile-unknown";
  const row = baseOrderRow(orderId);
  row.andreani_claim_state = "created_unsaved";
  client.tables.orders.set(orderId, row);

  const reconcileReq = new Request(`https://example.com/andreani-shipment?orderId=${orderId}&action=reconcile`, {
    method: "POST", headers: (req(orderId, "POST") as Request).headers,
  });
  await handler(reconcileReq, { adminClient: client, queryShipmentStatus: async () => ({ found: "unknown" }) });
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, "created_unsaved"); // sin cambios.
});

Deno.test("reconcile - un pedido que no está en revisión rechaza con 409", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-reconcile-invalido";
  client.tables.orders.set(orderId, baseOrderRow(orderId)); // claim_state null: nada que reconciliar.
  const reconcileReq = new Request(`https://example.com/andreani-shipment?orderId=${orderId}&action=reconcile`, {
    method: "POST", headers: (req(orderId, "POST") as Request).headers,
  });
  const response = await handler(reconcileReq, { adminClient: client });
  assertEquals(response.status, 409);
});
```

- [ ] **Paso 4: correr**

```bash
deno test --config supabase/functions/deno.json --allow-env supabase/functions
```

---

### Task 5.4: Admin — botón "Verificar estado en Andreani"

**Files:**
- Modify: `src/services/shipping/andreani-admin-client.ts`
- Modify: `src/store/store.tsx`
- Modify: `src/app/admin/pedidos/page.tsx`

- [ ] **Paso 1: cliente + store — mismo patrón que `createAndreaniShipment`**

```ts
// andreani-admin-client.ts
export async function reconcileAndreaniShipment(orderId: string, session: Session): Promise<AndreaniShipmentFields & { reconciled: boolean; released: boolean; message?: string }> {
  const response = await fetch(`${shipmentEndpoint(orderId)}&action=reconcile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
  });
  const body = await readJsonOrThrow(response);
  return {
    andreaniShipmentNumber: body.shipmentNumber ?? null,
    andreaniStatus: body.status ?? null,
    andreaniTrackingUrl: body.trackingUrl ?? null,
    reconciled: Boolean(body.reconciled),
    released: Boolean(body.released),
    message: body.message,
  };
}
```

- [ ] **Paso 2: botón visible solo cuando hace falta**

En el panel de detalle de pedido, mostrar "Verificar estado en Andreani"
únicamente cuando `selected.andreaniShipmentNumber` es null Y el pedido
muestra el estado "requiere revisión" (hoy eso se infiere del mensaje de
error guardado; con esta fase, se puede consultar el `andreani_claim_state`
si se decide exponerlo — evaluar agregarlo a `ORDER_COLUMNS`, ya que a
diferencia de `andreani_contract`/`andreani_bultos` no es un dato sensible,
es un estado operativo).

- [ ] **Paso 3: test E2E**

Extender `tests/e2e/admin-orders.spec.ts` con un caso que fuerce (vía mock
Andreani local) un pedido a `created_unsaved` y confirme que el botón
"Verificar estado" aparece y, al hacer click, el pedido se resuelve o libera
según la respuesta simulada.

---

### Compatibilidad con pedidos viejos (Fase 5)

`action=reconcile` es un nuevo endpoint aditivo — ningún pedido existente se
ve afectado a menos que su `andreani_claim_state` ya esté en
`created_unsaved`/`accepted_pending_confirmation` (que solo puede pasar
después de que las Fases 1-4 estén activas Y el flag `ANDREANI_ENABLED` esté
prendido, cosa que sigue sin pasar). El botón nuevo en el panel no aparece
para ningún pedido en su estado actual (`andreaniShipmentNumber` presente o
`claim_state` null).

### Criterio de aceptación (Fase 5)

- [ ] `reconcileOutcome` tiene 3 tests puros, PASS.
- [ ] Los 4 tests de `handleReconcile` (resolved/released/still_pending/409)
      pasan usando `queryShipmentStatus` inyectado — sin red real.
- [ ] `queryShipmentStatus` real sigue sin implementar el endpoint (lanza un
      error explícito "no confirmado todavía"), gateado por
      `readAndreaniEnv()` como el resto.
- [ ] El README (`supabase/functions/README.md`) se actualiza para
      reemplazar el runbook 100% manual por: "usar el botón Verificar
      estado; si Andreani sigue sin poder confirmar, entonces sí, pasos
      manuales de abajo" — el fallback manual queda, no se borra.

---

## Self-Review

**Cobertura del pedido del usuario** (los 5 puntos del roadmap, en orden):
1. Dirección estructurada → Fase 1. ✅
2. Atributos logísticos de productos y bultos → Fase 2. ✅
3. Estado asíncrono `accepted` después del 202 → Fase 3. ✅
4. Número y etiqueta por bulto → Fase 4. ✅
5. Reconciliación mediante GET de estado → Fase 5. ✅

Cada fase tiene explícitamente: migración (Task X.1 de cada fase), tipos TS,
componentes (checkout/admin), Functions, tests, una sección de
"Compatibilidad con pedidos viejos" y un "Criterio de aceptación" — los 7
campos que pidió el mensaje.

**Placeholder scan:** sin "TBD"/"TODO genérico". Las menciones a "TO VERIFY"
son intencionales y forman parte del contrato del plan (marcan exactamente
qué no se debe adivinar), no placeholders sin resolver.

**Consistencia de tipos entre fases:** `Parcel` (Fase 2) se reusa sin cambios
en Fase 4 (`bultos[]` usa el mismo shape por bulto). `ShipmentClaimRow`
(Fase 3) es consumido sin cambios de forma por Fase 5. `ShipmentResult` gana
campos de forma estrictamente aditiva entre Fase 3 (`pending`) y Fase 4
(`bultos`) — ninguna fase posterior renombra un campo que una fase anterior
ya definió.

---

Plan completo y guardado en `docs/superpowers/plans/2026-08-25-andreani-roadmap-fase2.md`.
