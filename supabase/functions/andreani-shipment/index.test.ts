// Correr con (desde la raíz del repo): deno test --config supabase/functions/deno.json --allow-env supabase/functions
import { assert, assertEquals } from "@std/assert";
import { AndreaniApiError, type ShipmentResult } from "../_shared/andreani.ts";
import { FakeAdminClient, type Row } from "../_shared/test-support.ts";
import { handler } from "./index.ts";

// La integración está apagada por defecto (ANDREANI_ENABLED=false). Estos
// tests ejercitan el comportamiento CON la integración prendida; el
// comportamiento con el flag apagado tiene sus propios tests al final.
Deno.env.set("ANDREANI_ENABLED", "true");

/** Corre `fn` con la integración apagada y restaura el flag después. */
async function withAndreaniDisabled(fn: () => Promise<void>) {
  Deno.env.delete("ANDREANI_ENABLED");
  try {
    await fn();
  } finally {
    Deno.env.set("ANDREANI_ENABLED", "true");
  }
}

/** createShipment falso que rechaza como lo haría Andreani. */
function failingCreateShipment(status: number | "timeout") {
  return (): Promise<ShipmentResult> => {
    throw new AndreaniApiError(
      status,
      "mensaje sanitizado de prueba",
      // "detail" simula el eco del payload que Andreani devuelve en el body:
      // lleva datos del destinatario y NUNCA puede aparecer en la respuesta.
      '{"destinatario":{"nombreCompleto":"Cliente Test","email":"cliente@test.com"}}',
    );
  };
}

function baseOrderRow(id: string): Row {
  return {
    id,
    customer_name: "Cliente Test",
    email: "cliente@test.com",
    address: "CP 3400 · Corrientes · Mitre 123",
    total: 15000,
    andreani_shipment_number: null,
    andreani_status: null,
    andreani_tracking_url: null,
    andreani_label_url: null,
    andreani_claim_state: null,
    andreani_claimed_at: null,
  };
}

function setupStaffClient(): {
  client: FakeAdminClient;
  req: (orderId: string, method: string, body?: unknown) => Request;
  getReq: (orderId: string, type: "label" | "tracking") => Request;
} {
  const client = new FakeAdminClient();
  const token = `token-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  client.setAuthUser(token, userId);
  client.tables.profiles.set(userId, { id: userId, role: "admin" });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return {
    client,
    req: (orderId, method, body) =>
      new Request(`https://example.com/andreani-shipment?orderId=${orderId}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    getReq: (orderId, type) =>
      new Request(`https://example.com/andreani-shipment?orderId=${orderId}&type=${type}`, { method: "GET", headers }),
  };
}

Deno.test("andreani-shipment POST - sin JWT rechaza con 401 antes de tocar la orden", async () => {
  const { client } = setupStaffClient();
  const orderId = "o-401";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  const req = new Request(`https://example.com/andreani-shipment?orderId=${orderId}`, { method: "POST" });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 401);
  assertEquals(client.tables.orders.get(orderId)?.andreani_shipment_number, null);
});

Deno.test("andreani-shipment POST - crea el envío (modo mock, obligatorio) y guarda todos los campos", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-create";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.idempotent, false);
  assertEquals(body.shipmentNumber, `MOCK-${orderId}`);
  assert(!("contract" in body), "la respuesta no debe exponer andreani_contract");

  const row = client.tables.orders.get(orderId)!;
  assertEquals(row.andreani_shipment_number, `MOCK-${orderId}`);
  assertEquals(row.andreani_claim_state, null); // guardado completo -> claim limpio.
});

Deno.test("andreani-shipment POST - doble click (dos POST secuenciales) no duplica el envío", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-doble-click";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const first = await handler(req(orderId, "POST", {}), { adminClient: client });
  const firstBody = await first.json();
  const second = await handler(req(orderId, "POST", {}), { adminClient: client });
  const secondBody = await second.json();

  assertEquals(firstBody.idempotent, false);
  assertEquals(secondBody.idempotent, true);
  assertEquals(firstBody.shipmentNumber, secondBody.shipmentNumber);
});

