// Capa Andreani (server-only, Deno Edge Functions).
//
// TO VERIFY: no existe spec self-service en developers.andreani.com (es un
// sitio de marketing/FAQ; el portal público que sí lista linkea a
// developers-sandbox.andreani.com, que documenta el producto Almacenes/
// depósito — kitting, stock, lotes — NO el de envíos/cotización/sucursales
// que necesitamos). Según la FAQ del propio sitio, las credenciales
// (SANDBOX → QA → PRODUCCIÓN) y la documentación real las entrega el
// Ejecutivo Comercial por mail. Todo lo de acá está reconstruido de SDKs
// públicos de terceros (node/PHP/Python) que coinciden entre sí en la forma
// general — confirmar cada endpoint/payload contra el paquete real antes de
// tocar SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS.

export type AndreaniMode = "mock" | "qa" | "production";

type AndreaniEnv =
  | { mode: "mock" }
  | {
      mode: "qa" | "production";
      baseUrl: string;
      user: string;
      password: string;
      client: string;
      contract: string;
    };

const VALID_MODES: AndreaniMode[] = ["mock", "qa", "production"];

/**
 * Feature flag server-side, apagado por defecto. Es INDEPENDIENTE de
 * ANDREANI_MODE y de las credenciales: aunque todo lo demás esté bien
 * configurado, con esto en false ninguna Function ejecuta ninguna operación
 * (ni siquiera cotizar o devolver un mock). Se lee como string exacto
 * "true" — cualquier otro valor, incluido ausente, deja la integración
 * apagada. Prendes esto a mano y a propósito, nunca por accidente.
 */
export function isAndreaniEnabled(): boolean {
  return (Deno.env.get("ANDREANI_ENABLED") ?? "").trim().toLowerCase() === "true";
}

export class AndreaniDisabledError extends Error {
  constructor() {
    super("La integración con Andreani está desactivada (ANDREANI_ENABLED=false).");
  }
}

/** Corta cualquier operación mientras el flag esté apagado. Se llama al
 * principio de cada Function, además de las guardas de modo/credenciales. */
export function assertAndreaniEnabled(): void {
  if (!isAndreaniEnabled()) throw new AndreaniDisabledError();
}

/**
 * Segunda guarda, independiente de las variables de entorno: aunque existan
 * las 5 credenciales QA/producción, el modo real queda bloqueado hasta que
 * un humano contraste cada endpoint/payload `TO VERIFY` de este archivo
 * contra la documentación real que entregue Andreani y cambie esto a
 * `true` a mano (un commit explícito, revisable en code review — no un
 * flag de entorno que alguien pueda setear sin darse cuenta del alcance).
 */
const SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS = false;

/** Guarda dura combinada: sin credenciales completas Y sin spec verificada,
 * ANDREANI_MODE no puede ser otra cosa que "mock" — ninguna función de este
 * módulo llega a hacer un fetch real si esto no pasa. */
export function readAndreaniEnv(): AndreaniEnv {
  // Primer corte, antes que cualquier otra cosa: si el flag está apagado no
  // hay operación posible — ni real, ni QA, ni mock. Va acá (y no solo en
  // los handlers) porque TODA función de red de este módulo pasa por acá,
  // así que es estructuralmente imposible saltearlo desde una Function nueva
  // que se olvide de la guarda.
  assertAndreaniEnabled();

  const raw = (Deno.env.get("ANDREANI_MODE") ?? "mock").trim().toLowerCase();
  if (!VALID_MODES.includes(raw as AndreaniMode)) {
    throw new Error(`ANDREANI_MODE inválido: "${raw}". Usar mock, qa o production.`);
  }
  const mode = raw as AndreaniMode;
  if (mode === "mock") return { mode };

  if (!SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS) {
    throw new Error(
      `ANDREANI_MODE="${mode}" pero SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS sigue en false en ` +
        "supabase/functions/_shared/andreani.ts. Los endpoints/payloads de este archivo son " +
        "TO VERIFY (no confirmados contra documentación oficial) — contrastarlos primero.",
    );
  }

  const required = {
    baseUrl: Deno.env.get("ANDREANI_BASE_URL")?.trim(),
    user: Deno.env.get("ANDREANI_API_USER")?.trim(),
    password: Deno.env.get("ANDREANI_API_PASSWORD")?.trim(),
    client: Deno.env.get("ANDREANI_CLIENT")?.trim(),
    contract: Deno.env.get("ANDREANI_CONTRACT")?.trim(),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    // Nunca se interpola ningún valor de `required` acá — solo los NOMBRES
    // de las variables que faltan. Cubierto por
    // andreani.test.ts "no filtra valores de credenciales en errores".
    throw new Error(
      `ANDREANI_MODE="${mode}" pero faltan variables: ${missing.join(", ")}. ` +
        "Mientras no existan credenciales QA completas, está prohibido crear envíos reales.",
    );
  }
  return {
    mode,
    baseUrl: required.baseUrl!.replace(/\/$/, ""),
    user: required.user!,
    password: required.password!,
    client: required.client!,
    contract: required.contract!,
  };
}

