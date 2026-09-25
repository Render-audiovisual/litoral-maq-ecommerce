import {
  AUTO_SYNC_SOURCE,
  evaluateAutoSyncSafety,
  isAutoSyncDue,
  maybeRunAutoCatalogSync,
} from "./catalog-auto-sync.ts";
import { type CatalogDb, CatalogSyncBlockedError, type runCatalogSync } from "./catalog-sync.ts";
import type { ParsedCatalogSheet } from "./catalog-sheet.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const NOW = new Date("2026-09-24T15:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

Deno.test("isAutoSyncDue: sin corrida previa corresponde", () => {
  assert(isAutoSyncDue(null, NOW), "null");
  assert(isAutoSyncDue(undefined, NOW), "undefined");
});

Deno.test("isAutoSyncDue: respeta las 3 horas (también tras un fallo)", () => {
  assert(!isAutoSyncDue(hoursAgo(2 + 59 / 60), NOW), "2h59 no corresponde");
  assert(isAutoSyncDue(hoursAgo(3), NOW), "3h corresponde");
  // Una corrida fallida guarda su started_at igual que una exitosa.
  assert(!isAutoSyncDue(hoursAgo(1), NOW), "fallo hace 1h espera");
});

Deno.test("isAutoSyncDue: fecha inválida corresponde", () => {
  assert(isAutoSyncDue("no-es-fecha", NOW), "fecha inválida");
});

Deno.test("evaluateAutoSyncSafety: casos del freno", () => {
  assert(!evaluateAutoSyncSafety({ parsedCount: 0, knownCount: 0, invalidCount: 0 }).ok, "0 filas");
  const truncated = evaluateAutoSyncSafety({ parsedCount: 120, knownCount: 528, invalidCount: 0 });
  assert(!truncated.ok, "120 vs 528");
  assert(!truncated.ok && truncated.reason.includes("528"), "motivo con cantidades");
  assert(evaluateAutoSyncSafety({ parsedCount: 450, knownCount: 528, invalidCount: 0 }).ok, "450 vs 528");
  assert(evaluateAutoSyncSafety({ parsedCount: 5, knownCount: 19, invalidCount: 0 }).ok, "catálogo chico");
  assert(!evaluateAutoSyncSafety({ parsedCount: 200, knownCount: 200, invalidCount: 40 }).ok, "40 ilegibles");
  assert(evaluateAutoSyncSafety({ parsedCount: 200, knownCount: 200, invalidCount: 5 }).ok, "5 ilegibles");
});

type FakeOptions = {
  lastStartedAt?: string | null;
  adminId?: string | null;
  knownCount?: number;
  failOn?: string;
};