Deno.test("andreani-shipment POST - request concurrente contra un claim fresco en curso responde 409, no duplica", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-concurrente";
  const row = baseOrderRow(orderId);
  row.andreani_claim_state = "claimed";
  row.andreani_claimed_at = new Date().toISOString(); // otra request "ganó la carrera" recién.
  client.tables.orders.set(orderId, row);

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 409);
  assertEquals(client.tables.orders.get(orderId)?.andreani_shipment_number, null);
});

Deno.test("andreani-shipment POST - claim abandonado (vencido) se puede retomar y crear normalmente", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-claim-viejo";
  const row = baseOrderRow(orderId);
  row.andreani_claim_state = "claimed";
  row.andreani_claimed_at = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // TTL es 2 minutos.
  client.tables.orders.set(orderId, row);

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.shipmentNumber, `MOCK-${orderId}`);
});

Deno.test("andreani-shipment POST - Andreani ya generó pero el guardado completo falla: cae a guardado mínimo, sin duplicar en el reintento", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-guardado-parcial";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  // Falla cualquier update que intente guardar el estado/tracking/etiqueta
  // completos (el guardado "mínimo" y el claim no tocan andreani_status).
  client.failUpdate = (table, patch) => table === "orders" && "andreani_status" in patch;

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.partial, true);
  assertEquals(body.shipmentNumber, `MOCK-${orderId}`);

  const row = client.tables.orders.get(orderId)!;
  assertEquals(row.andreani_shipment_number, `MOCK-${orderId}`); // lo crítico: no se perdió.
  assertEquals(row.andreani_claim_state, "created_unsaved"); // breadcrumb de guardado incompleto.

  // Reintentar (doble click después del fallo parcial) NO debe volver a
  // llamar a Andreani: tiene que verlo como existente.
  client.failUpdate = null;
  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  const retryBody = await retry.json();
  assertEquals(retryBody.idempotent, true);
  assertEquals(retryBody.shipmentNumber, `MOCK-${orderId}`);
});

Deno.test("andreani-shipment POST - Andreani ya generó pero NI el guardado mínimo entra: bloquea el auto-reclamo (nunca duplica)", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-guardado-total-falla";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  // Falla cualquier update que intente escribir el número (completo o
  // mínimo) — el claim inicial no incluye andreani_shipment_number, así que
  // sí se logra reservar antes de que Andreani responda.
  client.failUpdate = (table, patch) => table === "orders" && "andreani_shipment_number" in patch;

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 500);

  const row = client.tables.orders.get(orderId)!;
  assertEquals(row.andreani_shipment_number, null);
  assertEquals(row.andreani_claim_state, "created_unsaved"); // marcado, aunque no se pudo guardar el número.

  // Un reintento (aunque la DB ya se recuperó) NO debe volver a llamar a
  // Andreani mientras el estado siga en revisión manual.
  client.failUpdate = null;
  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(retry.status, 409);
  const retryBody = await retry.json();
  assert(retryBody.error.includes("revisión manual") || retryBody.error.includes("revisión manual"));
});

Deno.test("andreani-shipment POST - DB caída ANTES de llamar a Andreani (falla el claim mismo) es segura de reintentar", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-db-caida-antes";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  client.failUpdate = () => true; // cualquier update de orders falla, incluido el claim.

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 500);
  assertEquals(client.tables.orders.get(orderId)?.andreani_shipment_number, null);
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null); // nunca se llegó a reservar nada.

  client.failUpdate = null;
  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(retry.status, 200); // recuperada la DB, el reintento crea normalmente.
});

Deno.test("andreani-shipment POST - falta CP en address libera el claim en vez de dejarlo trabado", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-sin-cp";
  const row = baseOrderRow(orderId);
  row.address = "sin código postal reconocible";
  client.tables.orders.set(orderId, row);

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(response.status, 422);
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null); // liberado, no trabado.
});

