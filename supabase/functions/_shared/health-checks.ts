// Detectores de fallas del sistema. Cada detector es puro: recibe filas ya
// leídas y `now`, y devuelve cero o más hallazgos. `collectFindings` es la
// capa fina que lee la base (solo selects acotados) y los corre.
//
// Nada de datos personales en title/detail: solo ids de pedido, cantidades
// y mensajes de error con emails y números largos tapados.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { logEdgeError, redactText } from "./monitoring.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const OUTBOX_FAILED_WINDOW_MS = 7 * 24 * HOUR;
export const OUTBOX_STUCK_MS = 30 * MINUTE;
export const CATALOG_SYNC_STALLED_MS = 12 * HOUR;
export const PAYMENT_NOT_APPLIED_MS = 10 * MINUTE;
export const PAYMENT_LOOKBACK_MS = 30 * 24 * HOUR;
export const LIFECYCLE_OVERDUE_MS = 30 * MINUTE;
export const HEARTBEAT_STALE_MS = 20 * MINUTE;
export const PAID_NOT_STARTED_MS = 12 * HOUR;
export const MAX_IDS = 5;
export const ERROR_SNIPPET = 120;

export type Severity = "critical" | "high" | "medium";

export type Finding = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
};

// Una línea "Qué revisar" por tipo de alerta (va en el correo).
export const WHAT_TO_CHECK: Record<string, string> = {
  outbox_failed:
    "Hay correos de pedidos que no salen: revisá RESEND_API_KEY/RESEND_FROM_EMAIL, el dominio en Resend y los logs de order-notifications.",
  catalog_sync_failed:
    "La última sincronización del Sheet falló o se frenó: revisá encabezados y filas del Sheet y probá sincronizar desde el panel.",
  catalog_sync_stalled:
    "El catálogo no se actualiza desde el Sheet hace más de 12 h: revisá la sincronización en el panel y los logs de order-notifications.",
  payment_not_applied:
    "Mercado Pago cobró pero el pedido no figura pagado: revisá el webhook y el pedido en el panel.",
  lifecycle_stalled:
    "El cron no está procesando pedidos vencidos: revisá el job de pg_cron y los logs de order-notifications.",
  paid_not_started:
    "Hay pedidos pagados esperando: pasalos a preparación o contactá al cliente desde el panel.",
};

export type OutboxRow = {
  event_type: string;
  status: string;
  created_at: string;
  last_error: string | null;
};
export type SyncRunRow = {
  status: string;
  started_at: string;
  error_detail: string | null;
};
export type PaymentRow = { order_id: string; status: string; updated_at: string };
export type OrderPaymentRow = { id: string; payment_status: string | null };
export type OverdueOrderRow = { id: string; expires_at: string | null };
export type PaidOrderRow = {
  id: string;
  created_at: string;
  status_changed_at?: string | null;
};
export type HeartbeatRow = { last_tick_at: string } | null;

const ms = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(value) ? null : value;
};

