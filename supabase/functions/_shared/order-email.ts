export type OrderLine = {
  productName?: string;
  productCode?: string | null;
  productId?: string;
  quantity?: number;
  unitPrice?: number | null;
};

export type OrderRecord = {
  id: string;
  customer_name: string;
  email: string;
  phone: string | null;
  lines: OrderLine[];
  total: number;
  shipping: number;
  delivery_method: "envio" | "retiro";
  address: string | null;
  status: string;
  payment_status: string;
  shipping_tracking_number: string | null;
  shipping_carrier: string | null;
};

export type OrderEmailEvent =
  | "customer_order_received"
  | "team_new_order"
  | "customer_payment_approved"
  | "customer_payment_rejected"
  | "customer_order_ready"
  | "customer_order_shipped"
  | "customer_order_delivered";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: unknown) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function orderLinesHtml(lines: OrderLine[]) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = line.unitPrice == null ? null : Number(line.unitPrice);
    const price = unitPrice == null
      ? "A confirmar"
      : money(unitPrice * quantity);
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e8edf3"><strong>${
      escapeHtml(
        line.productName || line.productCode || line.productId || "Producto",
      )
    }</strong><br><span style="color:#667085;font-size:12px">${quantity} unidad${
      quantity === 1 ? "" : "es"
    }${
      line.productCode ? ` · Cód. ${escapeHtml(line.productCode)}` : ""
    }</span></td><td style="padding:10px 0;border-bottom:1px solid #e8edf3;text-align:right;white-space:nowrap">${price}</td></tr>`;
  }).join("");
}

function paymentApprovedIntro(order: OrderRecord) {
  return order.delivery_method === "retiro"
    ? "El pago fue acreditado correctamente. Te avisaremos cuando el pedido esté listo para retirar en Sáenz 1587."
    : "El pago fue acreditado correctamente. Ahora vamos a evaluar el correo disponible para tu destino y te confirmaremos el despacho.";
}

function emailCopy(eventType: OrderEmailEvent, order: OrderRecord) {
  const tracking = order.shipping_tracking_number
    ? `Seguimiento: <strong>${escapeHtml(order.shipping_tracking_number)}</strong>${
      order.shipping_carrier ? ` · ${escapeHtml(order.shipping_carrier)}` : ""
    }.`
    : "Te avisaremos el seguimiento apenas esté disponible.";
  const copies: Record<
    OrderEmailEvent,
    { subject: string; title: string; intro: string; action?: string }
  > = {
    customer_order_received: {
      subject: `Recibimos tu pedido ${order.id}`,
      title: "Recibimos tu solicitud",
      intro:
        "El equipo de Litoral Maq va a verificar disponibilidad, entrega y total final antes de avanzar con el cobro.",
    },
    team_new_order: {
      subject: `Nuevo pedido ${order.id} · ${order.customer_name}`,
      title: "Entró un nuevo pedido",
      intro: `${escapeHtml(order.customer_name)} envió una solicitud que necesita revisión operativa.`,
      action: "Abrir panel de pedidos",
    },
    customer_payment_approved: {
      subject: `Pago confirmado · Pedido ${order.id}`,
      title: "Pago confirmado",
      intro: paymentApprovedIntro(order),
    },
    customer_payment_rejected: {
      subject: `No se pudo aprobar el pago · Pedido ${order.id}`,
      title: "El pago no fue aprobado",
      intro:
        "No se generó ningún cobro aprobado. Podés volver a intentar desde tu pedido o comunicarte con Litoral Maq.",
    },
    customer_order_ready: {
      subject: `Tu pedido ${order.id} está preparado`,
      title: "Tu pedido está listo",
      intro: order.delivery_method === "retiro"
        ? "Ya podés coordinar el retiro en Sáenz 1587."
        : "El pedido quedó preparado y está listo para ser despachado.",
    },
    customer_order_shipped: {
      subject: `Tu pedido ${order.id} ya fue enviado`,
      title: "Tu pedido está en camino",
      intro: tracking,
    },
    customer_order_delivered: {
      subject: `Pedido ${order.id} entregado`,
      title: "Tu pedido fue entregado",
      intro:
        "El pedido figura como entregado. Si necesitás ayuda, comunicate con Litoral Maq.",
    },
  };
  return copies[eventType];
}

export function renderOrderEmail(
  eventType: OrderEmailEvent,
  order: OrderRecord,
  publicUrl: string,
) {
  const copy = emailCopy(eventType, order);
  const destination = order.delivery_method === "retiro"
    ? "Retiro en Sáenz 1587"
    : order.address || "Envío a coordinar";
  const buttonUrl = eventType === "team_new_order"
    ? `${publicUrl.replace(/\/$/, "")}/admin/pedidos`
    : `${publicUrl.replace(/\/$/, "")}/cuenta/pedidos`;
  const totalNote = eventType === "customer_payment_approved"
    ? "Pago acreditado por Mercado Pago."
    : "Sujeto a la confirmación operativa indicada en el pedido.";

  return {
    subject: copy.subject,
    html:
      `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#15253a"><div style="display:none;max-height:0;overflow:hidden">${
        escapeHtml(copy.subject)
      }</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,37,58,.08)"><tr><td style="background:#0b3c6f;padding:24px 30px;color:#fff"><strong style="font-size:21px">Litoral Maq</strong><div style="margin-top:4px;color:#bfe7ff;font-size:13px">Pedido ${
        escapeHtml(order.id)
      }</div></td></tr><tr><td style="padding:30px"><h1 style="font-size:25px;margin:0 0 12px">${copy.title}</h1><p style="font-size:16px;line-height:1.55;margin:0 0 22px">${copy.intro}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${
        orderLinesHtml(order.lines)
      }</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#f6f8fb;border-radius:10px"><tr><td style="padding:14px"><strong>Total registrado</strong><br><span style="color:#667085;font-size:12px">${totalNote}</span></td><td style="padding:14px;text-align:right;font-size:18px;font-weight:700">${
        money(order.total)
      }</td></tr><tr><td colspan="2" style="padding:0 14px 14px;color:#475467;font-size:13px"><strong>Entrega:</strong> ${
        escapeHtml(destination)
      }</td></tr></table><div style="text-align:center;margin-top:26px"><a href="${
        escapeHtml(buttonUrl)
      }" style="display:inline-block;background:#f58220;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">${
        copy.action || "Ver mi pedido"
      }</a></div><p style="color:#667085;font-size:12px;line-height:1.5;margin:26px 0 0">Este correo fue generado automáticamente por Litoral Maq. No incluye datos de tarjeta ni solicita claves.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