Deno.test("andreani-shipment GET label/tracking - exige que ya exista un envío", async () => {
  const { client, getReq } = setupStaffClient();
  const orderId = "o-sin-envio";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  const response = await handler(getReq(orderId, "label"), { adminClient: client });
  assertEquals(response.status, 409);
});

Deno.test("andreani-shipment GET label/tracking - devuelve datos (mock) una vez creado el envío", async () => {
  const { client, req, getReq } = setupStaffClient();
  const orderId = "o-con-envio";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  await handler(req(orderId, "POST", {}), { adminClient: client });

  const label = await handler(getReq(orderId, "label"), { adminClient: client });
  assertEquals(label.status, 200);
  const tracking = await handler(getReq(orderId, "tracking"), { adminClient: client });
  assertEquals(tracking.status, 200);
});

// ---- Rechazos de Andreani (punto 1) ------------------------------------
//
// En cada caso se verifica lo mismo: status devuelto, ESTADO FINAL del
// claim (que determina si se puede reintentar sin duplicar) y que el
// mensaje que ve el admin esté sanitizado (sin el eco del payload).

Deno.test("rechazo 4xx funcional - 422 al admin, claim liberado, reintento posible tras corregir", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-rechazo-400";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: failingCreateShipment(400),
  });
  assertEquals(response.status, 422);
  const body = await response.json();
  assert(body.error.includes("Revisá"), "debe decirle al admin qué revisar");
  // Se chequea CONTENIDO del payload ecoado, no palabras que el mensaje
  // sanitizado usa legítimamente como consejo ("revisá destinatario...").
  assert(!body.error.includes("cliente@test.com"), "no debe filtrar el eco del payload");
  assert(!body.error.includes("nombreCompleto"), "no debe filtrar el JSON crudo de Andreani");
  assert(!body.error.includes("mensaje sanitizado de prueba"), "usa su propio mensaje, no el del error interno");

  const row = client.tables.orders.get(orderId)!;
  assertEquals(row.andreani_claim_state, null); // liberado.
  assertEquals(row.andreani_shipment_number, null);

  // Reintento permitido: con un createShipment que funciona, crea normalmente.
  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(retry.status, 200);
});

Deno.test("rechazo 401 credenciales - 502 al admin, claim liberado, sin revelar qué credencial", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-rechazo-401";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: failingCreateShipment(401),
  });
  assertEquals(response.status, 502);
  const body = await response.json();
  assert(body.error.includes("credenciales"));
  for (const leak of ["ANDREANI_API_USER", "ANDREANI_API_PASSWORD", "ANDREANI_CONTRACT", "cliente@test.com"]) {
    assert(!body.error.includes(leak), `no debe filtrar ${leak}`);
  }
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null);
});

Deno.test("rechazo 403 credenciales - mismo tratamiento que 401", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-rechazo-403";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: failingCreateShipment(403),
  });
  assertEquals(response.status, 502);
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null);
});

Deno.test("rechazo 429 - 429 al admin, claim liberado, reintento permitido más tarde", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-rechazo-429";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: failingCreateShipment(429),
  });
  assertEquals(response.status, 429);
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, null);

  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(retry.status, 200); // el reintento es legítimo acá.
});

Deno.test("rechazo 5xx - AMBIGUO: claim retenido y reintento PROHIBIDO (no duplicar envío real)", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-rechazo-500";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: failingCreateShipment(500),
  });
  assertEquals(response.status, 502);
  const body = await response.json();
  assert(body.error.includes("revisión manual"));
  assert(!body.error.includes("cliente@test.com"));

  // Clave: el claim NO se liberó.
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, "created_unsaved");

  // Y un reintento (incluso con Andreani sano) queda bloqueado.
  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(retry.status, 409);
  const retryBody = await retry.json();
  assert(retryBody.error.includes("revisión manual"));
  assertEquals(client.tables.orders.get(orderId)?.andreani_shipment_number, null);
});

