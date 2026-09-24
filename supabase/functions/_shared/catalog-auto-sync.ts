import {
  type CatalogDb,
  CatalogSyncBlockedError,
  MANUAL_SYNC_SOURCE,
  runCatalogSync,
} from "./catalog-sync.ts";

export const AUTO_SYNC_INTERVAL_HOURS = 3;
export const AUTO_SYNC_SOURCE = `${MANUAL_SYNC_SOURCE} (automática)`;

const INTERVAL_MS = AUTO_SYNC_INTERVAL_HOURS * 60 * 60 * 1000;

// Cuenta cualquier corrida previa (manual o automática, exitosa o fallida):
// un fallo también espera 3 h antes de reintentar.
export function isAutoSyncDue(
  lastStartedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!lastStartedAt) return true;
  const last = new Date(lastStartedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= INTERVAL_MS;
}

export function evaluateAutoSyncSafety(
  { parsedCount, knownCount, invalidCount }: {
    parsedCount: number;
    knownCount: number;
    invalidCount: number;
  },
): { ok: true } | { ok: false; reason: string } {
  if (parsedCount === 0) {
    return { ok: false, reason: "El Sheet no trajo productos legibles; se pidió revisión manual." };
  }
  if (knownCount >= 20 && parsedCount < 0.8 * knownCount) {
    return {
      ok: false,
      reason:
        `El Sheet trae ${parsedCount} productos y el catálogo tiene ${knownCount}: parece incompleto, se pidió revisión manual.`,
    };
  }
  if (invalidCount > 0.1 * (parsedCount + invalidCount)) {
    return {
      ok: false,
      reason:
        `El Sheet tiene ${invalidCount} filas ilegibles de ${parsedCount + invalidCount}: son demasiadas, se pidió revisión manual.`,
    };
  }
  return { ok: true };
}

export type AutoSyncOutcome = {
  status: "skipped" | "succeeded" | "blocked" | "failed";
  detail?: string;
  counts?: Record<string, unknown>;
};

async function recordAutoFailure(db: CatalogDb, adminId: string, detail: string) {
  try {
    const { error } = await db.from("catalog_sync_runs").insert({
      admin_id: adminId,
      status: "failed",
      source: AUTO_SYNC_SOURCE,
      error_detail: detail.slice(0, 1200),
      finished_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error(JSON.stringify({
      scope: "catalog-auto-sync",
      step: "record_failure",
      error: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error),
    }));
  }
}

// Nunca lanza: corre dentro del tick del cron de correos y no puede frenarlo.
export async function maybeRunAutoCatalogSync(
  db: CatalogDb,
  now = new Date(),
  deps: { runSync: typeof runCatalogSync } = { runSync: runCatalogSync },
): Promise<AutoSyncOutcome> {
  let actorId: string | null = null;
  try {
    const { data: lastRun, error: lastRunError } = await db
      .from("catalog_sync_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRunError) throw lastRunError;
    if (!isAutoSyncDue(lastRun?.started_at, now)) return { status: "skipped" };

    // Sin columna nueva: la corrida queda a nombre del primer administrador.
    const { data: actor, error: actorError } = await db
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actor?.id) return { status: "skipped", detail: "sin administrador" };
    actorId = actor.id as string;

    // Los ya retirados ("sheet-absent") no cuentan: si no, el histórico
    // inflaría la base de comparación y frenaría corridas sanas.
    const { count: knownCount, error: knownError } = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("source", "google-sheet")
      .not("incomplete", "cs", "{sheet-absent}");
    if (knownError) throw knownError;

    const { result } = await deps.runSync(db, {
      adminId: actorId,
      source: AUTO_SYNC_SOURCE,
      guard: (parsed, keptRows) =>
        evaluateAutoSyncSafety({
          parsedCount: keptRows.length,
          knownCount: knownCount ?? 0,
          invalidCount: parsed.invalidRows.length,
        }),
    });
    const { total, created, updated, unchanged, removed } = result ?? {};
    return { status: "succeeded", counts: { total, created, updated, unchanged, removed } };
  } catch (error) {
    const blocked = error instanceof CatalogSyncBlockedError;
    const message = error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message ?? "Error desconocido");
    const detail = blocked ? `Sincronización automática detenida: ${message}` : message;
    console.error(JSON.stringify({
      scope: "catalog-auto-sync",
      status: blocked ? "blocked" : "failed",
      error: detail.slice(0, 300),
    }));
    if (actorId) await recordAutoFailure(db, actorId, detail);
    return { status: blocked ? "blocked" : "failed", detail: detail.slice(0, 1200) };
  }
}
