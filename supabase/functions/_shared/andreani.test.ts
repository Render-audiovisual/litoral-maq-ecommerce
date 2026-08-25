// Correr TODOS los tests de las Edge Functions (desde la raíz del repo):
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions
// (runtime Deno, no Vitest — las Edge Functions no comparten proceso con
// src/, ver nota en el plan de pruebas del diagnóstico).
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  AndreaniDisabledError,
  assertAndreaniEnabled,
  checkRateLimit,
  claimOutcome,
  classifyAndreaniError,
  decideShipmentClaim,
  extractPostalCode,
  isAndreaniEnabled,
  mockQuote,
  RateLimitError,
  readAndreaniEnv,
  validateGeoQuery,
  validateQuoteInput,
  ValidationError,
} from "./andreani.ts";
import { requireStaff } from "./supabase-admin.ts";
import { FakeAdminClient } from "./test-support.ts";

function resetAndreaniEnv() {
  for (const key of ["ANDREANI_ENABLED", "ANDREANI_MODE", "ANDREANI_BASE_URL", "ANDREANI_API_USER", "ANDREANI_API_PASSWORD", "ANDREANI_CLIENT", "ANDREANI_CONTRACT"]) {
    Deno.env.delete(key);
  }
}

/** Los tests de MODO (mock/qa/production) necesitan pasar primero la guarda
 * del flag; se prende explícitamente para aislar qué se está probando. */
function enableAndreani() {
  Deno.env.set("ANDREANI_ENABLED", "true");
}

// ---- Feature flag ANDREANI_ENABLED (punto 2) ----------------------------

Deno.test("isAndreaniEnabled - apagado por defecto, sin variable", () => {
  resetAndreaniEnv();
  assertEquals(isAndreaniEnabled(), false);
});

Deno.test("isAndreaniEnabled - solo el string exacto 'true' prende la integración", () => {
  resetAndreaniEnv();
  for (const value of ["false", "1", "yes", "TRUE ", "", "si"]) {
    Deno.env.set("ANDREANI_ENABLED", value);
    // "TRUE " se normaliza (trim + lowercase) y sí prende; el resto no.
    assertEquals(isAndreaniEnabled(), value.trim().toLowerCase() === "true");
  }
  resetAndreaniEnv();
});

Deno.test("assertAndreaniEnabled - lanza AndreaniDisabledError con el flag apagado", () => {
  resetAndreaniEnv();
  assertThrows(() => assertAndreaniEnabled(), AndreaniDisabledError);
});

Deno.test("readAndreaniEnv - con el flag apagado no deja ni siquiera usar mock", () => {
  resetAndreaniEnv();
  Deno.env.set("ANDREANI_MODE", "mock");
  assertThrows(() => readAndreaniEnv(), AndreaniDisabledError);
  resetAndreaniEnv();
});

// ---- readAndreaniEnv / guarda mock obligatorio (puntos 6 y 7) -----------

Deno.test("readAndreaniEnv - con el flag prendido y sin más variables, el modo default es mock", () => {
  resetAndreaniEnv();
  enableAndreani();
  assertEquals(readAndreaniEnv(), { mode: "mock" });
});

Deno.test("readAndreaniEnv - qa sin credenciales completas lanza", () => {
  resetAndreaniEnv();
  enableAndreani();
  Deno.env.set("ANDREANI_MODE", "qa");
  assertThrows(() => readAndreaniEnv(), Error, "SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS"); // el gate de spec se evalúa antes que las credenciales.
  resetAndreaniEnv();
});

