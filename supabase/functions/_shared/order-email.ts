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
  /** Cómo pagó, desde la tabla `payments`. Solo existe con el pago acreditado. */
  payment?: PaymentDetail | null;
};

export type PaymentDetail = {
  installments?: number | null;
  installment_amount?: number | null;
  payment_type_id?: string | null;
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

// Espejo de src/lib/payment-summary.ts: las Edge Functions corren en Deno y no
// pueden importar del front. Si cambia el texto, cambiarlo en los dos lados.
const MEDIOS_DE_PAGO: Record<string, string> = {
  credit_card: "crédito",
  debit_card: "débito",
  prepaid_card: "tarjeta prepaga",
  ticket: "efectivo",
  bank_transfer: "transferencia",
  account_money: "dinero en cuenta",
};

function formatPaymentSummary(
  payment: PaymentDetail | null | undefined,
  total: number,
) {
  if (!payment) return "";
  const installments = Number(payment.installments);
  if (Number.isInteger(installments) && installments > 1) {
    // El importe de cuota de Mercado Pago ya trae el interés; el total dividido no.
    const cuota = typeof payment.installment_amount === "number"
      ? payment.installment_amount
      : total / installments;
    return `${installments} cuotas de ${money(cuota)}`;
  }
  const medio = payment.payment_type_id
    ? MEDIOS_DE_PAGO[payment.payment_type_id]
    : undefined;
  return medio ? `Mercado Pago (${medio})` : "Mercado Pago";
}

function money(value: unknown) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function orderLinesHtml(lines: OrderLine[], fotos: Record<string, string>) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = line.unitPrice == null ? null : Number(line.unitPrice);
    const price = unitPrice == null
      ? "A confirmar"
      : money(unitPrice * quantity);
    // La miniatura es opcional: si el producto todavía no tiene foto cargada,
    // la fila se muestra igual sin el recuadro.
    const foto = line.productId ? fotos[line.productId] : undefined;
    const thumb = foto
      ? `<td width="64" style="padding:12px 12px 12px 0;border-bottom:1px solid #e8edf3;vertical-align:top"><img src="${
        escapeHtml(foto)
      }" width="56" height="56" alt="" style="width:56px;height:56px;object-fit:contain;background:#f6f8fb;border-radius:8px;display:block"></td>`
      : "";
    return `<tr>${thumb}<td style="padding:12px 0;border-bottom:1px solid #e8edf3;vertical-align:top"><strong>${
      escapeHtml(
        line.productName || line.productCode || line.productId || "Producto",
      )
    }</strong><br><span style="color:#667085;font-size:12px">${quantity} unidad${
      quantity === 1 ? "" : "es"
    }${
      line.productCode ? ` · Cód. ${escapeHtml(line.productCode)}` : ""
    }</span></td><td style="padding:12px 0;border-bottom:1px solid #e8edf3;text-align:right;white-space:nowrap;vertical-align:top">${price}</td></tr>`;
  }).join("");
}

/** Subtotal y envío arriba del total: el cliente ve de dónde sale el número. */
function subtotalRowsHtml(order: OrderRecord) {
  const shipping = Number(order.shipping) || 0;
  const subtotal = Math.max(0, Number(order.total) - shipping);
  const fila = (etiqueta: string, valor: string) =>
    `<tr><td style="padding:10px 14px 0;color:#475467;font-size:13px">${etiqueta}</td><td style="padding:10px 14px 0;text-align:right;color:#475467;font-size:13px">${valor}</td></tr>`;
  return fila("Productos", money(subtotal)) +
    fila(
      "Envío",
      order.delivery_method === "retiro"
        ? "Retiro sin cargo"
        : shipping > 0
        ? money(shipping)
        : "A coordinar",
    );
}

/** Qué va a pasar ahora. Es lo que más consultan por WhatsApp después de pagar. */
function nextStepsHtml(eventType: OrderEmailEvent, order: OrderRecord) {
  const pasos = eventType === "customer_payment_approved"
    ? order.delivery_method === "retiro"
      ? [
        "Preparamos tu pedido y lo dejamos embalado.",
        "Te avisamos por correo cuando esté listo para retirar.",
        "Lo retirás en Sáenz 1587 con tu número de pedido.",
      ]
      : [
        "Preparamos tu pedido y lo embalamos.",
        "Coordinamos el despacho con el correo que llegue a tu destino.",
        "Te enviamos el número de seguimiento apenas se despacha.",
      ]
    : eventType === "customer_order_received"
    ? [
      "Revisamos disponibilidad y el total final.",
      "Te confirmamos por correo antes de cobrar.",
      "Recién ahí avanzamos con el pago.",
    ]
    : [];
  if (!pasos.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px"><tr><td style="padding:0 0 10px;font-weight:700;font-size:15px">Qué sigue</td></tr>${
    pasos.map((paso, i) =>
      `<tr><td style="padding:0 0 8px;color:#475467;font-size:14px;line-height:1.5"><strong style="color:#0b3c6f">${
        i + 1
      }.</strong> ${escapeHtml(paso)}</td></tr>`
    ).join("")
  }</table>`;
}

/** Cómo encontrarnos. Una compra grande sin un contacto visible da desconfianza. */
function contactHtml() {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:26px;border-top:1px solid #e8edf3"><tr><td style="padding:18px 0 0;color:#475467;font-size:13px;line-height:1.6"><strong style="color:#15253a">¿Alguna duda con tu pedido?</strong><br>WhatsApp: <a href="https://wa.me/5493794215065" style="color:#0b3c6f">+54 9 3794 21-5065</a><br>Local: <a href="https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8" style="color:#0b3c6f">Sáenz 1587, Corrientes</a><br>Horarios: Lun a Vie de 8 a 17 hs · Sáb de 8:30 a 12:30 hs</td></tr></table>`;
}

