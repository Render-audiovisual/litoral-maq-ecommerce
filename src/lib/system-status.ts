/**
 * Estado del sistema que muestra la tarjeta de Configuración: último latido
 * del cron, alertas abiertas (system_alerts) y última sincronización del
 * catálogo. Solo se lee de la base real; en modo local no hay datos.
 */
export type AlertSeverity = "critical" | "high" | "medium";

export type SystemAlert = {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  firstSeenAt: string;
};

export type CatalogSyncRun = {
  status: "succeeded" | "failed";
  startedAt: string;
  total: number | null;
  created: number | null;
  updated: number | null;
  retired: number | null;
  errorDetail: string | null;
};

export type SystemStatus = {
  lastTickAt: string | null;
  alerts: SystemAlert[];
  lastSync: CatalogSyncRun | null;
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2 };

export function sortAlerts(alerts: SystemAlert[]) {
  return [...alerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.firstSeenAt.localeCompare(b.firstSeenAt),
  );
}

/** "Hace 3 min", "Hace 2 h", "Hace 3 días". */
export function formatAgo(iso: string | null, now: Date) {
  const at = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(at)) return "Sin registro";
  const minutes = Math.max(0, Math.floor((now.getTime() - at) / 60_000));
  if (minutes < 1) return "Hace instantes";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} días`;
}

/** Punto del latido: verde < 15 min, naranja < 60 min, rojo si no. */
export function tickDot(lastTickAt: string | null, now: Date): "green" | "orange" | "red" {
  const at = lastTickAt ? Date.parse(lastTickAt) : NaN;
  if (Number.isNaN(at)) return "red";
  const minutes = (now.getTime() - at) / 60_000;
  if (minutes < 15) return "green";
  if (minutes < 60) return "orange";
  return "red";
}

export function syncSummary(run: CatalogSyncRun) {
  if (run.status === "failed") return run.errorDetail || "Falló sin detalle.";
  return `${run.total ?? 0} productos: ${run.created ?? 0} nuevos, ${run.updated ?? 0} actualizados, ${run.retired ?? 0} retirados.`;
}
