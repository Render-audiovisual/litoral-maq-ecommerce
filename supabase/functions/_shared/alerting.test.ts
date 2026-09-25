import {
  type AlertStore,
  alertRecipients,
  buildAlertEmail,
  decideAlertActions,
  runAlerting,
  type StoredAlert,
} from "./alerting.ts";
import { type Finding, healthReport, isHealthy } from "./health-checks.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  actual:   ${a}\n  expected: ${e}`);
}

const NOW = new Date("2026-09-25T15:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const finding = (key: string, severity: Finding["severity"] = "high"): Finding => ({
  key,
  severity,
  title: `Título ${key}`,
  detail: `Detalle ${key}`,
});
const stored = (key: string, over: Partial<StoredAlert> = {}): StoredAlert => ({
  ...finding(key),
  first_seen_at: hoursAgo(10),
  last_seen_at: hoursAgo(1),
  last_notified_at: hoursAgo(1),
  resolved_at: null,
  notified_resolved_at: null,
  occurrences: 3,
  ...over,
});
const keys = (rows: StoredAlert[]) => rows.map((row) => row.key);

// --- decideAlertActions ----------------------------------------------------

Deno.test("decide: hallazgo nuevo se inserta y se avisa", () => {
  const actions = decideAlertActions([finding("a")], [], NOW);
  assertEquals(keys(actions.upserts), ["a"]);
  assertEquals(keys(actions.toNotify), ["a"]);
  assertEquals(actions.toResolve, []);
  assertEquals(actions.upserts[0].first_seen_at, NOW.toISOString());
  assertEquals(actions.upserts[0].occurrences, 1);
});

Deno.test("decide: hallazgos duplicados se deduplican por clave", () => {
  const actions = decideAlertActions([finding("a"), finding("a")], [], NOW);
  assertEquals(keys(actions.upserts), ["a"]);
  assertEquals(keys(actions.toNotify), ["a"]);
});

Deno.test("decide: sigue activa → actualiza sin re-avisar antes de 6 h (high/critical)", () => {
  const actions = decideAlertActions(
    [finding("a"), finding("b", "critical")],
    [stored("a", { last_notified_at: hoursAgo(5.9) }), stored("b", { severity: "critical", last_notified_at: hoursAgo(6) })],
    NOW,
  );
  assertEquals(keys(actions.upserts), ["a", "b"]);
  assertEquals(actions.upserts[0].occurrences, 4);
  assertEquals(actions.upserts[0].last_seen_at, NOW.toISOString());
  assertEquals(actions.upserts[0].first_seen_at, hoursAgo(10));
  assertEquals(keys(actions.toNotify), ["b"]);
});

Deno.test("decide: medium recuerda recién a las 24 h", () => {
  const early = decideAlertActions([finding("m", "medium")], [stored("m", { severity: "medium", last_notified_at: hoursAgo(23) })], NOW);
  assertEquals(early.toNotify, []);
  const late = decideAlertActions([finding("m", "medium")], [stored("m", { severity: "medium", last_notified_at: hoursAgo(24) })], NOW);
  assertEquals(keys(late.toNotify), ["m"]);
});

Deno.test("decide: activa sin aviso previo (correo falló) se reintenta", () => {
  const actions = decideAlertActions([finding("a")], [stored("a", { last_notified_at: null })], NOW);
  assertEquals(keys(actions.toNotify), ["a"]);
});

Deno.test("decide: desaparece → se resuelve y se avisa una sola vez", () => {
  const first = decideAlertActions([], [stored("a")], NOW);
  assertEquals(keys(first.toResolve), ["a"]);
  assertEquals(first.upserts[0].resolved_at, NOW.toISOString());
  assertEquals(first.upserts[0].notified_resolved_at, null);
  // Ya avisada: loadOpen no la vuelve a traer, pero aunque viniera no se repite.
  const again = decideAlertActions([], [stored("a", { resolved_at: hoursAgo(1), notified_resolved_at: hoursAgo(1) })], NOW);
  assertEquals(again, { upserts: [], toNotify: [], toResolve: [] });
});

Deno.test("decide: aviso de resuelta fallido se reintenta sin tocar resolved_at", () => {
  const actions = decideAlertActions([], [stored("a", { resolved_at: hoursAgo(1) })], NOW);
  assertEquals(actions.upserts, []);
  assertEquals(keys(actions.toResolve), ["a"]);
});

