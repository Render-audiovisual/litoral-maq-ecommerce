import { MercadoPagoClient } from "../_shared/payments/mercadopago.ts";
import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireUser,
  serviceClient,
} from "../_shared/http.ts";
import { logEdgeError } from "../_shared/monitoring.ts";

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
    // Kill switch del checkout público. Estaba desplegado en producción pero no
    // en el repo: cualquier deploy desde el repo lo borraba y encendía el cobro.
    // Se apaga o prende con la variable MP_CHECKOUT_ENABLED, sin redeploy.
    if (Deno.env.get("MP_CHECKOUT_ENABLED") !== "true") {
      throw new HttpError(
        503,
        "Mercado Pago está pausado temporalmente mientras actualizamos el stock.",
      );
    }
    const user = await requireUser(request, db);
    const body = asRecord(await request.json());
    const orderId = String(body.orderId || "").trim();
    if (!/^LM-\d{8}$/.test(orderId)) {
      throw new HttpError(422, "El pedido indicado no es válido.");
    }

    const { data: order, error: orderError } = await db.from("orders").select(
      "id,customer_id,customer_name,email,dni,phone,street,street_number,postal_code,lines,total,shipping,delivery_method,status,expires_at,payment_status,shipping_quote_id,shipping_status",
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
    // Un pedido vencido o cancelado no se puede pagar: el ciclo de vida ya
    // liberó la reserva y le avisó al cliente que no se le cobró nada.
    if (
      order.status === "cancelado" ||
      (order.expires_at && new Date(order.expires_at).getTime() <= Date.now())
    ) {
      throw new HttpError(
        409,
        "Este pedido venció. Hacé un pedido nuevo o escribinos por WhatsApp y te ayudamos.",
      );
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
      .select(
        "id,code,name,price,stock,active,incomplete,source,purchase_limit,image",
      ).in(
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
      const purchaseLimit = Number(product.purchase_limit) || 3;
      if (line.quantity > purchaseLimit) {
        throw new HttpError(
          409,
          `Podés comprar hasta ${purchaseLimit} unidades de ${product.name} por pedido.`,
        );
      }
      const sheetManaged = product.source === "google-sheet" &&
        Array.isArray(product.incomplete) &&
        !product.incomplete.includes("sheet-absent");
      if (
        Array.isArray(product.incomplete) &&
        product.incomplete.includes("stock") &&
        !sheetManaged
      ) {
        throw new HttpError(
          409,
          `El stock de ${product.name} todavía no fue verificado por Litoral. Confirmalo antes de cobrar.`,
        );
      }
      if (!sheetManaged && Number(product.stock) < line.quantity) {
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
    // Envío a coordinar (sin cotización automática, por ejemplo a otra provincia):
    // se cobran solo los productos y el envío se arregla aparte con el cliente.
    const envioACoordinar = order.delivery_method === "envio" &&
      (!order.shipping_quote_id || order.shipping_status === "manual_quote");
    if (order.delivery_method === "envio" && !envioACoordinar) {
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

    // La foto se guarda como ruta ("/products/..."): Mercado Pago necesita la
    // URL completa para poder mostrarla en su pantalla de pago.
    const storeUrl = (Deno.env.get("STORE_PUBLIC_URL") ||
      "https://litoralmaq.com").replace(/\/$/, "");
    const fotoDe = (productId: string) => {
      const image = byId.get(productId)?.image;
      if (typeof image !== "string" || !image) return undefined;
      return /^https?:\/\//.test(image) ? image : `${storeUrl}${image}`;
    };
    const [nombre, ...apellido] = String(order.customer_name || "").trim()
      .split(/\s+/);
    const preference = await new MercadoPagoClient().createPreference({
      orderId,
      payerEmail: order.email,
      items: snapshot.map((line) => ({
        id: line.productId,
        title: line.productName,
        description: line.productCode || undefined,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        pictureUrl: fotoDe(line.productId),
      })),
      shippingAmount,
      expiresAt: order.expires_at,
      payer: {
        email: order.email,
        name: nombre || undefined,
        surname: apellido.join(" ") || undefined,
        dni: order.dni || undefined,
        phone: order.phone || undefined,
        street: order.street || undefined,
        streetNumber: order.street_number || undefined,
        postalCode: order.postal_code || undefined,
      },
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
    // Los 4xx son respuestas esperadas al cliente; se loguea lo inesperado.
    if (!(error instanceof HttpError && error.status < 500)) {
      logEdgeError("payment-create", error);
    }
    return errorResponse(request, error);
  }
});