type RealEnv = Extract<AndreaniEnv, { mode: "qa" | "production" }>;

// ponytail: token cacheado en memoria del proceso (se pierde en cada cold
// start de la función); suficiente para el volumen esperado. Upgrade path si
// hiciera falta: guardarlo en una tabla/KV compartida entre invocaciones.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(env: RealEnv): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) return cachedToken.value;

  // TO VERIFY: endpoint/payload de autenticación real. user/password van
  // SOLO en el header Authorization de este fetch — nunca interpolados en
  // ningún string de error/log de este módulo (ver request() más abajo).
  const response = await fetch(`${env.baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${env.user}:${env.password}`)}`,
    },
  });
  if (!response.ok) {
    // Un fallo de login es siempre un problema de credenciales/config, no del
    // pedido — se clasifica igual que un 401/403 de cualquier otro endpoint.
    throw new AndreaniApiError(response.status, classifyAndreaniError(response.status).message);
  }
  const body = await response.json();
  const token = body.token as string | undefined;
  if (!token) throw new AndreaniApiError(502, classifyAndreaniError(502).message);
  // TO VERIFY: vencimiento real del token (55min es un valor conservador de ejemplo).
  cachedToken = { value: token, expiresAt: now + 55 * 60 * 1000 };
  return token;
}

const MAX_ERROR_BODY_LENGTH = 300;

/**
 * Error de una llamada a Andreani. `status` es el HTTP que devolvió Andreani,
 * o "timeout" para un fallo de red/timeout (no hubo respuesta).
 *
 * `message` es SIEMPRE seguro de mostrarle a un admin: no contiene
 * credenciales ni el cuerpo crudo de Andreani. El cuerpo (que puede ecoar el
 * payload que mandamos, con datos del destinatario) va aparte en `detail`,
 * que solo se loguea del lado servidor y nunca viaja en una respuesta HTTP.
 */
export class AndreaniApiError extends Error {
  constructor(
    public status: number | "timeout",
    message: string,
    public detail: string = "",
  ) {
    super(message);
  }
}

export type AndreaniErrorClass = {
  /** Status HTTP que devolvemos al panel admin. */
  httpStatus: number;
  /**
   * Qué hacer con el claim del pedido:
   *  - "release": Andreani rechazó la request ANTES de procesarla, no existe
   *    envío del lado de ellos -> liberar el claim y permitir reintentar.
   *  - "hold": no sabemos si el envío se creó (5xx/timeout) -> NUNCA liberar
   *    ni auto-reintentar; queda para revisión manual (ver item 4 / README).
   */
  claim: "release" | "hold";
  /** Si un reintento automático/inmediato es aceptable. */
  retriable: boolean;
  message: string;
};

/**
 * Clasifica un fallo de Andreani. Pura y exportada para poder testear cada
 * caso sin red (ver andreani.test.ts).
 *
 * La distinción crítica es 4xx vs 5xx/timeout:
 *  - Un 4xx es una respuesta DELIBERADA de Andreani: la request se procesó y
 *    se rechazó, no hay envío creado -> liberar el claim es seguro.
 *  - Un 5xx o un timeout son AMBIGUOS: Andreani pudo haber creado el envío
 *    y perdido la respuesta. Liberar el claim ahí permitiría un reintento
 *    que duplicaría un envío real, así que se retiene para revisión manual.
 */
export function classifyAndreaniError(status: number | "timeout"): AndreaniErrorClass {
  if (status === "timeout") {
    return {
      httpStatus: 504,
      claim: "hold",
      retriable: false,
      message:
        "Andreani no respondió a tiempo. No se puede saber si el envío se generó igual: " +
        "requiere revisión manual antes de reintentar (no generar otro envío para este pedido).",
    };
  }
  if (status === 401 || status === 403) {
    // Nunca decir CUÁL credencial falló ni reflejar el cuerpo de la respuesta.
    return {
      httpStatus: 502,
      claim: "release",
      retriable: false,
      message:
        "Andreani rechazó las credenciales de la integración. No es un problema del pedido: " +
        "hay que revisar la configuración del servidor antes de reintentar.",
    };
  }
  if (status === 429) {
    return {
      httpStatus: 429,
      claim: "release",
      retriable: true,
      message: "Andreani está limitando la cantidad de solicitudes. Esperá unos minutos y reintentá.",
    };
  }
  if (status >= 400 && status < 500) {
    return {
      httpStatus: 422,
      claim: "release",
      retriable: false,
      message:
        `Andreani rechazó los datos del envío (código ${status}). ` +
        "Revisá destinatario, domicilio, código postal y bultos del pedido antes de reintentar.",
    };
  }
  return {
    httpStatus: 502,
    claim: "hold",
    retriable: false,
    message:
      `Andreani devolvió un error interno (código ${status}). No se puede saber si el envío se generó igual: ` +
      "requiere revisión manual antes de reintentar (no generar otro envío para este pedido).",
  };
}

// deno-lint-ignore no-explicit-any
async function request(env: AndreaniEnv, path: string, init: RequestInit = {}): Promise<any> {
  if (env.mode === "mock") throw new Error("request() no debe llamarse en modo mock.");
  const token = await getToken(env);

  let response: Response;
  try {
    response = await fetch(`${env.baseUrl}${path}`, {
      ...init,
      // El token es Bearer de Andreani, no una credencial nuestra reutilizable
      // fuera de esta llamada — igual, nunca se refleja en el mensaje de error.
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch (error) {
    // Fallo de red / timeout: no hubo respuesta, no sabemos qué pasó del otro lado.
    const detail = error instanceof Error ? error.message : String(error);
    throw new AndreaniApiError("timeout", classifyAndreaniError("timeout").message, detail);
  }

  if (!response.ok) {
    // El cuerpo de la respuesta de Andreani puede incluir el payload que
    // mandamos (eco, con datos del destinatario) — se guarda en `detail`
    // para el log del servidor, NUNCA en el mensaje que ve el frontend.
    const detail = (await response.text().catch(() => "")).slice(0, MAX_ERROR_BODY_LENGTH);
    throw new AndreaniApiError(response.status, classifyAndreaniError(response.status).message, detail);
  }
  return response.status === 204 ? null : response.json();
}

// ---- Validación de entrada (pura, testeable sin red) --------------------

const POSTAL_CODE_RE = /^\d{4}$/;
const MAX_WEIGHT_KG = 500;
const MAX_DIMENSION_CM = 300;
const MAX_DECLARED_VALUE = 50_000_000;

export class ValidationError extends Error {}

function positiveNumber(value: unknown, field: string, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new ValidationError(`${field} debe ser un número mayor a 0.`);
  if (num > max) throw new ValidationError(`${field} supera el máximo permitido (${max}).`);
  return num;
}

export type QuoteInput = {
  postalCode: string;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValue?: number;
};

/** Valida y normaliza el body crudo de andreani-quote. Separado de la
 * función de red para poder testearlo sin fetch (ver andreani.test.ts). */
export function validateQuoteInput(body: unknown): QuoteInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const postalCode = String(raw.postalCode ?? "");
  if (!POSTAL_CODE_RE.test(postalCode)) throw new ValidationError("postalCode debe tener 4 dígitos.");
  const weightKg = positiveNumber(raw.weightKg, "weightKg", MAX_WEIGHT_KG);
  const input: QuoteInput = { postalCode, weightKg };
  if (raw.lengthCm !== undefined) input.lengthCm = positiveNumber(raw.lengthCm, "lengthCm", MAX_DIMENSION_CM);
  if (raw.widthCm !== undefined) input.widthCm = positiveNumber(raw.widthCm, "widthCm", MAX_DIMENSION_CM);
  if (raw.heightCm !== undefined) input.heightCm = positiveNumber(raw.heightCm, "heightCm", MAX_DIMENSION_CM);
  if (raw.declaredValue !== undefined) {
    input.declaredValue = positiveNumber(raw.declaredValue, "declaredValue", MAX_DECLARED_VALUE);
  }
  return input;
}

export type GeoResource = "localidades" | "sucursales";

export function validateGeoQuery(resourceRaw: string | null, postalCodeRaw: string | null): {
  resource: GeoResource;
  postalCode: string;
} {
  if (resourceRaw !== "localidades" && resourceRaw !== "sucursales") {
    throw new ValidationError('resource debe ser "localidades" o "sucursales".');
  }
  const postalCode = postalCodeRaw ?? "";
  if (!POSTAL_CODE_RE.test(postalCode)) throw new ValidationError("postalCode debe tener 4 dígitos.");
  return { resource: resourceRaw, postalCode };
}

// ---- Rate limiting básico (por instancia, ver ceiling documentado) ------

// ponytail: contador en memoria por instancia de función — NO es un rate
// limit global (cada cold start / instancia paralela tiene el suyo), pero
// junto con requireStaff() (exige JWT admin/employee, nada de esto es
// público) alcanza como primera barrera contra un loop accidental o un
// admin comprometido golpeando la función en bucle. Upgrade path si hiciera
// falta un límite real: una tabla/KV compartida (ej. Supabase) con conteo
// por caller_id y ventana deslizante.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitHits = new Map<string, number[]>();

export class RateLimitError extends Error {}

export function checkRateLimit(callerId: string, now: number = Date.now()): void {
  const hits = (rateLimitHits.get(callerId) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    throw new RateLimitError("Demasiadas solicitudes en poco tiempo. Esperá un minuto y reintentá.");
  }
  hits.push(now);
  rateLimitHits.set(callerId, hits);
}

// ---- Cotización ------------------------------------------------------

export type QuoteResult = { amount: number; eta: string; simulated: boolean };

export async function quote(input: QuoteInput): Promise<QuoteResult> {
  const env = readAndreaniEnv();
  if (env.mode === "mock") return mockQuote(input);

  // TO VERIFY: endpoint/payload real de cotización.
  const data = await request(env, "/v2/tarifas", {
    method: "POST",
    body: JSON.stringify({
      cpDestino: input.postalCode,
      contrato: env.contract,
      cliente: env.client,
      pesoTotal: input.weightKg,
      volumenTotal: ((input.lengthCm ?? 30) * (input.widthCm ?? 20) * (input.heightCm ?? 15)) / 1_000_000,
      valorDeclarado: input.declaredValue ?? 0,
    }),
  });
  return {
    amount: Number(data.tarifaConIVA ?? data.tarifa ?? 0),
    eta: String(data.plazoEntrega ?? ""),
    simulated: false,
  };
}

export function mockQuote(input: QuoteInput): QuoteResult {
  const amount = Math.round(2500 + input.weightKg * 350);
  return { amount, eta: "3 a 5 días hábiles (mock)", simulated: true };
}

// ---- Localidades y sucursales -----------------------------------------

export type LocalidadResult = { nombre: string; provincia: string; codigoPostal: string };
export type SucursalResult = { codigo: string; nombre: string; direccion: string; provincia: string };

export async function localidades(postalCode: string): Promise<LocalidadResult[]> {
  const env = readAndreaniEnv();
  if (env.mode === "mock") {
    return [{ nombre: "Localidad de prueba (mock)", provincia: "Buenos Aires", codigoPostal: postalCode }];
  }
  // TO VERIFY: endpoint/forma real de respuesta.
  const data = await request(env, `/v1/localidades?codigoPostal=${encodeURIComponent(postalCode)}`);
  const rows = Array.isArray(data) ? data : (data?.localidades ?? []);
  // deno-lint-ignore no-explicit-any
  return rows.map((item: any) => ({
    nombre: item.nombre ?? item.localidad ?? "",
    provincia: item.provincia ?? "",
    codigoPostal: item.codigoPostal ?? postalCode,
  }));
}

export async function sucursales(postalCode: string): Promise<SucursalResult[]> {
  const env = readAndreaniEnv();
  if (env.mode === "mock") {
    return [
      { codigo: "MOCK-001", nombre: "Sucursal de prueba (mock)", direccion: "Av. Siempreviva 742", provincia: "Buenos Aires" },
    ];
  }
  // TO VERIFY: endpoint/forma real de respuesta.
  const data = await request(env, `/v1/sucursales?codigoPostal=${encodeURIComponent(postalCode)}`);
  const rows = Array.isArray(data) ? data : (data?.sucursales ?? []);
  // deno-lint-ignore no-explicit-any
  return rows.map((item: any) => ({
    codigo: item.codigo ?? item.numero ?? "",
    nombre: item.nombre ?? "",
    direccion: item.direccion ?? "",
    provincia: item.provincia ?? "",
  }));
}

// ---- Preenvío, etiqueta y tracking -------------------------------------

export type Parcel = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };

// ponytail: bulto por defecto — el catálogo (Product, src/lib/types.ts) no
// tiene peso/dimensiones por producto todavía. Upgrade path: agregar esos
// campos al catálogo y calcular el bulto real sumando las líneas del pedido
// antes de llamar a createShipment (fuera de alcance de esta capa server-only).
export const DEFAULT_PARCEL: Parcel = { weightKg: 3, lengthCm: 30, widthCm: 20, heightCm: 15 };

export type ShipmentInput = {
  orderId: string;
  recipientName: string;
  email: string;
  address: string;
  postalCode: string;
  declaredValue: number;
  parcel?: Parcel;
};
export type ShipmentResult = {
  shipmentNumber: string;
  status: string;
  trackingUrl: string;
  labelUrl: string | null;
  /** Contrato con el que se creó el envío, tomado SIEMPRE del entorno de la
   * Function — nunca de la request. Se persiste para trazabilidad histórica
   * (el contrato de la cuenta puede cambiar con el tiempo) pero no se
   * devuelve al frontend ni se puede leer desde el navegador. */
  contract: string | null;
  simulated: boolean;
};

export async function createShipment(input: ShipmentInput): Promise<ShipmentResult> {
  const env = readAndreaniEnv();
  const parcel = input.parcel ?? DEFAULT_PARCEL;

  if (env.mode === "mock") {
    return {
      shipmentNumber: `MOCK-${input.orderId}`,
      status: "Pendiente de retiro (mock)",
      trackingUrl: `https://mock.andreani.local/tracking/${input.orderId}`,
      labelUrl: null,
      contract: null, // en mock no hay contrato real que registrar.
      simulated: true,
    };
  }

  // TO VERIFY: endpoint/payload real de creación de orden de envío.
  // idOrdenOrigen como referencia externa: si Andreani deduplica por este
  // campo del lado de ellos, es una segunda capa de idempotencia — a
  // confirmar contra la doc real, no asumido acá.
  const data = await request(env, "/v2/ordenes-de-envio", {
    method: "POST",
    body: JSON.stringify({
      contrato: env.contract,
      cliente: env.client,
      idOrdenOrigen: input.orderId,
      destinatario: {
        nombreCompleto: input.recipientName,
        email: input.email,
        domicilio: { calle: input.address, codigoPostal: input.postalCode },
      },
      bultos: [
        {
          kilos: parcel.weightKg,
          largoCm: parcel.lengthCm,
          anchoCm: parcel.widthCm,
          altoCm: parcel.heightCm,
          valorDeclarado: input.declaredValue,
        },
      ],
    }),
  });
  const shipmentNumber = String(data.numeroDeEnvio ?? data.numero ?? "");
  return {
    shipmentNumber,
    status: String(data.estado ?? "Creado"),
    trackingUrl: String(data.urlTracking ?? `https://www.andreani.com/#!/informacionEnvio/${shipmentNumber}`),
    labelUrl: data.urlEtiqueta ?? null,
    contract: env.contract,
    simulated: false,
  };
}