Deno.test("timeout - AMBIGUO: 504, claim retenido y reintento PROHIBIDO", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-timeout";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: failingCreateShipment("timeout"),
  });
  assertEquals(response.status, 504);
  const body = await response.json();
  assert(body.error.includes("revisión manual"));

  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, "created_unsaved");

  const retry = await handler(req(orderId, "POST", {}), { adminClient: client });
  assertEquals(retry.status, 409);
});

Deno.test("error inesperado (no AndreaniApiError) - se trata como ambiguo: claim retenido", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-error-raro";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), {
    adminClient: client,
    createShipment: () => {
      throw new Error("algo totalmente inesperado");
    },
  });
  assertEquals(response.status, 502);
  // Ante la duda, se retiene: nunca liberar sin saber si se creó el envío.
  assertEquals(client.tables.orders.get(orderId)?.andreani_claim_state, "created_unsaved");
  const body = await response.json();
  assert(!body.error.includes("algo totalmente inesperado"), "no propaga el mensaje interno crudo");
});

// ---- Feature flag apagado (punto 2) ------------------------------------

Deno.test("flag apagado - POST rechaza con 503 y no toca el pedido", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-flag-off";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  await withAndreaniDisabled(async () => {
    const response = await handler(req(orderId, "POST", {}), { adminClient: client });
    assertEquals(response.status, 503);
    const row = client.tables.orders.get(orderId)!;
    assertEquals(row.andreani_shipment_number, null);
    assertEquals(row.andreani_claim_state, null); // ni siquiera se reclamó.
  });
});

Deno.test("flag apagado - GET label/tracking también rechaza con 503", async () => {
  const { client, req, getReq } = setupStaffClient();
  const orderId = "o-flag-off-get";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  await handler(req(orderId, "POST", {}), { adminClient: client }); // creado con el flag prendido.

  await withAndreaniDisabled(async () => {
    assertEquals((await handler(getReq(orderId, "label"), { adminClient: client })).status, 503);
    assertEquals((await handler(getReq(orderId, "tracking"), { adminClient: client })).status, 503);
  });
});

Deno.test("flag apagado - sin JWT sigue devolviendo 401, no revela el estado de la integración", async () => {
  const { client } = setupStaffClient();
  const orderId = "o-flag-off-401";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  await withAndreaniDisabled(async () => {
    const req = new Request(`https://example.com/andreani-shipment?orderId=${orderId}`, { method: "POST" });
    const response = await handler(req, { adminClient: client });
    assertEquals(response.status, 401);
  });
});

// ---- Etiqueta: referencia temporal, nunca servida desde la fila ---------

Deno.test("etiqueta - la respuesta de creación NO incluye labelUrl (referencia temporal, datos personales)", async () => {
  const { client, req } = setupStaffClient();
  const orderId = "o-etiqueta-no-en-create";
  client.tables.orders.set(orderId, baseOrderRow(orderId));

  const response = await handler(req(orderId, "POST", {}), { adminClient: client });
  const body = await response.json();
  assert(!("labelUrl" in body), "la creación no debe devolver una URL de etiqueta potencialmente vencida");
  assert(!("contract" in body), "tampoco el contrato");
});

Deno.test("etiqueta - se obtiene on-demand y la respuesta no se cachea", async () => {
  const { client, req, getReq } = setupStaffClient();
  const orderId = "o-etiqueta-on-demand";
  client.tables.orders.set(orderId, baseOrderRow(orderId));
  await handler(req(orderId, "POST", {}), { adminClient: client });

  const response = await handler(getReq(orderId, "label"), { adminClient: client });
  assertEquals(response.status, 200);
  // La etiqueta lleva datos personales: no debe quedar en cachés intermedias.
  assertEquals(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert(typeof body.url === "string" && body.url.length > 0);
});
