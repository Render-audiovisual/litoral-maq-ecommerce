import { createAdminClient, requireStaff, type MinimalSupabaseClient } from "../_shared/supabase-admin.ts";
import { errorResponse, HttpError } from "../_shared/http.ts";
import {
  AndreaniApiError,
  AndreaniDisabledError,
  assertAndreaniEnabled,
  CLAIM_TTL_MS,
  checkRateLimit,
  claimOutcome,
  classifyAndreaniError,
  createShipment as realCreateShipment,
  decideShipmentClaim,
  extractPostalCode,
  getLabel,
  getTracking,
  RateLimitError,
  type ShipmentClaimRow,
} from "../_shared/andreani.ts";

/** Solo para tests: permite inyectar un createShipment que falle de formas
 * específicas (4xx, 401, 429, 5xx, timeout). En producción nunca se pasa. */
export type ShipmentDeps = {
  adminClient?: MinimalSupabaseClient;
  createShipment?: typeof realCreateShipment;
};

const SHIPMENT_SELECT = "id, customer_name, email, address, total, andreani_shipment_number, andreani_status, andreani_tracking_url, andreani_label_url, andreani_claim_state, andreani_claimed_at";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// deno-lint-ignore no-explicit-any
function shipmentFields(row: any) {
  // Nunca se devuelve andreani_contract en la respuesta (ver auditoría de
  // seguridad: usuario/contraseña/token/contrato no van en ninguna respuesta).
  return {
    orderId: row.id,
    shipmentNumber: row.andreani_shipment_number,
    status: row.andreani_status,
    trackingUrl: row.andreani_tracking_url,
    labelUrl: row.andreani_label_url,
  };
}

/**
 * POST ?orderId=X — crea el preenvío. Idempotente y con máquina de estados
 * (ver decideShipmentClaim / nextClaimStateAfterAttempt en _shared/andreani.ts):
 * la propiedad de seguridad clave es que si Andreani ya devolvió un número
 * de envío, el claim jamás se libera ni se puede reclamar de nuevo aunque
 * falle el guardado — evita el escenario "timeout después de creado, antes
 * de guardado" duplicando un envío real en un reintento automático.
 */
async function handleCreate(
  req: Request,
  admin: MinimalSupabaseClient,
  orderId: string,
  createShipment: typeof realCreateShipment,
): Promise<Response> {
  const { data: current, error: readError } = await admin.from("orders").select(SHIPMENT_SELECT).eq("id", orderId).maybeSingle();
  if (readError) throw new HttpError(500, readError.message);
  if (!current) throw new HttpError(404, "Pedido no encontrado.");

  const claimed = await acquireClaim(admin, orderId, current);
  if (claimed.decision !== "claim") return respondForNonClaimDecision(claimed.decision, claimed.row);

  const body = await req.json().catch(() => ({}));
  const postalCode = body?.postalCode || extractPostalCode(claimed.row!.address);
  if (!postalCode) {
    await releaseClaim(admin, orderId); // todavía no se llamó a Andreani: liberar es seguro.
    throw new HttpError(422, "No se pudo determinar el código postal del pedido (address no tiene el formato esperado).");
  }

  let result;
  try {
    result = await createShipment({
      orderId,
      recipientName: claimed.row!.customer_name,
      email: claimed.row!.email,
      address: claimed.row!.address ?? "",
      postalCode,
      declaredValue: claimed.row!.total,
      parcel: body?.parcel,
    });
  } catch (error) {
    // Andreani rechazó o no respondió. Qué hacer con el claim NO es uniforme:
    // depende de si sabemos con certeza que no se creó nada (4xx -> liberar)
    // o si es ambiguo (5xx/timeout -> retener para revisión manual, porque
    // reintentar podría duplicar un envío real). Ver classifyAndreaniError.
    const classified = error instanceof AndreaniApiError
      ? classifyAndreaniError(error.status)
      : classifyAndreaniError(500); // error inesperado: se trata como ambiguo (hold).

    if (classified.claim === "release") {
      await releaseClaim(admin, orderId);
    } else {
      await holdClaimForManualReview(admin, orderId);
    }

    // El detalle crudo de Andreani (que puede ecoar datos del destinatario)
    // solo va al log del servidor, nunca a la respuesta HTTP.
    if (error instanceof AndreaniApiError && error.detail) {
      console.error(`[andreani-shipment] pedido ${orderId} — Andreani ${error.status}: ${error.detail}`);
    }
    throw new HttpError(classified.httpStatus, classified.message);
  }

  // A partir de acá Andreani YA generó un envío real (o simulado en mock) —
  // el claim no se libera más pase lo que pase con el guardado.
  return await persistShipmentResult(admin, orderId, result);
}

