import { refreshShipmentTracking } from "../_shared/shipping/refresh.ts";
import {
  errorResponse,
  handleOptions,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";

// OCA no tiene webhooks: el estado se consulta a pedido desde el panel y por
// cron (order-notifications).
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  try {
    const db = serviceClient();
    await requireAdmin(request, db);
    const body = await request.json() as { orderId?: string };
    const orderId = String(body.orderId || "").trim();
    return json(request, await refreshShipmentTracking(db, orderId));
  } catch (error) {
    return errorResponse(request, error);
  }
});
