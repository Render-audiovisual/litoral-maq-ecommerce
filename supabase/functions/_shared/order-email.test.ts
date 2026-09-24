import { orderEmailStillApplies, type OrderRecord, renderOrderEmail } from "./order-email.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const STORE = "https://litoralmaq.com";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "LM-TEST-001",
    customer_name: "<b>Ana</b> Pérez",
    email: "ana@example.com",
    phone: null,
    lines: [{ productName: "Amoladora 115 mm", productId: "p1", quantity: 1, unitPrice: 50000 }],
    total: 50000,
    shipping: 0,
    delivery_method: "retiro",
    address: null,
    status: "pendiente",
    payment_status: "pending",
    shipping_tracking_number: null,
    shipping_carrier: null,
    ...overrides,
  };
}

function checkCommon(html: string) {
  assert(html.includes("LM-TEST-001"), "incluye el número de pedido");
  assert(html.includes("wa.me/"), "incluye el botón de WhatsApp");
  assert(html.includes(STORE), "incluye el link a la tienda");
  assert(html.includes("Amoladora 115 mm"), "incluye el detalle del pedido");
  assert(!html.includes("<b>Ana</b>"), "no inyecta HTML del nombre");
  assert(html.includes("&lt;b&gt;Ana&lt;/b&gt;"), "escapa el nombre");
}

Deno.test("recordatorio de pago a la hora", () => {
  const { subject, html } = renderOrderEmail(
    "customer_payment_reminder",
    order(),
    STORE,
  );
  assert(subject === "Tu pedido LM-TEST-001 te está esperando", subject);
  assert(html.includes("¡Tu pedido sigue reservado!"), "título");
  assert(html.includes("24 horas"), "menciona las 24 horas");
  assert(html.includes(`${STORE}/cuenta/pedidos`), "botón a mi pedido");
  checkCommon(html);
});

Deno.test("aviso de pedido vencido", () => {
  const { subject, html } = renderOrderEmail(
    "customer_order_expired",
    order({ status: "cancelado", payment_status: "cancelled" }),
    STORE,
  );
  assert(subject === "Tu pedido LM-TEST-001 venció", subject);
  assert(html.includes("Tu pedido venció"), "título");
  assert(!/reservad/i.test(html), "no promete reserva");
  assert(html.includes(`href="${STORE}/"`), "botón a la tienda");
  assert(html.includes("Volver a la tienda"), "texto del botón");
  assert(!html.includes("Pendiente de pago"), "no dice pendiente de pago");
  checkCommon(html);
});

function whatsappText(html: string) {
  const href = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1] || "";
  return new URL(href.replace(/&amp;/g, "&")).searchParams.get("text") || "";
}

Deno.test("WhatsApp de un pedido sin pago no da por hecho el pago", () => {
  const text = whatsappText(renderOrderEmail("customer_order_received", order(), STORE).html);
  assert(text.includes("Quiero coordinar el pago y la entrega, ¿me ayudan?"), text);
  assert(!text.includes("les llegó el pago"), text);
});

Deno.test("WhatsApp de un pedido pagado mantiene el cierre de siempre", () => {
  const text = whatsappText(
    renderOrderEmail("customer_payment_approved", order({ payment_status: "approved", status: "preparando" }), STORE).html,
  );
  assert(text.includes("¿Me avisan cuándo puedo pasar a retirarlo?"), text);
});

Deno.test("con Mercado Pago apagado los correos no lo mencionan", () => {
  for (const event of ["customer_order_received", "team_new_order", "customer_payment_reminder"] as const) {
    const { html } = renderOrderEmail(event, order(), STORE, {}, { mercadoPago: false });
    assert(!html.includes("Mercado Pago"), `${event} menciona Mercado Pago`);
  }
  const { html } = renderOrderEmail("customer_order_received", order(), STORE);
  assert(html.includes("Mercado Pago"), "por defecto (producción) sigue mencionando Mercado Pago");
});

Deno.test("un correo encolado se omite si ya no aplica al estado actual", () => {
  const pendiente = order();
  const pagado = order({ payment_status: "approved", status: "preparando" });
  const vencido = order({ status: "cancelado", payment_status: "cancelled" });
  assert(orderEmailStillApplies("customer_payment_reminder", pendiente), "recordatorio a pedido pendiente");
  assert(!orderEmailStillApplies("customer_payment_reminder", pagado), "recordatorio a pedido pagado");
  assert(!orderEmailStillApplies("customer_payment_reminder", vencido), "recordatorio a pedido vencido");
  assert(orderEmailStillApplies("customer_order_expired", vencido), "vencido a pedido cancelado");
  assert(!orderEmailStillApplies("customer_order_expired", pagado), "vencido a pedido que se pagó tarde");
  assert(
    !orderEmailStillApplies("customer_order_expired", order({ status: "cancelado", payment_status: "approved" })),
    "vencido a pedido cancelado con pago",
  );
  assert(orderEmailStillApplies("customer_payment_approved", pagado), "los demás eventos no cambian");
});
