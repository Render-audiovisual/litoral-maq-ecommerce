import { normalizeProviderStatus } from "../_shared/shipping/domain.ts";
import { getShippingProvider } from "../_shared/shipping/factory.ts";
import { serviceClient } from "../_shared/http.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function processNotification(type: string, shipmentId: string) {
  const db = serviceClient();
  const provider = getShippingProvider();
  const shipment = await provider.getShipment(shipmentId);
  let latestMessage = "";
  try {
    const tracking = await provider.getTracking(shipmentId);
    latestMessage = tracking.at(-1)?.message || "";
  } catch {
    // Un envío recién procesado puede no tener tracking todavía.
  }
  const status = normalizeProviderStatus({
    state: shipment.state,
    condition: shipment.condition,
    latestTrackingMessage: latestMessage,
  });
  const labelReady = shipment.state === "P";
  const dedupeKey = [
    type,
    shipmentId,
    shipment.state,
    shipment.condition,
    shipment.subcondition,
    latestMessage,
  ].join(":");
  const { error: eventError } = await db.from("shipping_events").upsert({
    provider: provider.id,
    event_type: type,
    provider_shipment_id: shipmentId,
    dedupe_key: dedupeKey,
    payload: {
      state: shipment.state,
      condition: shipment.condition,
      subcondition: shipment.subcondition,
      latestTrackingMessage: latestMessage,
    },
    processed_at: new Date().toISOString(),
    processing_error: null,
  }, { onConflict: "provider,dedupe_key", ignoreDuplicates: true });
  if (eventError) throw eventError;

  const { data: stored, error: shipmentError } = await db
    .from("shipping_shipments")
    .update({
      status,
      provider_condition: shipment.condition,
      provider_subcondition: shipment.subcondition,
      tracking_number: shipment.trackingNumber,
      label_ready: labelReady,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", provider.id)
    .eq("provider_shipment_id", shipmentId)
    .select("order_id")
    .maybeSingle();
  if (shipmentError || !stored?.order_id) return;
  await db.from("orders").update({
    shipping_status: status,
    shipping_tracking_number: shipment.trackingNumber,
    shipping_label_ready: labelReady,
    ...(status === "delivered" ? { status: "entregado" } : {}),
  }).eq("id", stored.order_id);
}

Deno.serve((request) => {
  const url = new URL(request.url);
  const configuredSecret = Deno.env.get("ENVIOPACK_WEBHOOK_SECRET") || "";
  const receivedSecret = url.searchParams.get("token") || "";
  if (!configuredSecret || receivedSecret !== configuredSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  const type = url.searchParams.get("tipo") || "";
  const shipmentId = url.searchParams.get("id") || "";
  if (
    !/^(envio-procesado|envio-cambio-condicion)$/.test(type) ||
    !/^\d+$/.test(shipmentId)
  ) {
    return new Response("ignored", { status: 200 });
  }
  EdgeRuntime.waitUntil(
    processNotification(type, shipmentId).catch(async (error) => {
      try {
        const db = serviceClient();
        await db.from("shipping_events").upsert({
          provider: "enviopack",
          event_type: type,
          provider_shipment_id: shipmentId,
          dedupe_key: `${type}:${shipmentId}:processing-error`,
          payload: {},
          processing_error: error instanceof Error
            ? error.message.slice(0, 300)
            : "Error desconocido",
        }, { onConflict: "provider,dedupe_key" });
      } catch {
        // Envíopack ya recibió 200; la conciliación operativa detectará el pendiente.
      }
    }),
  );
  return new Response("ok", { status: 200 });
});
