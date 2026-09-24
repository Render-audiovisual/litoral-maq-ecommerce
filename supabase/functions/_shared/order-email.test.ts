import { type OrderRecord, renderOrderEmail } from "./order-email.ts";

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
