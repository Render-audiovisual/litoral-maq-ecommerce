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

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts.shift() || "Cliente",
    lastName: parts.join(" ") || "Litoral Maq",
  };
}

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
        province: String(destination.province || order.province || ""),
        postalCode: String(destination.postalCode || order.postal_code || ""),
        localityId: destination.localityId
          ? String(destination.localityId)
          : undefined,
        deliveryMode: quote.delivery_mode,
        packages,
        totalWeightKg: Number(
          packages.reduce((sum, item) => sum + item.weightKg, 0).toFixed(2),
        ),
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

    async function persistShipment(
      shipment: ProviderShipment,
      providerOrderId: string,
    ) {
      let latestMessage = "";
      if (shipment.state === "P") {
        try {
          const tracking = await provider.getTracking(shipment.id);
          latestMessage = tracking.at(-1)?.message || "";
        } catch {
          // El tracking puede tardar en aparecer; la guía sigue siendo válida.
        }
      }
      const normalized = normalizeProviderStatus({
        state: shipment.state,
        condition: shipment.condition,
        latestTrackingMessage: latestMessage,
      });
      const labelReady = shipment.state === "P";
      const now = new Date().toISOString();
      const shipmentUpdate = {
        provider_order_id: providerOrderId,
        provider_shipment_id: shipment.id,
        status: normalized,
        provider_condition: shipment.condition,
        provider_subcondition: shipment.subcondition,
        tracking_number: shipment.trackingNumber,
        label_ready: labelReady,
        last_error: null,
        updated_at: now,
      };
      const { error: shipmentUpdateError } = await db
        .from("shipping_shipments")
        .update(shipmentUpdate)
        .eq("order_id", orderId);
      if (shipmentUpdateError) {
        throw new HttpError(
          503,
          "La guía se creó, pero no pudimos guardar su estado. Reintentá para reconciliarla.",
        );
      }
      await db.from("orders").update({
        shipping_provider: provider.id,
        shipping_carrier: providerQuote.carrierName,
        shipping_service: providerQuote.service,
        shipping_status: normalized,
        shipping_tracking_number: shipment.trackingNumber,
        shipping_label_ready: labelReady,
      }).eq("id", orderId);
      return { normalized, labelReady };
    }

    let lookup = await provider.findOrder(orderId);
    let providerOrderId = lookup?.orderId || "";
    if (!providerOrderId) {
      const names = splitName(order.customer_name);
      try {
        providerOrderId = (await provider.createOrder({
          externalOrderId: orderId,
          firstName: names.firstName,
          lastName: names.lastName,
          email: order.email,
          phone: order.phone || undefined,
          amount: Number(order.total),
          createdAt: order.created_at,
          province: order.province || String(destination.province || ""),
          locality: order.locality || String(destination.locality || ""),
        })).id;
      } catch (error) {
        // Un timeout puede ocurrir después de que Envíopack creó el pedido.
        lookup = await provider.findOrder(orderId);
        if (!lookup?.orderId) throw error;
        providerOrderId = lookup.orderId;
      }
    }

    lookup = await provider.findOrder(orderId);
    let shipment: ProviderShipment;
    if (lookup?.latestShipmentId) {
      shipment = await provider.getShipment(lookup.latestShipmentId);
    } else {
      shipment = await provider.createShipment({
        providerOrderId,
        quote: providerQuote,
        packages,
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
    }
    const persisted = await persistShipment(shipment, providerOrderId);
    return json(request, {
      status: persisted.normalized,
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      labelReady: persisted.labelReady,
      idempotent: Boolean(lookup?.latestShipmentId),
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
