import {
  corsHeaders,
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";
import { getShippingProvider } from "../_shared/shipping/factory.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  try {
    const db = serviceClient();
    await requireAdmin(request, db);
    const body = await request.json() as { orderId?: string; format?: string };
    const orderId = String(body.orderId || "").trim();
    const format = body.format === "jpg" ? "jpg" : "pdf";
    const { data, error } = await db
      .from("shipping_shipments")
      .select("provider,provider_shipment_id,label_ready")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error || !data?.provider_shipment_id) {
      throw new HttpError(404, "La guía todavía no existe.");
    }
    if (!data.label_ready) {
      throw new HttpError(409, "Envíopack todavía no confirmó la etiqueta.");
    }
    const provider = getShippingProvider();
    if (data.provider !== provider.id) {
      throw new HttpError(409, "La guía pertenece a otro proveedor logístico.");
    }
    const label = await provider.getLabel(data.provider_shipment_id, format);
    const responseBody = Uint8Array.from(label.bytes).buffer;
    return new Response(responseBody, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "content-type": label.contentType,
        "content-disposition":
          `attachment; filename="Etiqueta ${orderId}.${format}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
