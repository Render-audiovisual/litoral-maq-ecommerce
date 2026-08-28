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
      return json(
        request,
        await processPendingOrderNotifications(db, null, 25),
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
