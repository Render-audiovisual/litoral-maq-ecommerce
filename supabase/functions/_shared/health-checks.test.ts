import {
  detectCatalogSync,
  detectLifecycleStalled,
  detectOutboxFailed,
  detectPaidNotStarted,
  detectPaymentNotApplied,
  type Finding,
  formatAge,
} from "./health-checks.ts";
import { redactText } from "./monitoring.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  actual:   ${a}\n  expected: ${e}`);
}

const NOW = new Date("2026-09-25T15:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

const PII = /@|Juan|Pérez|3794|30111222/;
function noPii(findings: Finding[]) {
  for (const finding of findings) {
    assert(!PII.test(finding.title + finding.detail), `PII en: ${finding.title} ${finding.detail}`);
  }
}

Deno.test("formatAge: minutos, horas y días", () => {
  assertEquals(formatAge(45 * 60_000), "45 min");
  assertEquals(formatAge(3 * 3_600_000 + 5 * 60_000), "3 h");
  assertEquals(formatAge(72 * 3_600_000), "3 días");
});

Deno.test("redactText tapa emails y números largos", () => {
  const text = redactText("Invalid to: juan.perez@gmail.com tel 3794123456 DNI 30111222");
  assert(!text.includes("@") && !/\d{7,}/.test(text), text);
});

// --- outbox_failed ---------------------------------------------------------

Deno.test("outbox: sin fallas ni atascos no alerta", () => {
  assertEquals(detectOutboxFailed([
    { event_type: "team_new_order", status: "sent", created_at: hoursAgo(1), last_error: null },
    { event_type: "team_new_order", status: "pending", created_at: minutesAgo(30), last_error: null },
    { event_type: "team_new_order", status: "failed", created_at: hoursAgo(7 * 24 + 1), last_error: "x" },
  ], NOW), []);
});

Deno.test("outbox: fallidos recientes y pendientes atascados alertan con detalle sin PII", () => {
  const findings = detectOutboxFailed([
    { event_type: "team_new_order", status: "failed", created_at: hoursAgo(2), last_error: "Invalid `to`: juan.perez@gmail.com" },
    { event_type: "team_new_order", status: "failed", created_at: hoursAgo(1), last_error: "Invalid `to`: juan.perez@gmail.com" },
    { event_type: "customer_order_received", status: "sending", created_at: minutesAgo(31), last_error: null },
  ], NOW);
  assertEquals(findings.length, 1);
  const [f] = findings;
  assertEquals(f.key, "outbox_failed");
  assertEquals(f.severity, "high");
  assert(f.title.startsWith("3 correos"), f.title);
  assert(f.detail.includes("team_new_order: 2") && f.detail.includes("customer_order_received: 1"), f.detail);
  assert(f.detail.includes("hace 2 h"), f.detail);
  assert(f.detail.includes("[email]"), f.detail);
  noPii(findings);
});

Deno.test("outbox: el error más común se trunca a 120 caracteres", () => {
  const [f] = detectOutboxFailed([
    { event_type: "team_new_order", status: "failed", created_at: hoursAgo(1), last_error: "x".repeat(500) },
  ], NOW);
  assert(!f.detail.includes("x".repeat(121)) && f.detail.includes("x".repeat(120)), "truncado");
});

// --- catalog_sync ----------------------------------------------------------

Deno.test("catálogo: última exitosa y reciente no alerta", () => {
  assertEquals(detectCatalogSync([
    { status: "succeeded", started_at: hoursAgo(11.9), error_detail: null },
  ], NOW), []);
});

Deno.test("catálogo: última fallida (detenida) alerta medium con el detalle", () => {
  const findings = detectCatalogSync([
    { status: "succeeded", started_at: hoursAgo(4), error_detail: null },
    { status: "failed", started_at: hoursAgo(1), error_detail: "Sincronización automática detenida: el Sheet parece incompleto" },
  ], NOW);
  assertEquals(findings.map((f) => [f.key, f.severity]), [["catalog_sync_failed", "medium"]]);
  assert(findings[0].detail.includes("detenida"), findings[0].detail);
});

Deno.test("catálogo: sin exitosa en 12 h alerta high (borde exacto no alerta)", () => {
  assertEquals(detectCatalogSync([{ status: "succeeded", started_at: hoursAgo(12), error_detail: null }], NOW), []);
  const findings = detectCatalogSync([
    { status: "succeeded", started_at: minutesAgo(12 * 60 + 1), error_detail: null },
  ], NOW);
  assertEquals(findings.map((f) => [f.key, f.severity]), [["catalog_sync_stalled", "high"]]);
  assertEquals(detectCatalogSync([], NOW).map((f) => f.key), ["catalog_sync_stalled"]);
});

// --- payment_not_applied ---------------------------------------------------

Deno.test("pago: aprobado y aplicado, o recién llegado, no alerta", () => {
  assertEquals(detectPaymentNotApplied(
    [
      { order_id: "LM-1", status: "approved", updated_at: hoursAgo(1) },
      { order_id: "LM-2", status: "approved", updated_at: minutesAgo(10) },
      { order_id: "LM-3", status: "approved", updated_at: hoursAgo(1) },
    ],
    [
      { id: "LM-1", payment_status: "approved" },
      { id: "LM-2", payment_status: "pending" },
      { id: "LM-3", payment_status: "refunded" },
    ],
    NOW,
  ), []);
});

Deno.test("pago: aprobado sin aplicar hace más de 10 min alerta critical con ids (máx 5)", () => {
  const ids = ["LM-1", "LM-2", "LM-3", "LM-4", "LM-5", "LM-6"];
  const findings = detectPaymentNotApplied(
    ids.map((id) => ({ order_id: id, status: "approved", updated_at: minutesAgo(11) })),
    ids.map((id) => ({ id, payment_status: "pending" })),
    NOW,
  );
  assertEquals(findings.length, 1);
  assertEquals(findings[0].severity, "critical");
  assert(findings[0].title.startsWith("6 pagos"), findings[0].title);
  assert(findings[0].detail.includes("LM-5 y 1 más") && !findings[0].detail.includes("LM-6"), findings[0].detail);
});

// --- lifecycle_stalled -----------------------------------------------------

Deno.test("ciclo de vida: latido fresco y nada vencido no alerta", () => {
  assertEquals(detectLifecycleStalled(
    [{ id: "LM-1", expires_at: minutesAgo(30) }],
    { last_tick_at: minutesAgo(20) },
    NOW,
  ), []);
});

Deno.test("ciclo de vida: pedidos vencidos hace más de 30 min alertan", () => {
  const findings = detectLifecycleStalled(
    [{ id: "LM-1", expires_at: minutesAgo(31) }],
    { last_tick_at: minutesAgo(1) },
    NOW,
  );
  assertEquals(findings.map((f) => [f.key, f.severity]), [["lifecycle_stalled", "high"]]);
  assert(findings[0].detail.includes("LM-1"), findings[0].detail);
});

Deno.test("ciclo de vida: latido viejo o ausente alerta", () => {
  const stale = detectLifecycleStalled([], { last_tick_at: minutesAgo(21) }, NOW);
  assertEquals(stale[0]?.title, "El cron de pedidos no está corriendo");
  assert(stale[0].detail.includes("21 min"), stale[0].detail);
  assertEquals(detectLifecycleStalled([], null, NOW).length, 1);
});

// --- paid_not_started ------------------------------------------------------

Deno.test("pagados sin preparar: más de 12 h alerta medium; usa status_changed_at", () => {
  assertEquals(detectPaidNotStarted([
    { id: "LM-1", created_at: hoursAgo(40), status_changed_at: hoursAgo(2) },
    { id: "LM-2", created_at: hoursAgo(12) },
  ], NOW), []);
  const findings = detectPaidNotStarted([
    { id: "LM-3", created_at: hoursAgo(13), status_changed_at: null },
    { id: "LM-4", created_at: hoursAgo(20), status_changed_at: minutesAgo(12 * 60 + 1) },
  ], NOW);
  assertEquals(findings.map((f) => [f.key, f.severity]), [["paid_not_started", "medium"]]);
  assertEquals(findings[0].title, "Hay 2 pedidos pagados sin preparar hace más de 12 h");
  assertEquals(findings[0].detail, "Pedidos: LM-3, LM-4.");
  noPii(findings);
});