export async function getLabel(shipmentNumber: string): Promise<{ url: string; simulated: boolean }> {
  const env = readAndreaniEnv();
  if (env.mode === "mock") return { url: `https://mock.andreani.local/etiqueta/${shipmentNumber}`, simulated: true };
  // TO VERIFY: endpoint real.
  const data = await request(env, `/v2/ordenes-de-envio/${encodeURIComponent(shipmentNumber)}/etiquetas`);
  return { url: String(data.url ?? data.urlEtiqueta ?? ""), simulated: false };
}

export type TrackingEvent = { at: string; description: string };
export type TrackingResult = { status: string; events: TrackingEvent[]; simulated: boolean };

export async function getTracking(shipmentNumber: string): Promise<TrackingResult> {
  const env = readAndreaniEnv();
  if (env.mode === "mock") {
    return {
      status: "En tránsito (mock)",
      events: [{ at: new Date().toISOString(), description: "Envío creado (mock)" }],
      simulated: true,
    };
  }
  // TO VERIFY: endpoint real.
  const data = await request(env, `/v2/envios/${encodeURIComponent(shipmentNumber)}/trazas`);
  const rows = Array.isArray(data) ? data : (data?.trazas ?? []);
  // deno-lint-ignore no-explicit-any
  const events: TrackingEvent[] = rows.map((item: any) => ({
    at: item.fecha ?? item.at ?? "",
    description: item.descripcion ?? item.motivo ?? "",
  }));
  return { status: String(data?.estadoActual ?? events[0]?.description ?? ""), events, simulated: false };
}

