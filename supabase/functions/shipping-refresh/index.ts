import { normalizeProviderStatus } from "../_shared/shipping/domain.ts";
import { getShippingProvider } from "../_shared/shipping/factory.ts";
import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";

// OCA no tiene webhooks: el estado se consulta a pedido desde el panel.
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
    const { data, error } = await db
      .from("shipping_shipments")
      .select("provider,provider_shipment_id,status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error || !data?.provider_shipment_id) {
      throw new HttpError(404, "La guía todavía no existe.");
    }
    const provider = getShippingProvider();
    if (data.provider !== provider.id) {
      throw new HttpError(409, "La guía pertenece a otro proveedor logístico.");
    }
    const events = await provider.getTracking(data.provider_shipment_id);
    const latest = events.at(-1);
    // Sin eventos todavía: se conserva el estado actual.
    const status = latest
      ? normalizeProviderStatus({ latestTrackingMessage: latest.message })
      : data.status;
    await db.from("shipping_shipments").update({
      status,
      provider_condition: latest?.message ?? null,
      updated_at: new Date().toISOString(),
    }).eq("order_id", orderId);
    await db.from("orders").update({ shipping_status: status }).eq(
      "id",
      orderId,
    );
    return json(request, { status, events });
  } catch (error) {
    return errorResponse(request, error);
  }
});