Deno.test("readAndreaniEnv - qa CON las 5 credenciales completas sigue bloqueado (punto 7: mock obligatorio hasta contrastar docs)", () => {
  resetAndreaniEnv();
  enableAndreani();
  Deno.env.set("ANDREANI_MODE", "qa");
  Deno.env.set("ANDREANI_BASE_URL", "https://apisqa.andreani.com");
  Deno.env.set("ANDREANI_API_USER", "user-secreto");
  Deno.env.set("ANDREANI_API_PASSWORD", "password-secreto");
  Deno.env.set("ANDREANI_CLIENT", "client-secreto");
  Deno.env.set("ANDREANI_CONTRACT", "contract-secreto");
  const error = assertThrows(() => readAndreaniEnv(), Error, "SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS");
  // El error no debe filtrar ninguna de las credenciales que sí estaban seteadas.
  assert(!error.message.includes("user-secreto"));
  assert(!error.message.includes("password-secreto"));
  assert(!error.message.includes("client-secreto"));
  assert(!error.message.includes("contract-secreto"));
  resetAndreaniEnv();
});

Deno.test("readAndreaniEnv - production también queda bloqueado igual que qa", () => {
  resetAndreaniEnv();
  enableAndreani();
  Deno.env.set("ANDREANI_MODE", "production");
  assertThrows(() => readAndreaniEnv(), Error, "SPEC_VERIFIED_AGAINST_OFFICIAL_DOCS");
  resetAndreaniEnv();
});

Deno.test("readAndreaniEnv - modo inválido lanza", () => {
  resetAndreaniEnv();
  enableAndreani();
  Deno.env.set("ANDREANI_MODE", "staging");
  assertThrows(() => readAndreaniEnv(), Error, "inválido");
  resetAndreaniEnv();
});

Deno.test("mockQuote - siempre marca simulated:true", () => {
  const result = mockQuote({ postalCode: "3400", weightKg: 5 });
  assertEquals(result.simulated, true);
  assertEquals(result.amount > 0, true);
});

Deno.test("extractPostalCode - extrae el CP del address libre del checkout actual", () => {
  assertEquals(extractPostalCode("CP 3400 · Corrientes · Mitre 123"), "3400");
  assertEquals(extractPostalCode(null), null);
  assertEquals(extractPostalCode("sin CP acá"), null);
});

// ---- Validación de entrada (quote / geo) --------------------------------

Deno.test("validateQuoteInput - acepta un input válido", () => {
  const input = validateQuoteInput({ postalCode: "3400", weightKg: 5, declaredValue: 10000 });
  assertEquals(input.postalCode, "3400");
  assertEquals(input.weightKg, 5);
});

Deno.test("validateQuoteInput - rechaza CP mal formado", () => {
  assertThrows(() => validateQuoteInput({ postalCode: "abc", weightKg: 5 }), ValidationError);
  assertThrows(() => validateQuoteInput({ postalCode: "34000", weightKg: 5 }), ValidationError);
});

Deno.test("validateQuoteInput - rechaza peso negativo, cero o excesivo", () => {
  assertThrows(() => validateQuoteInput({ postalCode: "3400", weightKg: -1 }), ValidationError);
  assertThrows(() => validateQuoteInput({ postalCode: "3400", weightKg: 0 }), ValidationError);
  assertThrows(() => validateQuoteInput({ postalCode: "3400", weightKg: 999999 }), ValidationError);
});

Deno.test("validateGeoQuery - acepta localidades/sucursales con CP válido", () => {
  assertEquals(validateGeoQuery("localidades", "3400"), { resource: "localidades", postalCode: "3400" });
  assertEquals(validateGeoQuery("sucursales", "3400"), { resource: "sucursales", postalCode: "3400" });
});

Deno.test("validateGeoQuery - rechaza resource inválido o CP inválido", () => {
  assertThrows(() => validateGeoQuery("depositos", "3400"), ValidationError);
  assertThrows(() => validateGeoQuery("localidades", "abc"), ValidationError);
  assertThrows(() => validateGeoQuery("localidades", null), ValidationError);
});

// ---- Clasificación de rechazos de Andreani (punto 1) ---------------------

Deno.test("classifyAndreaniError - 4xx funcional: liberar claim, reintento solo tras corregir datos", () => {
  for (const status of [400, 404, 409, 422]) {
    const result = classifyAndreaniError(status);
    assertEquals(result.claim, "release", `status ${status} debe liberar el claim`);
    assertEquals(result.retriable, false);
    assertEquals(result.httpStatus, 422);
    assert(result.message.includes("Revisá"), "debe indicar qué revisar del pedido");
  }
});