async function acquireClaim(
  admin: MinimalSupabaseClient,
  orderId: string,
  current: ShipmentClaimRow & { id: string; customer_name: string; email: string; address: string | null; total: number },
): Promise<{ decision: "claim" | "existing" | "in_progress" | "needs_manual_review"; row: typeof current | null }> {
  const decision = decideShipmentClaim(current);
  if (decision !== "claim") return { decision, row: current };

  // Paso 1: intento de claim "en frío" (nunca reclamado antes) — el caso normal.
  const { data: fresh, error: freshError } = await admin
    .from("orders")
    .update({ andreani_claim_state: "claimed", andreani_claimed_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("andreani_shipment_number", null)
    .is("andreani_claim_state", null)
    .select(SHIPMENT_SELECT)
    .maybeSingle();
  if (freshError) throw new HttpError(500, freshError.message);
  if (fresh) return { decision: "claim", row: fresh };

  // Paso 2: no se pudo en frío — puede ser una carrera concurrente (alguien
  // más lo reclamó recién) o un claim 'claimed' vencido para retomar.
  const cutoff = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data: reclaimed, error: reclaimError } = await admin
    .from("orders")
    .update({ andreani_claim_state: "claimed", andreani_claimed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("andreani_claim_state", "claimed")
    .lt("andreani_claimed_at", cutoff)
    .select(SHIPMENT_SELECT)
    .maybeSingle();
  if (reclaimError) throw new HttpError(500, reclaimError.message);
  if (reclaimed) return { decision: "claim", row: reclaimed };

  // Perdimos ambas carreras: releer el estado actual y devolver la decisión real.
  const { data: after, error: afterError } = await admin.from("orders").select(SHIPMENT_SELECT).eq("id", orderId).maybeSingle();
  if (afterError) throw new HttpError(500, afterError.message);
  if (!after) throw new HttpError(404, "Pedido no encontrado.");
  return { decision: decideShipmentClaim(after), row: after };
}

function respondForNonClaimDecision(
  decision: "existing" | "in_progress" | "needs_manual_review",
  // deno-lint-ignore no-explicit-any
  row: any,
): Response {
  if (decision === "existing") return Response.json({ idempotent: true, ...shipmentFields(row) });
  if (decision === "needs_manual_review") {
    throw new HttpError(
      409,
      `Andreani ya generó un envío para el pedido ${row.id} pero no se pudo confirmar el guardado del número. ` +
        "NO reintentar desde acá: requiere revisión manual (chequear en Andreani si el envío existe) antes de generar uno nuevo.",
    );
  }
  throw new HttpError(409, "Ya hay una creación de envío en curso para este pedido. Reintentá en unos segundos.");
}

async function releaseClaim(admin: MinimalSupabaseClient, orderId: string) {
  await admin.from("orders").update({ andreani_claim_state: null, andreani_claimed_at: null }).eq("id", orderId);
}

/**
 * Retiene el claim en 'created_unsaved' tras una respuesta AMBIGUA de
 * Andreani (5xx o timeout): puede que el envío se haya creado del lado de
 * ellos aunque nosotros no hayamos recibido el número. decideShipmentClaim()
 * nunca reclama ese estado automáticamente, así que el pedido queda
 * bloqueado hasta que una persona verifique en Andreani si el envío existe.
 *
 * Esto se mantiene así HASTA confirmar con Andreani (ver README / pedido de
 * documentación) que su API permite: (a) buscar un envío por referencia
 * externa / idOrdenOrigen, o (b) aceptar una idempotency key. Con cualquiera
 * de las dos, este caso se puede automatizar; sin ellas, auto-reintentar es
 * arriesgar un envío real duplicado y un cargo real duplicado.
 */
async function holdClaimForManualReview(admin: MinimalSupabaseClient, orderId: string) {
  await admin
    .from("orders")
    .update({ andreani_claim_state: "created_unsaved", andreani_claimed_at: new Date().toISOString() })
    .eq("id", orderId);
}

/** claimOutcome() dice QUÉ debería pasar; esto lo traduce al valor de columna. */
function claimStateColumnFor(shipmentNumberWasPersisted: boolean): "created_unsaved" | null {
  return claimOutcome(true, shipmentNumberWasPersisted) === "resolved" ? null : "created_unsaved";
}

const SAVE_RETRY_DELAYS_MS = [150, 300];

/**
 * Guarda el resultado de Andreani con reintentos, y si todos fallan hace un
 * guardado mínimo de emergencia (solo el número) para que decideShipmentClaim
 * lo detecte como 'existing' cuanto antes. Nunca libera el claim a partir de
 * acá — ver claimOutcome().
 */
async function persistShipmentResult(
  admin: MinimalSupabaseClient,
  orderId: string,
  // deno-lint-ignore no-explicit-any
  result: any,
): Promise<Response> {
  const fullUpdate = {
    andreani_shipment_number: result.shipmentNumber,
    andreani_status: result.status,
    andreani_tracking_url: result.trackingUrl,
    andreani_label_url: result.labelUrl,
    // Del entorno de la Function, nunca de la request (ver ShipmentResult).
    andreani_contract: result.contract,
    andreani_claim_state: claimStateColumnFor(true), // se está guardando el número en este mismo statement -> null.
    andreani_claimed_at: null,
  };

  for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
    const { data: saved, error: saveError } = await admin
      .from("orders")
      .update(fullUpdate)
      .eq("id", orderId)
      .select(SHIPMENT_SELECT)
      .maybeSingle();
    if (!saveError && saved) return Response.json({ idempotent: false, ...shipmentFields(saved) });
    if (attempt < SAVE_RETRY_DELAYS_MS.length) await sleep(SAVE_RETRY_DELAYS_MS[attempt]);
  }

  // Guardado completo falló todas las veces: intento mínimo, solo el número.
  // decideShipmentClaim ya lo trata como "existing" en cuanto el número está
  // (no depende de claim_state para eso) — se deja 'created_unsaved' a
  // propósito como breadcrumb de "guardado parcial, falta completar" en vez
  // de limpiarlo a null, para que quede visible que status/tracking/etiqueta
  // no se guardaron y hace falta un GET ?type=tracking|label de seguimiento.
  const { data: minimal, error: minimalError } = await admin
    .from("orders")
    .update({ andreani_shipment_number: result.shipmentNumber, andreani_claim_state: "created_unsaved" })
    .eq("id", orderId)
    .select(SHIPMENT_SELECT)
    .maybeSingle();
  if (!minimalError && minimal) {
    return Response.json({ idempotent: false, partial: true, ...shipmentFields(minimal) });
  }

  // Último recurso: ni siquiera el guardado mínimo entró. Marcar
  // created_unsaved sin el número (mejor que nada: bloquea el auto-reclamo)
  // y loguear fuerte para revisión manual — nunca credenciales, solo
  // orderId + shipmentNumber que YA es dato nuestro, no de Andreani.
  await admin.from("orders").update({ andreani_claim_state: "created_unsaved" }).eq("id", orderId).select("id").maybeSingle();
  console.error(
    `[andreani-shipment] Andreani generó el envío ${result.shipmentNumber} para el pedido ${orderId} pero no se pudo ` +
      "guardar en la base tras reintentar. Revisión manual requerida — no reintentar generar otro envío para este pedido.",
  );
  throw new HttpError(
    500,
    `Andreani generó el envío pero no se pudo confirmar el guardado (pedido ${orderId}). ` +
      "Revisión manual requerida antes de reintentar — no generar un envío nuevo para este pedido.",
  );
}

// GET ?orderId=X&type=label|tracking — sobre un envío ya creado.
async function handleRead(req: Request, admin: MinimalSupabaseClient, orderId: string): Promise<Response> {
  const type = new URL(req.url).searchParams.get("type");
  const { data: order, error } = await admin.from("orders").select("andreani_shipment_number").eq("id", orderId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!order?.andreani_shipment_number) throw new HttpError(409, "El pedido todavía no tiene envío de Andreani.");
  if (type === "label") return Response.json(await getLabel(order.andreani_shipment_number));
  if (type === "tracking") return Response.json(await getTracking(order.andreani_shipment_number));
  throw new HttpError(400, 'type debe ser "label" o "tracking".');
}

export async function handler(req: Request, deps: ShipmentDeps = {}): Promise<Response> {
  try {
    const client = deps.adminClient ?? createAdminClient();
    const staff = await requireStaff(req, client);
    // Después de autenticar (para no revelarle el estado de la integración a
    // un desconocido) y antes de cualquier operación, lectura incluida.
    assertAndreaniEnabled();
    checkRateLimit(staff.id);

    const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
    if (!orderId) throw new HttpError(400, "Falta orderId.");

    if (req.method === "GET") return await handleRead(req, client, orderId);
    if (req.method === "POST") return await handleCreate(req, client, orderId, deps.createShipment ?? realCreateShipment);
    throw new HttpError(405, "Método no soportado.");
  } catch (error) {
    if (error instanceof AndreaniDisabledError) return errorResponse(new HttpError(503, error.message));
    if (error instanceof RateLimitError) return errorResponse(new HttpError(429, error.message));
    return errorResponse(error);
  }
}

// import.meta.main: no arrancar el server al importar index.ts desde un
// test (index.test.ts importa `handler` directamente) — solo al ejecutar
// este archivo como entry point real (Deno.serve de la plataforma).
if (import.meta.main) Deno.serve((req) => handler(req));