export function formatAge(elapsedMs: number): string {
  const minutes = Math.max(0, Math.floor(elapsedMs / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

function idList(ids: string[]) {
  const shown = ids.slice(0, MAX_IDS).join(", ");
  return ids.length > MAX_IDS ? `${shown} y ${ids.length - MAX_IDS} más` : shown;
}

export function detectOutboxFailed(rows: OutboxRow[], now: Date): Finding[] {
  const t = now.getTime();
  const hits = rows.filter((row) => {
    const created = ms(row.created_at);
    if (created === null) return false;
    if (row.status === "failed") return t - created <= OUTBOX_FAILED_WINDOW_MS;
    if (row.status === "pending" || row.status === "sending") {
      return t - created > OUTBOX_STUCK_MS;
    }
    return false;
  });
  if (!hits.length) return [];
  const byType = new Map<string, number>();
  const errors = new Map<string, number>();
  let oldest = t;
  for (const row of hits) {
    byType.set(row.event_type, (byType.get(row.event_type) ?? 0) + 1);
    oldest = Math.min(oldest, ms(row.created_at)!);
    if (row.last_error) {
      errors.set(row.last_error, (errors.get(row.last_error) ?? 0) + 1);
    }
  }
  const types = [...byType].map(([type, count]) => `${type}: ${count}`).join(", ");
  const topError = [...errors].sort((a, b) => b[1] - a[1])[0]?.[0];
  return [{
    key: "outbox_failed",
    severity: "high",
    title: `${hits.length} correo${hits.length === 1 ? "" : "s"} de pedidos sin enviar`,
    detail: `${types}. El más viejo es de hace ${formatAge(t - oldest)}.` +
      (topError ? ` Error más común: ${redactText(topError, ERROR_SNIPPET)}` : ""),
  }];
}

export function detectCatalogSync(runs: SyncRunRow[], now: Date): Finding[] {
  const sorted = [...runs].sort((a, b) =>
    (ms(b.started_at) ?? 0) - (ms(a.started_at) ?? 0)
  );
  const findings: Finding[] = [];
  const latest = sorted[0];
  if (latest?.status === "failed") {
    findings.push({
      key: "catalog_sync_failed",
      severity: "medium",
      title: "Falló la última sincronización del catálogo",
      detail: latest.error_detail
        ? redactText(latest.error_detail, 300)
        : "Sin detalle del error.",
    });
  }
  const lastSuccess = sorted.find((run) => run.status === "succeeded");
  const lastSuccessMs = ms(lastSuccess?.started_at);
  if (lastSuccessMs === null || now.getTime() - lastSuccessMs > CATALOG_SYNC_STALLED_MS) {
    findings.push({
      key: "catalog_sync_stalled",
      severity: "high",
      title: "El catálogo no se sincroniza hace más de 12 h",
      detail: lastSuccessMs === null
        ? "No hay ninguna sincronización exitosa registrada."
        : `La última sincronización exitosa fue hace ${formatAge(now.getTime() - lastSuccessMs)}.`,
    });
  }
  return findings;
}

export function detectPaymentNotApplied(
  payments: PaymentRow[],
  orders: OrderPaymentRow[],
  now: Date,
): Finding[] {
  const orderStatus = new Map(orders.map((order) => [order.id, order.payment_status]));
  const ids = payments.filter((payment) => {
    const updated = ms(payment.updated_at);
    return payment.status === "approved" && updated !== null &&
      now.getTime() - updated > PAYMENT_NOT_APPLIED_MS &&
      orderStatus.has(payment.order_id) &&
      // Devoluciones cargadas a mano en el panel no son una falla del webhook.
      !["approved", "refunded", "charged_back"].includes(
        orderStatus.get(payment.order_id) ?? "",
      );
  }).map((payment) => payment.order_id);
  if (!ids.length) return [];
  return [{
    key: "payment_not_applied",
    severity: "critical",
    title: ids.length === 1
      ? "Un pago aprobado no se aplicó al pedido"
      : `${ids.length} pagos aprobados no se aplicaron a sus pedidos`,
    detail: `Pedidos: ${idList(ids)}.`,
  }];
}

export function detectLifecycleStalled(
  overdue: OverdueOrderRow[],
  heartbeat: HeartbeatRow,
  now: Date,
): Finding[] {
  const t = now.getTime();
  const ids = overdue.filter((order) => {
    const expires = ms(order.expires_at);
    return expires !== null && t - expires > LIFECYCLE_OVERDUE_MS;
  }).map((order) => order.id);
  const lastTick = ms(heartbeat?.last_tick_at);
  const staleTick = lastTick === null || t - lastTick > HEARTBEAT_STALE_MS;
  if (!ids.length && !staleTick) return [];
  const parts: string[] = [];
  if (staleTick) {
    parts.push(lastTick === null
      ? "El cron nunca registró un latido."
      : `El último latido del cron fue hace ${formatAge(t - lastTick)}.`);
  }
  if (ids.length) {
    parts.push(`${ids.length} pedido${ids.length === 1 ? "" : "s"} sin pago vencido${ids.length === 1 ? "" : "s"} y sin cancelar: ${idList(ids)}.`);
  }
  return [{
    key: "lifecycle_stalled",
    severity: "high",
    title: staleTick ? "El cron de pedidos no está corriendo" : "Hay pedidos vencidos sin cancelar",
    detail: parts.join(" "),
  }];
}

export function detectPaidNotStarted(orders: PaidOrderRow[], now: Date): Finding[] {
  const ids = orders.filter((order) => {
    const since = ms(order.status_changed_at) ?? ms(order.created_at);
    return since !== null && now.getTime() - since > PAID_NOT_STARTED_MS;
  }).map((order) => order.id);
  if (!ids.length) return [];
  return [{
    key: "paid_not_started",
    severity: "medium",
    title: `Hay ${ids.length} pedido${ids.length === 1 ? "" : "s"} pagado${ids.length === 1 ? "" : "s"} sin preparar hace más de 12 h`,
    detail: `Pedidos: ${idList(ids)}.`,
  }];
}

// ---------------------------------------------------------------------------
// Lectura de la base. Si una consulta falla, sus alertas quedan "sin revisar"
// (unchecked) para que no se den por resueltas por error.
// ---------------------------------------------------------------------------

export type CollectedFindings = { findings: Finding[]; unchecked: string[] };

export async function collectFindings(
  db: SupabaseClient,
  now = new Date(),
): Promise<CollectedFindings> {
  const findings: Finding[] = [];
  const unchecked: string[] = [];
  const iso = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString();
  const run = async (keys: string[], check: () => Promise<Finding[]>) => {
    try {
      findings.push(...await check());
    } catch (error) {
      unchecked.push(...keys);
      logEdgeError("health-checks", error, { checks: keys });
    }
  };
  const rows = <T>(result: { data: unknown; error: unknown }): T[] => {
    if (result.error) throw result.error;
    return (result.data ?? []) as T[];
  };

  await run(["outbox_failed"], async () =>
    detectOutboxFailed(
      rows<OutboxRow>(
        await db.from("order_notification_outbox")
          .select("event_type,status,created_at,last_error")
          .or(
            `and(status.eq.failed,created_at.gte.${iso(OUTBOX_FAILED_WINDOW_MS)}),` +
              `and(status.in.(pending,sending),created_at.lt.${iso(OUTBOX_STUCK_MS)})`,
          )
          .order("created_at", { ascending: true })
          .limit(200),
      ),
      now,
    ));

  await run(["catalog_sync_failed", "catalog_sync_stalled"], async () => {
    const latest = rows<SyncRunRow>(
      await db.from("catalog_sync_runs").select("status,started_at,error_detail")
        .order("started_at", { ascending: false }).limit(1),
    );
    const lastSuccess = rows<SyncRunRow>(
      await db.from("catalog_sync_runs").select("status,started_at,error_detail")
        .eq("status", "succeeded")
        .order("started_at", { ascending: false }).limit(1),
    );
    return detectCatalogSync([...latest, ...lastSuccess], now);
  });

  await run(["payment_not_applied"], async () => {
    const payments = rows<PaymentRow>(
      await db.from("payments").select("order_id,status,updated_at")
        .eq("status", "approved")
        .gte("updated_at", iso(PAYMENT_LOOKBACK_MS))
        .lt("updated_at", iso(PAYMENT_NOT_APPLIED_MS))
        .order("updated_at", { ascending: false })
        .limit(200),
    );
    if (!payments.length) return [];
    const orders = rows<OrderPaymentRow>(
      await db.from("orders").select("id,payment_status")
        .in("id", payments.map((payment) => payment.order_id)),
    );
    return detectPaymentNotApplied(payments, orders, now);
  });

  await run(["lifecycle_stalled"], async () => {
    const overdue = rows<OverdueOrderRow>(
      await db.from("orders").select("id,expires_at")
        .eq("payment_status", "pending").eq("status", "pendiente")
        .lt("expires_at", iso(LIFECYCLE_OVERDUE_MS))
        .limit(50),
    );
    const { data: heartbeat, error } = await db.from("system_heartbeat")
      .select("last_tick_at").eq("id", "cron").maybeSingle();
    if (error) throw error;
    return detectLifecycleStalled(overdue, heartbeat as HeartbeatRow, now);
  });

  await run(["paid_not_started"], async () =>
    detectPaidNotStarted(
      rows<PaidOrderRow>(
        await db.from("orders").select("id,created_at,status_changed_at")
          .eq("payment_status", "approved").eq("status", "pendiente")
          .order("created_at", { ascending: true })
          .limit(50),
      ),
      now,
    ));

  return { findings, unchecked };
}

// ---------------------------------------------------------------------------
// Endpoint health (monitor externo): sano si el cron latió hace < 15 min y
// no hay alertas críticas/altas abiertas.
// ---------------------------------------------------------------------------

export const HEALTH_TICK_MAX_MS = 15 * MINUTE;

export function healthReport(
  lastTickAt: string | null | undefined,
  openAlerts: { severity: string }[],
  now: Date,
) {
  const activeAlerts = { critical: 0, high: 0, medium: 0 };
  for (const alert of openAlerts) {
    if (alert.severity in activeAlerts) {
      activeAlerts[alert.severity as Severity] += 1;
    }
  }
  const lastTick = ms(lastTickAt);
  const elapsed = lastTick === null ? null : now.getTime() - lastTick;
  return {
    ok: elapsed !== null && elapsed < HEALTH_TICK_MAX_MS &&
      activeAlerts.critical === 0 && activeAlerts.high === 0,
    lastTickMinutesAgo: elapsed === null ? null : Math.max(0, Math.floor(elapsed / MINUTE)),
    activeAlerts,
  };
}

export const isHealthy = (
  lastTickAt: string | null | undefined,
  openAlerts: { severity: string }[],
  now: Date,
) => healthReport(lastTickAt, openAlerts, now).ok;