Deno.test("decide: nunca avisada se cierra en silencio", () => {
  const actions = decideAlertActions([], [stored("a", { last_notified_at: null })], NOW);
  assertEquals(actions.toResolve, []);
  assertEquals(actions.upserts[0].notified_resolved_at, NOW.toISOString());
});

Deno.test("decide: una alerta no revisada (consulta caída) no se da por resuelta", () => {
  const actions = decideAlertActions([], [stored("a")], NOW, ["a"]);
  assertEquals(actions, { upserts: [], toNotify: [], toResolve: [] });
});

Deno.test("decide: reaparece después de resuelta → incidente nuevo", () => {
  const actions = decideAlertActions([finding("a")], [stored("a", { resolved_at: hoursAgo(2), notified_resolved_at: hoursAgo(2) })], NOW);
  assertEquals(keys(actions.toNotify), ["a"]);
  assertEquals(actions.upserts[0].occurrences, 1);
  assertEquals(actions.upserts[0].resolved_at, null);
});

// --- correo ----------------------------------------------------------------

Deno.test("correo: asuntos por tipo y cantidad", () => {
  assertEquals(buildAlertEmail("alert", [stored("a")]).subject, "[Litoral Maq] Alerta: Título a");
  assertEquals(buildAlertEmail("alert", [stored("a", { severity: "critical" })]).subject, "[Litoral Maq] Alerta crítica: Título a");
  assertEquals(buildAlertEmail("alert", [stored("a"), stored("b", { severity: "critical" })]).subject, "[Litoral Maq] Alerta crítica: 2 alertas");
  assertEquals(buildAlertEmail("alert", [stored("a"), stored("b")]).subject, "[Litoral Maq] Alerta: 2 alertas");
  assertEquals(buildAlertEmail("resolved", [stored("a")]).subject, "[Litoral Maq] Resuelto: Título a");
  assertEquals(buildAlertEmail("resolved", [stored("a"), stored("b")]).subject, "[Litoral Maq] Resuelto: 2 alertas");
});

Deno.test("correo: escapa HTML, trae Qué revisar y el link al panel", () => {
  const email = buildAlertEmail("alert", [stored("payment_not_applied", { title: "<script>x</script>", detail: "a & b" })]);
  assert(!email.html.includes("<script>x"), "sin escapar");
  assert(email.html.includes("&lt;script&gt;") && email.html.includes("a &amp; b"), "escapado");
  assert(email.text.includes("Qué revisar: Mercado Pago cobró pero el pedido no figura pagado"), email.text);
  assert(email.html.includes("https://admin.litoralmaq.com/admin/configuracion"), "link");
  assert(email.text.includes("<script>x</script>"), "el texto plano va sin escapar");
});

Deno.test("correo: resuelta no incluye Qué revisar; varias alertas van todas", () => {
  const email = buildAlertEmail("resolved", [stored("outbox_failed"), stored("catalog_sync_failed")]);
  assert(!email.text.includes("Qué revisar"), email.text);
  assert(email.text.includes("Título outbox_failed") && email.text.includes("Título catalog_sync_failed"), email.text);
});

Deno.test("destinatarios: LITORAL_ALERTS_EMAIL (lista) o LITORAL_ORDERS_EMAIL", () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  assertEquals(alertRecipients(env({ LITORAL_ALERTS_EMAIL: "a@x.com, b@x.com ,nope", LITORAL_ORDERS_EMAIL: "o@x.com" })), ["a@x.com", "b@x.com"]);
  assertEquals(alertRecipients(env({ LITORAL_ORDERS_EMAIL: "o@x.com" })), ["o@x.com"]);
  assertEquals(alertRecipients(env({})), []);
});

// --- health ----------------------------------------------------------------

Deno.test("health: sano con latido < 15 min y sin critical/high", () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
  assert(isHealthy(minutesAgo(14.9), [{ severity: "medium" }], NOW), "sano");
  assert(!isHealthy(minutesAgo(15), [], NOW), "latido viejo");
  assert(!isHealthy(null, [], NOW), "sin latido");
  assert(!isHealthy(minutesAgo(1), [{ severity: "high" }], NOW), "high abierta");
  assertEquals(healthReport(minutesAgo(3), [{ severity: "critical" }, { severity: "medium" }], NOW), {
    ok: false,
    lastTickMinutesAgo: 3,
    activeAlerts: { critical: 1, high: 0, medium: 1 },
  });
});

