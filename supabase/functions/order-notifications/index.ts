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
      const notifications = await processPendingOrderNotifications(
        db,
        null,
        25,
      );
      // Después de los correos, para que una sincronización lenta no los demore.
      let catalogSync: unknown;
      try {
        catalogSync = await maybeRunAutoCatalogSync(db);
      } catch (error) {
        console.error(JSON.stringify({
          scope: "order-notifications",
          step: "catalog_auto_sync",
          error: error instanceof Error ? error.message : "Error desconocido",
        }));
        catalogSync = { status: "failed" };
      }
      return json(
        request,
        {
          lifecycle: lifecycleError
            ? null
            : Array.isArray(lifecycle)
            ? lifecycle[0] ?? null
            : lifecycle,
          ...(lifecycleError ? { lifecycleError: lifecycleError.message } : {}),
          notifications,
          catalogSync,
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