Deno.test("classifyAndreaniError - 401/403 credenciales: liberar claim, no reintentable, sin decir cuál credencial", () => {
  for (const status of [401, 403]) {
    const result = classifyAndreaniError(status);
    assertEquals(result.claim, "release");
    assertEquals(result.retriable, false);
    assertEquals(result.httpStatus, 502);
    assert(result.message.includes("credenciales"));
    // No debe nombrar variables ni sugerir cuál de las cinco falló.
    for (const leak of ["ANDREANI_API_USER", "ANDREANI_API_PASSWORD", "ANDREANI_CONTRACT", "ANDREANI_CLIENT", "password", "contrato"]) {
      assert(!result.message.includes(leak), `no debe mencionar ${leak}`);
    }
  }
});

Deno.test("classifyAndreaniError - 429: liberar claim y SÍ reintentable más tarde", () => {
  const result = classifyAndreaniError(429);
  assertEquals(result.claim, "release");
  assertEquals(result.retriable, true);
  assertEquals(result.httpStatus, 429);
});

Deno.test("classifyAndreaniError - 5xx: AMBIGUO, retener claim y prohibir reintento", () => {
  for (const status of [500, 502, 503]) {
    const result = classifyAndreaniError(status);
    assertEquals(result.claim, "hold", `status ${status} no puede liberar el claim`);
    assertEquals(result.retriable, false);
    assert(result.message.includes("revisión manual"));
  }
});

Deno.test("classifyAndreaniError - timeout: AMBIGUO, retener claim y prohibir reintento", () => {
  const result = classifyAndreaniError("timeout");
  assertEquals(result.claim, "hold");
  assertEquals(result.retriable, false);
  assertEquals(result.httpStatus, 504);
  assert(result.message.includes("revisión manual"));
});

// ---- Rate limiting básico -------------------------------------------------

Deno.test("checkRateLimit - permite hasta el límite y bloquea después, por caller", () => {
  const callerId = `rl-test-${crypto.randomUUID()}`;
  const now = Date.now();
  for (let i = 0; i < 30; i += 1) checkRateLimit(callerId, now);
  assertThrows(() => checkRateLimit(callerId, now), RateLimitError);
  // Otro caller no se ve afectado por el límite del primero.
  checkRateLimit(`${callerId}-other`, now);
});

Deno.test("checkRateLimit - la ventana vencida libera cupo", () => {
  const callerId = `rl-test-${crypto.randomUUID()}`;
  const now = Date.now();
  for (let i = 0; i < 30; i += 1) checkRateLimit(callerId, now);
  checkRateLimit(callerId, now + 61_000); // pasó la ventana de 60s
});

// ---- Idempotencia / recuperación (punto 5) --------------------------------

Deno.test("decideShipmentClaim - número ya existente siempre gana (idempotencia)", () => {
  assertEquals(
    decideShipmentClaim({ andreani_shipment_number: "123", andreani_claim_state: "claimed", andreani_claimed_at: null }),
    "existing",
  );
});

Deno.test("decideShipmentClaim - created_unsaved nunca se reclama, ni con timestamp viejo", () => {
  const veryOld = new Date(Date.now() - 999 * 60 * 1000).toISOString();
  assertEquals(
    decideShipmentClaim({ andreani_shipment_number: null, andreani_claim_state: "created_unsaved", andreani_claimed_at: veryOld }),
    "needs_manual_review",
  );
});

Deno.test("decideShipmentClaim - claimed reciente bloquea (en curso)", () => {
  const now = Date.now();
  assertEquals(
    decideShipmentClaim({ andreani_shipment_number: null, andreani_claim_state: "claimed", andreani_claimed_at: new Date(now).toISOString() }, now),
    "in_progress",
  );
});

Deno.test("decideShipmentClaim - claim abandonado (vencido el TTL) se puede retomar", () => {
  const now = Date.now();
  const claimedAt = new Date(now - 3 * 60 * 1000).toISOString(); // TTL es 2 minutos
  assertEquals(
    decideShipmentClaim({ andreani_shipment_number: null, andreani_claim_state: "claimed", andreani_claimed_at: claimedAt }, now),
    "claim",
  );
});