// --- runAlerting con Resend y base falsos ----------------------------------

function fakeStore(initial: StoredAlert[]) {
  const rows = new Map(initial.map((row) => [row.key, { ...row }]));
  const store: AlertStore = {
    loadOpen: () =>
      Promise.resolve([...rows.values()].filter((row) => !row.resolved_at || !row.notified_resolved_at)),
    save: (next) => {
      for (const row of next) rows.set(row.key, { ...row });
      return Promise.resolve();
    },
    mark: (list, field, at) => {
      for (const key of list) rows.get(key)![field] = at;
      return Promise.resolve();
    },
  };
  return { store, rows };
}
const ENV = (name: string) =>
  ({ RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "alertas@litoralmaq.com", LITORAL_ORDERS_EMAIL: "equipo@litoralmaq.com" } as Record<string, string>)[name];

Deno.test("runAlerting: envío OK marca last_notified_at y no repite en el tick siguiente", async () => {
  const { store, rows } = fakeStore([]);
  const sent: { subject: string; to: string[] }[] = [];
  const fetchOk = ((_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Promise.resolve(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
  }) as typeof fetch;
  const result = await runAlerting(store, [finding("a", "critical")], [], { now: NOW, env: ENV, fetch: fetchOk });
  assertEquals(result, { active: 1, notified: 1, resolved: 0, emailErrors: 0 });
  assertEquals(rows.get("a")!.last_notified_at, NOW.toISOString());
  assertEquals(sent[0].to, ["equipo@litoralmaq.com"]);
  const later = new Date(NOW.getTime() + 5 * 60_000);
  await runAlerting(store, [finding("a", "critical")], [], { now: later, env: ENV, fetch: fetchOk });
  assertEquals(sent.length, 1, "no se repite antes de 6 h");
  await runAlerting(store, [], [], { now: later, env: ENV, fetch: fetchOk });
  assertEquals(sent.length, 2);
  assert(sent[1].subject.startsWith("[Litoral Maq] Resuelto"), sent[1].subject);
  await runAlerting(store, [], [], { now: later, env: ENV, fetch: fetchOk });
  assertEquals(sent.length, 2, "el aviso de resuelta sale una sola vez");
});

Deno.test("runAlerting: si Resend falla, last_notified_at queda nulo y se reintenta", async () => {
  const { store, rows } = fakeStore([]);
  const originalError = console.error;
  console.error = () => {};
  try {
    const fetchFail = (() => Promise.resolve(new Response(JSON.stringify({ message: "boom" }), { status: 500 }))) as typeof fetch;
    const result = await runAlerting(store, [finding("a")], [], { now: NOW, env: ENV, fetch: fetchFail });
    assertEquals(result.emailErrors, 1);
    assertEquals(result.notified, 0);
    assertEquals(rows.get("a")!.last_notified_at, null);
    let calls = 0;
    const fetchOk = (() => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify({ id: "msg_2" }), { status: 200 }));
    }) as typeof fetch;
    await runAlerting(store, [finding("a")], [], { now: new Date(NOW.getTime() + 300_000), env: ENV, fetch: fetchOk });
    assertEquals(calls, 1, "reintento en el tick siguiente");
    assert(rows.get("a")!.last_notified_at, "marcada tras el reintento");
  } finally {
    console.error = originalError;
  }
});

Deno.test("runAlerting: sin destinatario loguea y no lanza ni envía", async () => {
  const { store, rows } = fakeStore([]);
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (line: string) => logs.push(line);
  try {
    let calls = 0;
    const result = await runAlerting(store, [finding("a")], [], {
      now: NOW,
      env: (name) => (name === "LITORAL_ORDERS_EMAIL" ? "" : ENV(name)),
      fetch: (() => {
        calls += 1;
        return Promise.resolve(new Response("{}"));
      }) as typeof fetch,
    });
    assertEquals(calls, 0);
    assertEquals(result.emailErrors, 1);
    assertEquals(rows.get("a")!.last_notified_at, null);
    assert(logs.some((line) => JSON.parse(line).scope === "alerting"), "log estructurado");
  } finally {
    console.error = originalError;
  }
});
