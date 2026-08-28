import {
  MercadoPagoClient,
  verifyMercadoPagoSignature,
} from "../_shared/payments/mercadopago.ts";
import { serviceClient } from "../_shared/http.ts";
import { processPendingOrderNotifications } from "../_shared/order-notifications.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function internalStatus(value: unknown) {
  const status = String(value || "pending");
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "charged_back") return "charged_back";
  return "pending";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("ok", { status: 200 });
  const db = serviceClient();
  let eventKey = "";
  try {
    const body = asRecord(await request.json());
    const bodyData = asRecord(body.data);
    const url = new URL(request.url);
    const paymentId = String(
      url.searchParams.get("data.id") || bodyData.id || "",
    ).trim();
    const type = String(url.searchParams.get("type") || body.type || "");
    if (type !== "payment" || !/^\d+$/.test(paymentId)) {
      return new Response("ignored", { status: 200 });
    }

    const xSignature = request.headers.get("x-signature") || "";
    const xRequestId = request.headers.get("x-request-id") || "";
    const secret = Deno.env.get("MP_WEBHOOK_SECRET") || "";
    const valid = await verifyMercadoPagoSignature({
      xSignature,
      xRequestId,
      dataId: paymentId,
      secret,
    });
    if (!valid) return new Response("unauthorized", { status: 401 });

    const action = String(body.action || "payment.updated");
    eventKey = `${xRequestId}:${action}:${paymentId}`;
    const { data: previous } = await db.from("payment_events").select(
      "processed_at",
    ).eq("provider", "mercadopago").eq("event_key", eventKey).maybeSingle();
    if (previous?.processed_at) return new Response("ok", { status: 200 });

    await db.from("payment_events").upsert({
      provider: "mercadopago",
      event_key: eventKey,
      provider_event_id: String(body.id || "") || null,
      payment_id: paymentId,
      action,
      live_mode: typeof body.live_mode === "boolean" ? body.live_mode : null,
      payload: { type: "payment", action },
      processing_error: null,
    }, { onConflict: "provider,event_key" });

    const payment = await new MercadoPagoClient().getPayment(paymentId);
    const orderId = String(payment.external_reference || "").trim();
    const amount = Number(payment.transaction_amount);
    const currency = String(payment.currency_id || "");
    const collectorId = String(payment.collector_id || "");
    const expectedCollector = (Deno.env.get("MP_COLLECTOR_ID") || "").trim();
    if (!orderId || !Number.isFinite(amount) || currency !== "ARS") {
      throw new Error(
        "El pago no contiene una referencia, importe o moneda válidos.",
      );
    }
    if (expectedCollector && collectorId !== expectedCollector) {
      throw new Error("El pago pertenece a otra cuenta de cobro.");
    }

    const { data: stored, error: storedError } = await db.from("payments")
      .select("order_id,amount,currency,preference_id,status").eq(
        "order_id",
        orderId,
      )
      .maybeSingle();
    if (storedError || !stored) {
      throw new Error("No existe el intento de pago asociado.");
    }
    if (
      Math.abs(Number(stored.amount) - amount) > 0.009 ||
      stored.currency !== currency
    ) {
      throw new Error(
        "El importe informado por Mercado Pago no coincide con el pedido.",
      );
    }
    const providerPreference = String(payment.preference_id || "");
    if (
      stored.preference_id && providerPreference &&
      stored.preference_id !== providerPreference
    ) {
      throw new Error("La preferencia informada no coincide con el pedido.");
    }

    const incomingStatus = internalStatus(payment.status);
    const status = ["refunded", "charged_back"].includes(stored.status)
      ? stored.status
      : stored.status === "approved" &&
          !["refunded", "charged_back"].includes(incomingStatus)
      ? "approved"
      : incomingStatus;
    const liveMode = typeof payment.live_mode === "boolean"
      ? payment.live_mode
      : null;
    const now = new Date().toISOString();
    const { error: paymentError } = await db.from("payments").update({
      payment_id: paymentId,
      status,
      status_detail: String(payment.status_detail || "").slice(0, 120) || null,
      live_mode: liveMode,
      last_error: null,
      updated_at: now,
    }).eq("order_id", orderId);
    if (paymentError) throw paymentError;

    const orderUpdate: Record<string, unknown> = {
      payment_status: status,
      payment_reference: paymentId,
    };
    if (status === "approved") orderUpdate.status = "preparando";
    if (["refunded", "charged_back"].includes(status)) {
      orderUpdate.status = "cancelado";
    }
    const { error: orderError } = await db.from("orders").update(orderUpdate)
      .eq("id", orderId);
    if (orderError) throw orderError;

    EdgeRuntime.waitUntil(
      processPendingOrderNotifications(db, orderId, 10).catch(() => undefined),
    );

    await db.from("payment_events").update({
      processed_at: now,
      processing_error: null,
      live_mode: liveMode,
    }).eq("provider", "mercadopago").eq("event_key", eventKey);
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error
      ? error.message.slice(0, 300)
      : "Error desconocido";
    if (eventKey) {
      await db.from("payment_events").update({ processing_error: message })
        .eq("provider", "mercadopago").eq("event_key", eventKey);
    }
    const retryable = typeof (error as { retryable?: unknown })?.retryable ===
        "boolean"
      ? Boolean((error as { retryable?: unknown }).retryable)
      : /no respondió|respondió 5|timeout/i.test(message);
    return new Response(retryable ? "retry" : "ignored", {
      status: retryable ? 500 : 200,
    });
  }
});