// ---- Helpers puros de dirección/idempotencia (testeables sin red) -------

/** El checkout actual (src/app/checkout/page.tsx) guarda el domicilio como
 * un único string libre `CP ${postalCode} · ${locality} · ${address}` — no
 * hay columna postal_code estructurada. Se reconstruye acá en vez de en el
 * cliente para que haya una sola fuente de verdad de este parseo. */
export function extractPostalCode(address: string | null | undefined): string | null {
  const match = address?.match(/CP\s*(\d{4})\b/);
  return match ? match[1] : null;
}

/** Cuánto puede vivir un claim 'claimed' (reservado, todavía sin llamar a
 * Andreani o con la llamada fallida antes de obtener número) antes de
 * considerarse abandonado y quedar disponible para que otra request lo
 * retome. Un claim 'created_unsaved' NUNCA vence — ver decideShipmentClaim. */
export const CLAIM_TTL_MS = 2 * 60 * 1000;

export type ShipmentClaimRow = {
  andreani_shipment_number: string | null;
  andreani_claim_state: "claimed" | "created_unsaved" | null;
  andreani_claimed_at: string | null;
};

export type ShipmentClaimDecision =
  | "existing"
  | "in_progress"
  | "needs_manual_review"
  | "claim";

/**
 * Decide qué hacer antes de tocar la red — el claim atómico real lo hace la
 * query condicional en andreani-shipment/index.ts, esto es la decisión, no
 * el efecto. La propiedad de seguridad importante: 'created_unsaved' nunca
 * vence ni se reclama solo, porque eso implicaría volver a llamar a
 * Andreani y generar un envío real duplicado — ver punto 5 del pedido
 * ("timeout después de que Andreani creó el envío pero antes de guardar").
 */
