import { logEdgeError } from "../_shared/monitoring.ts";
import { processPendingOrderNotifications } from "../_shared/order-notifications.ts";
import { normalizeProviderStatus } from "../_shared/shipping/domain.ts";
import { getShippingProvider } from "../_shared/shipping/factory.ts";
import type {
  ProviderQuote,
  ProviderShipment,
} from "../_shared/shipping/types.ts";
import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";

type ShipmentBody = { orderId?: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function asPackages(value: unknown) {
  if (!Array.isArray(value)) {
    throw new HttpError(409, "La cotización no conserva bultos válidos.");
  }
  return value.map((raw) => {
    const item = asRecord(raw);
    return {
      productId: String(item.productId || ""),
      description: String(item.description || "Producto").slice(0, 50),
      weightKg: Number(item.weightKg),
      heightCm: Number(item.heightCm),
      widthCm: Number(item.widthCm),
      lengthCm: Number(item.lengthCm),
    };
  });
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }

  const db = serviceClient();
  let claimedOrderId = "";
  let claimOwned = false;
  try {
    await requireAdmin(request, db);
    const body = await request.json() as ShipmentBody;
    const orderId = String(body.orderId || "").trim();
    if (!/^LM-[A-Za-z0-9-]{1,26}$/.test(orderId)) {
      throw new HttpError(400, "El pedido no es válido.");
    }
    claimedOrderId = orderId;

    const { data: order, error: orderError } = await db.from("orders").select(
      "*",
    ).eq("id", orderId).maybeSingle();
    if (orderError || !order) {
      throw new HttpError(404, "No encontramos el pedido.");
    }
    if (order.delivery_method !== "envio") {
      throw new HttpError(
        409,
        "Este pedido es para retiro y no necesita guía.",
      );
    }
    if (order.payment_status !== "approved") {
      throw new HttpError(409, "Confirmá el pago antes de crear el envío.");
    }
    if (!order.shipping_quote_id) {
      throw new HttpError(
        409,
        "El pedido requiere cotización manual o una nueva cotización automática.",
      );
    }

    const { data: quote, error: quoteError } = await db
      .from("shipping_quotes")
      .select("*")
      .eq("id", order.shipping_quote_id)
      .maybeSingle();
    if (quoteError || !quote) {
      throw new HttpError(409, "La cotización elegida ya no está disponible.");
    }
    if (quote.customer_id !== order.customer_id) {
      throw new HttpError(409, "La cotización no pertenece a este pedido.");
    }

    const provider = getShippingProvider();
    if (quote.provider !== provider.id) {
      throw new HttpError(
        409,
        "El proveedor de la cotización no coincide con la configuración activa.",
      );
    }
    const packages = asPackages(quote.packages);
    const destination = asRecord(quote.destination);
    const providerQuote: ProviderQuote = {
      carrierId: quote.carrier_id,
      carrierName: quote.carrier_name,
      dispatchMode: quote.dispatch_mode,
      deliveryMode: quote.delivery_mode,
      service: quote.service,
      amount: Number(quote.amount),
      etaHours: quote.eta_hours,
      branchId: quote.branch_id,
      branchName: quote.branch_name,
      branchAddress: quote.branch_address,
    };

    // Si venció, se valida de nuevo sin crear nada. Una suba de tarifa o la
    // desaparición del servicio obliga a recotizar y confirmar el nuevo total.
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      const refreshed = await provider.quote({
        postalCode: String(destination.postalCode || order.postal_code || ""),
        deliveryMode: quote.delivery_mode,
        packages,
        totalWeightKg: Number(
          packages.reduce((sum, item) => sum + item.weightKg, 0).toFixed(2),
        ),
        declaredValue: Number(destination.declaredValue) || 0,
      });
      const current = refreshed.find((item) =>
        item.carrierId === providerQuote.carrierId &&
        item.service === providerQuote.service &&
        item.deliveryMode === providerQuote.deliveryMode &&
        (item.branchId || null) === (providerQuote.branchId || null)
      );
      if (!current || current.amount > providerQuote.amount + 0.01) {
        throw new HttpError(
          409,
          "La tarifa venció o cambió. Volvé a cotizar antes de crear la guía.",
        );
      }
    }

    const { data: insertedClaim, error: claimError } = await db
      .from("shipping_shipments")
      .insert({
        order_id: orderId,
        provider: provider.id,
        external_order_id: orderId,
        carrier_id: providerQuote.carrierId,
        carrier_name: providerQuote.carrierName,
        service: providerQuote.service,
        status: "creating",
      })
      .select("*")
      .maybeSingle();

    let claim = insertedClaim;
    if (!claimError && !claim) {
      throw new HttpError(503, "No se pudo reservar la creación de la guía.");
    }
    if (!claimError) claimOwned = true;
    if (claimError) {
      if (claimError.code !== "23505") {
        throw new HttpError(503, "No se pudo reservar la creación de la guía.");
      }
      const existing = await db.from("shipping_shipments").select("*").eq(
        "order_id",
        orderId,
      ).maybeSingle();
      if (existing.error || !existing.data) {
        throw new HttpError(503, "No se pudo reconciliar la guía existente.");
      }
      claim = existing.data;
      if (
        claim.provider_shipment_id &&
        ["processing", "ready", "in_transit", "delivered"].includes(
          claim.status,
        )
      ) {
        return json(request, {
          status: claim.status,
          shipmentId: claim.provider_shipment_id,
          idempotent: true,
        });
      }
      const updatedAt = new Date(claim.updated_at || claim.created_at)
        .getTime();
      if (claim.status === "creating" && Date.now() - updatedAt < 60_000) {
        throw new HttpError(
          409,
          "La guía ya se está creando. Esperá unos segundos y actualizá el pedido.",
        );
      }
      const { data: reclaimed, error: reclaimError } = await db
        .from("shipping_shipments")
        .update({
          status: "creating",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("updated_at", claim.updated_at)
        .select("id")
        .maybeSingle();
      if (reclaimError) {
        throw new HttpError(503, "No se pudo reanudar la creación de la guía.");
      }
      if (!reclaimed) {
        throw new HttpError(
          409,
          "La guía ya fue retomada por otro proceso. Actualizá el pedido en unos segundos.",
        );
      }
      claimOwned = true;
    }

    const declaredValue = Number(destination.declaredValue) || 0;
    const shipment: ProviderShipment = await provider.createShipment({
      externalOrderId: orderId,
      email: order.email,
      phone: order.phone || undefined,
      quote: providerQuote,
      packages,
      declaredValue,
      destination: {
        recipient: order.customer_name,
        province: order.province || String(destination.province || ""),
        postalCode: order.postal_code || String(destination.postalCode || ""),
        locality: order.locality || String(destination.locality || ""),
        street: order.street || undefined,
        streetNumber: order.street_number || undefined,
        floor: order.floor || undefined,
        apartment: order.apartment || undefined,
        reference: order.address_reference || undefined,
        branchId: quote.branch_id || undefined,
      },
    });
    const normalized = normalizeProviderStatus({ state: shipment.state });
    const { error: shipmentUpdateError } = await db
      .from("shipping_shipments")
      .update({
        provider_order_id: shipment.orderId,
        provider_shipment_id: shipment.shipmentId,
        status: normalized,
        provider_condition: shipment.state,
        tracking_number: shipment.trackingNumber,
        label_ready: true,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);
    if (shipmentUpdateError) {
      // La guía ya existe en OCA: no la marcamos como error, pedimos reconciliar.
      throw new HttpError(
        503,
        `La guía se creó en OCA (envío ${shipment.shipmentId}), pero no pudimos guardarla. Avisá a sistemas antes de reintentar.`,
      );
    }
    await db.from("orders").update({
      shipping_provider: provider.id,
      shipping_carrier: providerQuote.carrierName,
      shipping_service: providerQuote.service,
      shipping_status: normalized,
      shipping_tracking_number: shipment.trackingNumber,
      shipping_label_ready: true,
    }).eq("id", orderId);
    const persisted = { normalized, labelReady: true };
    // Aviso al cliente con su número de seguimiento. Nunca frena la respuesta.
    try {
      await db.from("order_notification_outbox").upsert({
        order_id: orderId,
        event_type: "customer_shipment_created",
        event_key: `order:${orderId}:shipment-created`,
      }, { onConflict: "event_key" });
      EdgeRuntime.waitUntil(
        processPendingOrderNotifications(db, orderId, 10).catch(() => undefined),
      );
    } catch (error) {
      logEdgeError("shipping-create", error, { step: "enqueue_email", orderId });
    }
    return json(request, {
      status: persisted.normalized,
      shipmentId: shipment.shipmentId,
      trackingNumber: shipment.trackingNumber,
      labelReady: persisted.labelReady,
      idempotent: false,
    });
  } catch (error) {
    // If another request already owns the idempotency claim, the losing
    // request must not turn that valid in-flight shipment into an error.
    if (
      claimOwned && claimedOrderId &&
      !(error instanceof HttpError && error.status === 409)
    ) {
      const safeMessage = error instanceof Error
        ? error.message.slice(0, 300)
        : "Error logístico";
      await db.from("shipping_shipments").update({
        status: "error",
        last_error: safeMessage,
        updated_at: new Date().toISOString(),
      }).eq("order_id", claimedOrderId).is("provider_shipment_id", null);
      await db.from("orders").update({ shipping_status: "error" }).eq(
        "id",
        claimedOrderId,
      ).not("shipping_quote_id", "is", null);
    }
    return errorResponse(request, error);
  }
});