function paymentApprovedIntro(order: OrderRecord) {
  const nombre = String(order.customer_name || "").trim().split(/\s+/)[0];
  const saludo = nombre ? `${escapeHtml(nombre)}, gracias` : "Gracias";
  return order.delivery_method === "retiro"
    ? `${saludo} por elegirnos. Tu pago ya fue acreditado y el pedido quedó confirmado. Ahora lo preparamos y te avisamos apenas esté listo para retirar en Sáenz 1587.`
    : `${saludo} por elegirnos. Tu pago ya fue acreditado y el pedido quedó confirmado. Ahora lo preparamos y coordinamos el envío a tu domicilio.`;
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
      subject: `¡Gracias por tu compra! Pedido ${order.id} confirmado`,
      title: "¡Gracias por tu compra!",
      intro: paymentApprovedIntro(order),
      action: "Seguir mi pedido",
    },
    customer_payment_rejected: {
      subject: `No se pudo aprobar el pago · Pedido ${order.id}`,
      title: "El pago no fue aprobado",
      intro:
        "No se generó ningún cobro aprobado. Podés volver a intentar desde tu pedido o comunicarte con Litoral Maq.",
    },
    customer_order_ready: {
      subject: order.delivery_method === "retiro"
        ? `Tu pedido ${order.id} está listo para retirar`
        : `Tu pedido ${order.id} está preparado`,
      title: order.delivery_method === "retiro"
        ? "Ya podés retirar tu pedido"
        : "Tu pedido está listo",
      intro: order.delivery_method === "retiro"
        ? "Tu pedido está preparado y ya podés retirarlo en Sáenz 1587."
        : "El pedido quedó preparado y está listo para ser despachado.",
    },
    customer_order_shipped: {
      subject: `Tu pedido ${order.id} ya fue enviado`,
      title: "Tu pedido está en camino",
      intro: tracking,
    },
    customer_order_delivered: {
      subject: order.delivery_method === "retiro"
        ? `Pedido ${order.id} retirado`
        : `Pedido ${order.id} entregado`,
      title: order.delivery_method === "retiro"
        ? "Tu pedido fue retirado"
        : "Tu pedido fue entregado",
      intro: order.delivery_method === "retiro"
        ? "El pedido figura como retirado de la sucursal. Si necesitás ayuda, comunicate con Litoral Maq."
        : "El pedido figura como entregado. Si necesitás ayuda, comunicate con Litoral Maq.",
    },
  };
  return copies[eventType];
}

export function renderOrderEmail(
  eventType: OrderEmailEvent,
  order: OrderRecord,
  publicUrl: string,
  /** Foto por productId, en URL absoluta. Sin esto las filas van sin miniatura. */
  fotos: Record<string, string> = {},
) {
  const copy = emailCopy(eventType, order);
  const totalLabel = eventType === "customer_payment_approved"
    ? "Total pagado"
    : "Total registrado";
  const destination = order.delivery_method === "retiro"
    ? "Retiro en Sáenz 1587"
    : order.address || "Envío a coordinar";
  const buttonUrl = eventType === "team_new_order"
    ? `${publicUrl.replace(/\/$/, "")}/admin/pedidos`
    : `${publicUrl.replace(/\/$/, "")}/cuenta/pedidos`;
  const totalNote = eventType === "customer_payment_approved"
    ? "Pago acreditado por Mercado Pago."
    : "Sujeto a la confirmación operativa indicada en el pedido.";
  const paymentSummary = order.payment_status === "approved"
    ? formatPaymentSummary(order.payment, order.total)
    : "";

  return {
    subject: copy.subject,
    html:
      `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#15253a"><div style="display:none;max-height:0;overflow:hidden">${
        escapeHtml(copy.subject)
      }</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,37,58,.08)"><tr><td style="background:#0b3c6f;padding:24px 30px;color:#fff"><strong style="font-size:21px">Litoral Maq</strong><div style="margin-top:4px;color:#bfe7ff;font-size:13px">Pedido ${
        escapeHtml(order.id)
      }</div></td></tr><tr><td style="padding:30px"><h1 style="font-size:25px;margin:0 0 12px">${copy.title}</h1><p style="font-size:16px;line-height:1.55;margin:0 0 22px">${copy.intro}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${
        orderLinesHtml(order.lines, fotos)
      }</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#f6f8fb;border-radius:10px">${
        subtotalRowsHtml(order)
      }<tr><td style="padding:14px"><strong>${totalLabel}</strong><br><span style="color:#667085;font-size:12px">${totalNote}</span></td><td style="padding:14px;text-align:right;font-size:18px;font-weight:700">${
        money(order.total)
      }</td></tr><tr><td colspan="2" style="padding:0 14px 14px;color:#475467;font-size:13px"><strong>Entrega:</strong> ${
        escapeHtml(destination)
      }</td></tr>${
        paymentSummary
          ? `<tr><td colspan="2" style="padding:0 14px 14px;color:#475467;font-size:13px"><strong>Pago:</strong> ${
            escapeHtml(paymentSummary)
          }</td></tr>`
          : ""
      }</table>${nextStepsHtml(eventType, order)}<div style="text-align:center;margin-top:26px"><a href="${
        escapeHtml(buttonUrl)
      }" style="display:inline-block;background:#f58220;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">${
        copy.action || "Ver mi pedido"
      }</a></div>${
        eventType === "team_new_order" ? "" : contactHtml()
      }<p style="color:#667085;font-size:12px;line-height:1.5;margin:26px 0 0">Este correo fue generado automáticamente por Litoral Maq. No incluye datos de tarjeta ni solicita claves.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
