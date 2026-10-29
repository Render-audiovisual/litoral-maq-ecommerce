import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { logEdgeError } from "../monitoring.ts";
import { normalizeProviderStatus } from "./domain.ts";
import { getShippingProvider } from "./factory.ts";
import { HttpError } from "../http.ts";
import type { TrackingEvent } from "./types.ts";

// OCA no tiene webhooks: el estado se consulta a pedido (panel) o por cron.
export async function refreshShipmentTracking(
  db: SupabaseClient,
  orderId: string,
): Promise<{ status: string; events: TrackingEvent[] }> {
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

  // El pedido acompaña al envío: así el panel no queda en "preparando" con el
  // paquete viajando. Un pedido cancelado no se toca. Los correos "en camino"
  // y "entregado" salen del trigger que mira estos cambios.
  const orderUpdate: Record<string, unknown> = { shipping_status: status };
  if (status === "in_transit") orderUpdate.status = "enviado";
  if (status === "delivered") orderUpdate.status = "entregado";
  const previous = status === "delivered"
    ? ["preparando", "listo", "enviado"]
    : ["preparando", "listo"];
  const { error: orderError } = await db.from("orders").update(orderUpdate).eq(
    "id",
    orderId,
  ).in("status", previous);
  if (orderError) throw orderError;
  // Pedido en otro estado (p. ej. ya "enviado"): solo el estado logístico.
  await db.from("orders").update({ shipping_status: status }).eq("id", orderId);
  return { status, events };
}

const OPEN_STATUSES = ["ready", "processing", "in_transit"];

/** Consulta a OCA los envíos abiertos que no se miraron en los últimos 30 min. */
export async function refreshOpenShipments(db: SupabaseClient, limit = 10) {
  const provider = getShippingProvider();
  const { data } = await db
    .from("shipping_shipments")
    .select("order_id")
    .eq("provider", provider.id)
    .in("status", OPEN_STATUSES)
    .not("provider_shipment_id", "is", null)
    .gt("created_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
    .lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("updated_at", { ascending: true })
    .limit(limit);
  let refreshed = 0;
  for (const row of (data || []) as { order_id: string }[]) {
    try {
      await refreshShipmentTracking(db, row.order_id);
      refreshed += 1;
    } catch (error) {
      // OCA puede devolver 500 justo después de crear la guía: se reintenta.
      logEdgeError("shipping-tracking-cron", error, { order_id: row.order_id });
      // Se marca como mirado para que un envío que falla no tape a los demás.
      await db.from("shipping_shipments").update({
        updated_at: new Date().toISOString(),
      }).eq("order_id", row.order_id);
    }
  }
  return { checked: (data || []).length, refreshed };
}