Deno.test("decideShipmentClaim - sin nada previo, a reclamar", () => {
  assertEquals(decideShipmentClaim({ andreani_shipment_number: null, andreani_claim_state: null, andreani_claimed_at: null }), "claim");
});

Deno.test("claimOutcome - Andreani nunca respondió -> released (retry seguro)", () => {
  assertEquals(claimOutcome(false, false), "released");
});

Deno.test("claimOutcome - Andreani respondió y se guardó -> resolved", () => {
  assertEquals(claimOutcome(true, true), "resolved");
});

Deno.test("claimOutcome - Andreani respondió pero NO se pudo guardar -> held_for_manual_review (nunca auto-reclamable)", () => {
  assertEquals(claimOutcome(true, false), "held_for_manual_review");
});

// ---- Auth/roles: nunca confiar en un rol declarado por el frontend -------

Deno.test("requireStaff - JWT válido con rol admin en profiles autoriza", async () => {
  const client = new FakeAdminClient();
  client.setAuthUser("token-admin", "user-1");
  client.tables.profiles.set("user-1", { id: "user-1", role: "admin" });
  const req = new Request("https://example.com/fn", { headers: { Authorization: "Bearer token-admin" } });
  const staff = await requireStaff(req, client);
  assertEquals(staff, { id: "user-1", role: "admin" });
});

Deno.test("requireStaff - rol employee también autoriza", async () => {
  const client = new FakeAdminClient();
  client.setAuthUser("token-emp", "user-2");
  client.tables.profiles.set("user-2", { id: "user-2", role: "employee" });
  const req = new Request("https://example.com/fn", { headers: { Authorization: "Bearer token-emp" } });
  const staff = await requireStaff(req, client);
  assertEquals(staff.role, "employee");
});

Deno.test("requireStaff - sin header Authorization rechaza sin consultar la DB", async () => {
  const client = new FakeAdminClient();
  const req = new Request("https://example.com/fn");
  await assertRejectsHttp(() => requireStaff(req, client), 401);
});

Deno.test("requireStaff - token que Supabase Auth no reconoce rechaza", async () => {
  const client = new FakeAdminClient(); // sin setAuthUser: getUser() devuelve error para cualquier token.
  const req = new Request("https://example.com/fn", { headers: { Authorization: "Bearer lo-que-sea" } });
  await assertRejectsHttp(() => requireStaff(req, client), 401);
});

Deno.test("requireStaff - rol customer en profiles rechaza (403), aunque el JWT sea válido", async () => {
  const client = new FakeAdminClient();
  client.setAuthUser("token-cust", "user-3");
  client.tables.profiles.set("user-3", { id: "user-3", role: "customer" });
  const req = new Request("https://example.com/fn", { headers: { Authorization: "Bearer token-cust" } });
  await assertRejectsHttp(() => requireStaff(req, client), 403);
});

Deno.test("requireStaff - ignora por completo un rol 'admin' que el frontend declare fuera del JWT (header propio, no estándar)", async () => {
  const client = new FakeAdminClient();
  client.setAuthUser("token-cust", "user-4");
  client.tables.profiles.set("user-4", { id: "user-4", role: "customer" }); // la DB dice customer.
  const req = new Request("https://example.com/fn", {
    headers: { Authorization: "Bearer token-cust", "X-Claimed-Role": "admin" }, // el frontend "dice" que es admin.
  });
  // requireStaff nunca lee X-Claimed-Role ni ningún campo del body — solo el
  // rol que la DB devuelve para el usuario validado por el JWT.
  await assertRejectsHttp(() => requireStaff(req, client), 403);
});

async function assertRejectsHttp(fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
  } catch (error) {
    // deno-lint-ignore no-explicit-any
    assertEquals((error as any).status, status);
    return;
  }
  throw new Error(`Se esperaba que rechazara con status ${status}.`);
}
