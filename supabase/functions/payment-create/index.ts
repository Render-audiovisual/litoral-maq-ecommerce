import { MercadoPagoClient } from "../_shared/payments/mercadopago.ts";
import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireUser,
  serviceClient,
} from "../_shared/http.ts";

type RequestedLine = { productId: string; quantity: number };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function parseLines(value: unknown): RequestedLine[] {
  if (!Array.isArray(value) || !value.length) {
    throw new HttpError(422, "El pedido no contiene productos válidos.");
  }
  const grouped = new Map<string, number>();
  value.forEach((raw) => {
    const item = asRecord(raw);
    const productId = String(item.productId || "").trim();
    const quantity = Number(item.quantity);
    if (
      !productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99
    ) {
      throw new HttpError(422, "El pedido contiene cantidades inválidas.");
    }
    const totalQuantity = (grouped.get(productId) || 0) + quantity;
    if (totalQuantity > 99) {
      throw new HttpError(422, "El pedido contiene cantidades inválidas.");
    }
    grouped.set(productId, totalQuantity);
  });
  return [...grouped.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  const db = serviceClient();
  try {
    const user = await requireUser(request, db);
    const body = asRecord(await request.json());
    const orderId = String(body.orderId || "").trim();
    if (!/^LM-\d{8}$/.test(orderId)) {
      throw new HttpError(422, "El pedido indicado no es válido.");
    }

    const { data: order, error: orderError } = await db.from("orders").select(
      "id,customer_id,email,lines,total,shipping,delivery_method,payment_status,shipping_quote_id,shipping_status",
    ).eq("id", orderId).maybeSingle();
    if (orderError || !order) {
      throw new HttpError(404, "No encontramos el pedido.");
    }
    if (order.customer_id !== user.id) {
      throw new HttpError(403, "El pedido no pertenece a tu sesión.");
    }
    if (order.payment_status === "approved") {
      throw new HttpError(409, "Este pedido ya figura pagado.");
    }
    if (["refunded", "charged_back"].includes(order.payment_status)) {
      throw new HttpError(
        409,
        "Este pedido no admite un nuevo pago automático.",
      );
    }

    const requestedLines = parseLines(order.lines);
    const productIds = [
      ...new Set(requestedLines.map((line) => line.productId)),
    ];
    const { data: products, error: productError } = await db.from("products")
      .select("id,code,name,price,stock,active,incomplete").in(
        "id",
        productIds,
      );
    if (productError || !products || products.length !== productIds.length) {
      throw new HttpError(409, "Uno o más productos ya no están disponibles.");
    }

    const byId = new Map(products.map((product) => [product.id, product]));
    const snapshot = requestedLines.map((line) => {
      const product = byId.get(line.productId);
      const price = Number(product?.price);
      if (!product?.active || !Number.isFinite(price) || price <= 0) {
        throw new HttpError(
          409,
          "Uno o más productos no tienen un precio vigente.",
        );
      }
      if (
        Array.isArray(product.incomplete) &&
        product.incomplete.includes("stock")
      ) {
        throw new HttpError(
          409,
          `El stock de ${product.name} todavía no fue verificado por Litoral. Confirmalo antes de cobrar.`,
        );
      }
      if (Number(product.stock) < line.quantity) {
        throw new HttpError(409, `No hay stock suficiente de ${product.name}.`);
      }
      return {
        productId: product.id,
        quantity: line.quantity,
        productName: product.name,
        productCode: product.code,
        unitPrice: Number(price.toFixed(2)),
      };
    });
    const subtotal = snapshot.reduce(
      (sum, line) => sum + Number(line.unitPrice) * line.quantity,
      0,
    );

    let shippingAmount = 0;
    if (order.delivery_method === "envio") {
      if (
        !order.shipping_quote_id || order.shipping_status === "manual_quote"
      ) {
        throw new HttpError(
          409,
          "El envío todavía necesita una cotización confirmada antes de pagar.",
        );
      }
      const { data: quote, error: quoteError } = await db.from(
        "shipping_quotes",
      )
        .select("customer_id,amount,expires_at").eq(
          "id",
          order.shipping_quote_id,
        )
        .maybeSingle();
      if (
        quoteError || !quote || quote.customer_id !== user.id ||
        new Date(quote.expires_at).getTime() <= Date.now()
      ) {
        throw new HttpError(409, "La tarifa de envío venció. Volvé a cotizar.");
      }
      shippingAmount = Number(quote.amount);
      if (!Number.isFinite(shippingAmount) || shippingAmount < 0) {
        throw new HttpError(409, "La tarifa de envío no es válida.");
      }
    }
    const total = Number((subtotal + shippingAmount).toFixed(2));

    const { data: existing, error: existingError } = await db.from("payments")
      .select("preference_id,checkout_url,amount,status").eq(
        "order_id",
        orderId,
      )
      .maybeSingle();
    if (existingError) {
      throw new HttpError(503, "No pudimos revisar el pago pendiente.");
    }
    if (
      existing?.preference_id && existing.checkout_url &&
      Number(existing.amount) === total && existing.status === "pending"
    ) {
      return json(request, {
        preferenceId: existing.preference_id,
        checkoutUrl: existing.checkout_url,
        reused: true,
      });
    }

    const now = new Date().toISOString();
    const { error: reserveError } = await db.from("payments").upsert({
      order_id: orderId,
      provider: "mercadopago",
      external_reference: orderId,
      amount: total,
      currency: "ARS",
      status: "pending",
      last_error: null,
      updated_at: now,
    }, { onConflict: "order_id" });
    if (reserveError) throw new HttpError(503, "No pudimos preparar el pago.");

    const { error: orderUpdateError } = await db.from("orders").update({
      lines: snapshot,
      total,
      shipping: shippingAmount,
      payment_status: "pending",
      payment_reference: "Mercado Pago pendiente",
    }).eq("id", orderId).eq("customer_id", user.id);
    if (orderUpdateError) {
      throw new HttpError(503, "No pudimos confirmar el total del pedido.");
    }

    const preference = await new MercadoPagoClient().createPreference({
      orderId,
      payerEmail: order.email,
      items: snapshot.map((line) => ({
        id: line.productId,
        title: line.productName,
        description: line.productCode || undefined,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      shippingAmount,
    });
    const { error: paymentUpdateError } = await db.from("payments").update({
      preference_id: preference.id,
      checkout_url: preference.initPoint,
      updated_at: new Date().toISOString(),
    }).eq("order_id", orderId);
    if (paymentUpdateError) {
      throw new HttpError(
        503,
        "Mercado Pago preparó el checkout, pero no pudimos guardarlo. Reintentá.",
      );
    }
    return json(request, {
      preferenceId: preference.id,
      checkoutUrl: preference.initPoint,
      reused: false,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