function fakeDb(options: FakeOptions) {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      const result = () => {
        if (options.failOn === table) return { data: null, count: null, error: new Error(`falla ${table}`) };
        if (table === "catalog_sync_runs") {
          return { data: options.lastStartedAt ? { started_at: options.lastStartedAt } : null, error: null };
        }
        if (table === "profiles") {
          return { data: options.adminId ? { id: options.adminId } : null, error: null };
        }
        return { data: null, count: options.knownCount ?? 0, error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: () => builder,
        not: () => builder,
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as CatalogDb, inserts };
}

function parsedWith(rows: number, invalid: number): ParsedCatalogSheet {
  const make = (i: number) => ({ code: `C${i}`, name: `P${i}`, price: 1, rawPrice: "1", sourceRow: i + 2, slug: `p${i}` });
  return {
    rows: Array.from({ length: rows }, (_, i) => make(i)),
    headers: [],
    invalidRows: Array.from({ length: invalid }, (_, i) => rows + i + 2),
    unpriceable: [],
  };
}

// Simula runCatalogSync: aplica el guard como el real y cuenta llamadas al RPC.
function fakeRunSync(parsed: ParsedCatalogSheet) {
  const calls = { rpc: 0, sources: [] as string[] };
  const runSync = (async (_db, { source, guard }) => {
    calls.sources.push(source);
    const verdict = guard?.(parsed, parsed.rows);
    if (verdict && !verdict.ok) throw new CatalogSyncBlockedError(verdict.reason);
    calls.rpc += 1;
    return { result: { total: parsed.rows.length, created: 0, updated: 1, unchanged: 2, removed: 0 }, warnings: [] };
  }) as typeof runCatalogSync;
  return { runSync, calls };
}

Deno.test("maybeRunAutoCatalogSync: no corresponde → skipped sin tocar el RPC", async () => {
  const { db, inserts } = fakeDb({ lastStartedAt: hoursAgo(1), adminId: "a1" });
  const { runSync, calls } = fakeRunSync(parsedWith(500, 0));
  const outcome = await maybeRunAutoCatalogSync(db, NOW, { runSync });
  assert(outcome.status === "skipped", `status ${outcome.status}`);
  assert(calls.sources.length === 0 && inserts.length === 0, "no debía correr");
});

Deno.test("maybeRunAutoCatalogSync: sin administrador → skipped", async () => {
  const { db, inserts } = fakeDb({ lastStartedAt: null, adminId: null });
  const { runSync, calls } = fakeRunSync(parsedWith(500, 0));
  const outcome = await maybeRunAutoCatalogSync(db, NOW, { runSync });
  assert(outcome.status === "skipped" && outcome.detail === "sin administrador", JSON.stringify(outcome));
  assert(calls.sources.length === 0 && inserts.length === 0, "no debía correr");
});

Deno.test("maybeRunAutoCatalogSync: freno → registra fallo y no llama al RPC", async () => {
  const { db, inserts } = fakeDb({ lastStartedAt: hoursAgo(4), adminId: "a1", knownCount: 528 });
  const { runSync, calls } = fakeRunSync(parsedWith(120, 0));
  const outcome = await maybeRunAutoCatalogSync(db, NOW, { runSync });
  assert(outcome.status === "blocked", `status ${outcome.status}`);
  assert(calls.rpc === 0, "no debía llamar al RPC");
  assert(inserts.length === 1, "debía registrar la corrida");
  const row = inserts[0];
  assert(row.admin_id === "a1" && row.status === "failed" && row.source === AUTO_SYNC_SOURCE, JSON.stringify(row));
  assert(String(row.error_detail).startsWith("Sincronización automática detenida: "), String(row.error_detail));
  assert(typeof row.finished_at === "string", "finished_at");
});

Deno.test("maybeRunAutoCatalogSync: éxito devuelve las cantidades", async () => {
  const { db, inserts } = fakeDb({ lastStartedAt: hoursAgo(3), adminId: "a1", knownCount: 528 });
  const { runSync, calls } = fakeRunSync(parsedWith(520, 3));
  const outcome = await maybeRunAutoCatalogSync(db, NOW, { runSync });
  assert(outcome.status === "succeeded" && outcome.counts?.total === 520, JSON.stringify(outcome));
  assert(calls.rpc === 1 && calls.sources[0] === AUTO_SYNC_SOURCE, "fuente automática");
  assert(inserts.length === 0, "el RPC registra el éxito, no la función");
});

Deno.test("maybeRunAutoCatalogSync: error inesperado → failed sin lanzar", async () => {
  const { db, inserts } = fakeDb({ lastStartedAt: null, adminId: "a1", knownCount: 528 });
  const runSync = (() => Promise.reject(new Error("Google caído"))) as typeof runCatalogSync;
  const outcome = await maybeRunAutoCatalogSync(db, NOW, { runSync });
  assert(outcome.status === "failed" && outcome.detail === "Google caído", JSON.stringify(outcome));
  assert(inserts.length === 1 && inserts[0].error_detail === "Google caído", "debía registrar el fallo");

  const broken = fakeDb({ failOn: "catalog_sync_runs" });
  const outcome2 = await maybeRunAutoCatalogSync(broken.db, NOW, { runSync });
  assert(outcome2.status === "failed", "lectura fallida también es failed");
});
