import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireAdmin,
  requireUser,
  serviceClient,
} from "../_shared/http.ts";
import { processPendingOrderNotifications } from "../_shared/order-notifications.ts";
import { maybeRunAutoCatalogSync } from "../_shared/catalog-auto-sync.ts";
import { collectFindings } from "../_shared/health-checks.ts";
import { runAlerting, supabaseAlertStore } from "../_shared/alerting.ts";
import { logEdgeError } from "../_shared/monitoring.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  const db = serviceClient();
  try {
    const cronSecret = (Deno.env.get("ORDER_NOTIFICATIONS_CRON_SECRET") || "")
      .trim();
    const providedCronSecret = (
      request.headers.get("x-order-notifications-secret") || ""
    ).trim();
    const isCronRequest = cronSecret.length >= 24 &&
      providedCronSecret === cronSecret;
    if (isCronRequest) {
      const { data: lifecycle, error: lifecycleError } = await db.rpc(
        "process_pending_order_lifecycle",
      );
      // Un fallo del ciclo de vida no puede frenar el resto de los correos.
      if (lifecycleError) {
        console.error(JSON.stringify({
          scope: "order-notifications",
          step: "process_pending_order_lifecycle",
          error: lifecycleError.message,
          code: lifecycleError.code,
        }));
      }
      const lifecycleResult = lifecycleError
        ? null
        : Array.isArray(lifecycle)
        ? lifecycle[0] ?? null
        : lifecycle;
      // Latido del cron: lo lee el endpoint health y la alerta de cron caído.
      // Nunca frena el tick.
      try {
        const { error: heartbeatError } = await db.from("system_heartbeat")
          .upsert({
            id: "cron",
            last_tick_at: new Date().toISOString(),
            last_lifecycle: lifecycleResult,
            last_error: lifecycleError?.message ?? null,
          }, { onConflict: "id" });
        if (heartbeatError) throw heartbeatError;
      } catch (error) {
        logEdgeError("order-notifications", error, { step: "heartbeat" });
      }
      const notifications = await processPendingOrderNotifications(
        db,
        null,
        25,
      );
      // Después de los correos, para que una sincronización lenta no los demore.
      // En Supabase corre en segundo plano (EdgeRuntime.waitUntil): el cron
      // corta la espera a los 15 s y la sincronización puede tardar más. Su
      // resultado queda en catalog_sync_runs.
      const syncRun = maybeRunAutoCatalogSync(db).catch((error) => {
        console.error(JSON.stringify({
          scope: "order-notifications",
          step: "catalog_auto_sync",
          error: error instanceof Error ? error.message : "Error desconocido",
        }));
        return { status: "failed" as const };
      });
      let catalogSync: unknown;
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
        EdgeRuntime.waitUntil(syncRun);
        catalogSync = { status: "background" };
      } else {
        catalogSync = await syncRun;
      }
      // Alertas al equipo, también en segundo plano y aisladas del resto.
      const alertsRun = (async () => {
        const { findings, unchecked } = await collectFindings(db);
        return await runAlerting(supabaseAlertStore(db), findings, unchecked);
      })().catch((error) => {
        logEdgeError("order-notifications", error, { step: "alerts" });
        return { status: "failed" as const };
      });
      let alerts: unknown;
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
        EdgeRuntime.waitUntil(alertsRun);
        alerts = { status: "background" };
      } else {
        alerts = await alertsRun;
      }
      return json(
        request,
        {
          lifecycle: lifecycleResult,
          ...(lifecycleError ? { lifecycleError: lifecycleError.message } : {}),
          notifications,
          catalogSync,
          alerts,
        },
      );
    }

    const user = await requireUser(request, db);
    const body = asRecord(await request.json().catch(() => ({})));
    const orderId = String(body.orderId || "").trim();
    if (orderId) {
      if (!/^LM-[A-Za-z0-9-]{1,26}$/.test(orderId)) {
        throw new HttpError(422, "El pedido no es válido.");
      }
      const { data: order, error } = await db.from("orders").select(
        "customer_id",
      )
        .eq("id", orderId).maybeSingle();
      if (error || !order) {
        throw new HttpError(404, "No encontramos el pedido.");
      }
      if (order.customer_id !== user.id) await requireAdmin(request, db);
    } else {
      await requireAdmin(request, db);
    }
    return json(
      request,
      await processPendingOrderNotifications(
        db,
        orderId || null,
        orderId ? 10 : 25,
      ),
    );
  } catch (error) {
    return errorResponse(request, error);
  }
});
