// Endpoint público para un monitor externo (UptimeRobot o similar).
// 200 si el cron latió hace < 15 min y no hay alertas críticas/altas
// abiertas; 503 si no. Solo devuelve números: nada de datos ni secretos.
import { serviceClient } from "../_shared/http.ts";
import { healthReport } from "../_shared/health-checks.ts";
import { logEdgeError } from "../_shared/monitoring.ts";

function reply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return reply({ error: "Método no permitido." }, 405);
  }
  try {
    const db = serviceClient();
    const [heartbeat, alerts] = await Promise.all([
      db.from("system_heartbeat").select("last_tick_at").eq("id", "cron")
        .maybeSingle(),
      db.from("system_alerts").select("severity").is("resolved_at", null)
        .limit(100),
    ]);
    if (heartbeat.error) throw heartbeat.error;
    if (alerts.error) throw alerts.error;
    const report = healthReport(
      heartbeat.data?.last_tick_at,
      alerts.data ?? [],
      new Date(),
    );
    return reply(report, report.ok ? 200 : 503);
  } catch (error) {
    logEdgeError("health", error);
    return reply({
      ok: false,
      lastTickMinutesAgo: null,
      activeAlerts: { critical: 0, high: 0, medium: 0 },
    }, 503);
  }
});