export function decideShipmentClaim(order: ShipmentClaimRow, now: number = Date.now()): ShipmentClaimDecision {
  if (order.andreani_shipment_number) return "existing";
  if (order.andreani_claim_state === "created_unsaved") return "needs_manual_review";
  if (order.andreani_claim_state === "claimed") {
    const claimedAt = order.andreani_claimed_at ? new Date(order.andreani_claimed_at).getTime() : 0;
    if (now - claimedAt < CLAIM_TTL_MS) return "in_progress";
    return "claim"; // vencido: se puede reclamar de nuevo, todavía no se llegó a llamar a Andreani.
  }
  return "claim";
}

export type ClaimOutcome = "released" | "resolved" | "held_for_manual_review";

/**
 * Qué le pasa al claim después de intentar crear+guardar un envío — pura,
 * separada de la I/O para poder testear la propiedad de seguridad sin red
 * (ver punto 5 del pedido: "timeout después de que Andreani creó el envío
 * pero antes de guardar la respuesta"):
 *   - Andreani nunca respondió con un número (falló antes) -> "released":
 *     nada que proteger, liberar el claim y permitir reintentar ya mismo.
 *   - Andreani respondió Y el número quedó persistido (guardado completo o
 *     mínimo) -> "resolved": andreani_shipment_number ya es la fuente de
 *     verdad, el claim_state se limpia a null.
 *   - Andreani respondió pero NI SIQUIERA el guardado mínimo del número
 *     entró -> "held_for_manual_review": el claim se deja en
 *     'created_unsaved' y NUNCA se libera solo — reclamarlo automáticamente
 *     llamaría a Andreani de nuevo y duplicaría un envío real.
 */
export function claimOutcome(hadShipmentNumberFromAndreani: boolean, shipmentNumberWasPersisted: boolean): ClaimOutcome {
  if (!hadShipmentNumberFromAndreani) return "released";
  return shipmentNumberWasPersisted ? "resolved" : "held_for_manual_review";
}
