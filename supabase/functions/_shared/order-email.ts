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
  payment_installments?: number | null;
  payment_installment_amount?: number | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  shipping_tracking_number: string | null;
  shipping_carrier: string | null;
  shipping_quote_id?: string | null;
  shipping_status?: string | null;
};

/**
 * Envío a coordinar: el cliente pagó los productos y el envío se arregla aparte
 * (no hubo cotización automática, por ejemplo a otra provincia). Espejo de
 * isShippingToCoordinate en src/lib/order-details.ts.
 */
function envioACoordinar(order: OrderRecord) {
  return order.delivery_method === "envio" &&
    (!order.shipping_quote_id || order.shipping_status === "manual_quote");
}

function empresaEnvio(order: OrderRecord) {
  return order.shipping_carrier ? ` por ${escapeHtml(order.shipping_carrier)}` : "";
}

export type OrderEmailEvent =
  | "customer_order_received"
  | "team_new_order"
  | "customer_payment_approved"
  | "customer_payment_rejected"
  | "customer_order_ready"
  | "customer_order_shipped"
  | "customer_order_delivered"
  | "customer_payment_reminder"
  | "customer_order_expired";

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

function orderLinesHtml(lines: OrderLine[], fotos: Record<string, string>) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = line.unitPrice == null ? null : Number(line.unitPrice);
    const price = unitPrice == null
      ? "A confirmar"
      : money(unitPrice * quantity);
    // La miniatura es opcional: si el producto no tiene foto cargada, la fila
    // se muestra igual sin el recuadro.
    const foto = line.productId ? fotos[line.productId] : undefined;
    const thumb = foto
      ? `<td width="64" style="padding:12px 12px 12px 0;border-bottom:1px solid #e8edf3;vertical-align:top"><img src="${
        escapeHtml(foto)
      }" width="56" height="56" alt="" style="width:56px;height:56px;object-fit:contain;background:#f6f8fb;border-radius:8px;display:block"></td>`
      : "";
    return `<tr>${thumb}<td style="padding:10px 0;border-bottom:1px solid #e8edf3;vertical-align:top"><strong>${
      escapeHtml(
        line.productName || line.productCode || line.productId || "Producto",
      )
    }</strong><br><span style="color:#667085;font-size:12px">${quantity} unidad${
      quantity === 1 ? "" : "es"
    }${
      line.productCode ? ` · Cód. ${escapeHtml(line.productCode)}` : ""
    }</span></td><td style="padding:10px 0;border-bottom:1px solid #e8edf3;text-align:right;white-space:nowrap;vertical-align:top">${price}</td></tr>`;
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
        : envioACoordinar(order)
        ? `${order.shipping_carrier ? `${escapeHtml(order.shipping_carrier)} · ` : ""}a cotizar (se abona aparte)`
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
      : envioACoordinar(order)
      ? [
        "Mandanos el mensaje ya armado por WhatsApp (botón verde de abajo).",
        `Te respondemos con el costo del envío${
          order.shipping_carrier ? ` por ${order.shipping_carrier}` : ""
        }.`,
        "Despachamos tu pedido y te enviamos el número de seguimiento.",
      ]
      : [
        "Preparamos tu pedido y lo embalamos.",
        "Coordinamos el despacho con el correo que llegue a tu destino.",
        "Te enviamos el número de seguimiento apenas se despacha.",
      ]
    : eventType === "customer_order_received"
    ? [
      "Completás el pago en Mercado Pago.",
      "Apenas se acredita te llega la confirmación de compra.",
      order.delivery_method === "retiro"
        ? "Preparamos tu pedido para retirar en Sáenz 1587."
        : "Preparamos tu pedido para el envío.",
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

/** Dónde encontrarnos. El botón de WhatsApp ya está arriba; esto suma local y horarios. */
function localHtml() {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border-top:1px solid #e8edf3"><tr><td style="padding:16px 0 0;color:#475467;font-size:13px;line-height:1.6"><strong style="color:#15253a">Litoral Maq</strong><br>Local: <a href="https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8" style="color:#0b3c6f">Sáenz 1587, Corrientes</a><br>Horarios: Lun a Vie de 8 a 17 hs · Sáb de 8:30 a 12:30 hs</td></tr></table>`;
}

function paymentApprovedIntro(order: OrderRecord) {
  const nombre = String(order.customer_name || "").trim().split(/\s+/)[0];
  const saludo = nombre ? `${escapeHtml(nombre)}, gracias` : "Gracias";
  if (order.delivery_method === "retiro") {
    return `${saludo} por elegirnos. Tu pago ya fue acreditado y el pedido quedó confirmado para retirar en el local. Lo preparamos y te avisamos apenas puedas pasar por Sáenz 1587.`;
  }
  if (envioACoordinar(order)) {
    return `${saludo} por elegirnos. Tu pago de los productos ya fue acreditado. Elegiste el envío${
      empresaEnvio(order)
    }: escribinos por WhatsApp con el mensaje ya armado y te pasamos el costo del envío, que se abona aparte.`;
  }
  return `${saludo} por elegirnos. Tu pago ya fue acreditado y el pedido quedó confirmado. Lo preparamos y te enviamos el seguimiento cuando se despache.`;
}

function paymentMethodLabel(methodId: string | null | undefined) {
  const labels: Record<string, string> = {
    visa: "Visa",
    master: "Mastercard",
    amex: "American Express",
    naranja: "Naranja X",
    cabal: "Cabal",
    debvisa: "Visa Débito",
    debmaster: "Mastercard Débito",
    account_money: "Dinero disponible en Mercado Pago",
  };
  const value = String(methodId || "").trim().toLowerCase();
  return labels[value] || (value ? value.replace(/_/g, " ") : "Mercado Pago");
}

function paymentSummary(order: OrderRecord) {
  if (order.payment_status !== "approved") return "";
  const installments = Number(order.payment_installments);
  const amount = Number(order.payment_installment_amount);
  const method = paymentMethodLabel(order.payment_method_id);
  const detail = Number.isInteger(installments) && installments > 1
    ? `${installments} cuotas${Number.isFinite(amount) && amount > 0 ? ` de ${money(amount)}` : ""}`
    : "1 pago";
  return `<tr><td colspan="2" style="padding:0 14px 14px;color:#475467;font-size:13px"><strong>Pago:</strong> ${escapeHtml(method)} · ${escapeHtml(detail)}</td></tr>`;
}

function whatsappUrl(order: OrderRecord) {
  const number = "5493794215065";
  const products = (Array.isArray(order.lines) ? order.lines : []).map((line) =>
    `${Number(line.quantity) || 0}× ${line.productName || line.productCode || line.productId || "Producto"}`
  ).join(", ");
  const installments = Number(order.payment_installments);
  const amount = Number(order.payment_installment_amount);
  const payment = order.payment_status === "approved"
    ? ` Pago confirmado con ${paymentMethodLabel(order.payment_method_id)}: ${
      Number.isInteger(installments) && installments > 1
        ? `${installments} cuotas${Number.isFinite(amount) && amount > 0 ? ` de ${money(amount)}` : ""}`
        : "1 pago"
    }.`
    : "";
  const pagado = order.payment_status === "approved";
  const coordinar = envioACoordinar(order);
  const hacia = order.address ? ` a ${order.address}` : "";
  const entrega = order.delivery_method === "retiro"
    ? "Elegí retiro en el local de Sáenz 1587."
    : coordinar
    ? `Elegí el envío por ${order.shipping_carrier || "la empresa que me recomienden"}${hacia}.`
    : `Elegí el envío por ${order.shipping_carrier || "correo"}${hacia}.`;
  const cierre = order.payment_status === "cancelled"
    ? "Se me venció el pedido y quiero retomar la compra."
    : !pagado
    ? "Quiero confirmar que les llegó el pago."
    : order.delivery_method === "retiro"
    ? "¿Me avisan cuándo puedo pasar a retirarlo?"
    : coordinar
    ? "Quedo a la espera del costo del envío."
    : "Quedo atento al número de seguimiento.";
  const shipping = Number(order.shipping) || 0;
  const message = [
    `Hola, buenas.${order.customer_name ? ` Soy ${order.customer_name}.` : ""}`,
    `${pagado ? "Hice la compra" : "Hice el pedido"} ${order.id} desde la web.`,
    `Productos: ${products}.`,
    `${pagado ? "Total pagado" : "Total"}${coordinar ? " (productos)" : ""}: ${
      money(coordinar ? Math.max(0, Number(order.total) - shipping) : order.total)
    }.`,
    payment.trim(),
    entrega,
    cierre,
  ].filter(Boolean).join("\n");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
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
      title: "Recibimos tu pedido",
      intro:
        "Registramos tu pedido. Cuando Mercado Pago acredite el pago te enviamos la confirmación de compra. Si no llegaste a terminar el pago, escribinos y te ayudamos.",
    },
    team_new_order: {
      subject: `Nuevo pedido ${order.id} · ${order.customer_name}`,
      title: "Entró un nuevo pedido",
      intro: envioACoordinar(order)
        ? `${escapeHtml(order.customer_name)} hizo un pedido con envío${
          empresaEnvio(order)
        }. Cuando se acredite el pago, pasale el costo del envío por WhatsApp.`
        : `${escapeHtml(order.customer_name)} hizo un pedido. Se confirma cuando Mercado Pago acredite el pago.`,
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
    customer_payment_reminder: {
      subject: `Tu pedido ${order.id} te está esperando`,
      title: "¡Tu pedido sigue reservado!",
      intro:
        "Vimos que el pago todavía no se acreditó. Te guardamos los productos durante 24 horas desde que hiciste el pedido, así que estás a tiempo. Si algo falló con el pago o necesitás ayuda para elegir, escribinos por WhatsApp y te ayudamos personalmente.",
    },
    customer_order_expired: {
      subject: `Tu pedido ${order.id} venció`,
      title: "Tu pedido venció",
      intro:
        "Pasaron 24 horas sin que se acreditara el pago, así que cancelamos el pedido para liberar el stock. No se te cobró nada. Si todavía querés los productos, podés hacer un pedido nuevo en la tienda o escribirnos por WhatsApp y te ayudamos a cerrar la compra.",
      action: "Volver a la tienda",
    },
  };
  return copies[eventType];
}

function emailVisual(eventType: OrderEmailEvent) {
  const visuals: Record<OrderEmailEvent, { emoji: string; label: string; color: string; soft: string }> = {
    customer_order_received: { emoji: "🧾", label: "PEDIDO RECIBIDO", color: "#0b3c6f", soft: "#eaf4fb" },
    team_new_order: { emoji: "📦", label: "NUEVO PEDIDO", color: "#0b3c6f", soft: "#eaf4fb" },
    customer_payment_approved: { emoji: "✅", label: "PAGO CONFIRMADO", color: "#18794e", soft: "#eaf8f1" },
    customer_payment_rejected: { emoji: "⚠️", label: "PAGO NO APROBADO", color: "#b54708", soft: "#fff4e8" },
    customer_order_ready: { emoji: "🛠️", label: "PEDIDO PREPARADO", color: "#0b3c6f", soft: "#eaf4fb" },
    customer_order_shipped: { emoji: "🚚", label: "PEDIDO EN CAMINO", color: "#0b3c6f", soft: "#eaf4fb" },
    customer_order_delivered: { emoji: "🙌", label: "PEDIDO ENTREGADO", color: "#18794e", soft: "#eaf8f1" },
    customer_payment_reminder: { emoji: "⏳", label: "PAGO PENDIENTE", color: "#b54708", soft: "#fff4e8" },
    customer_order_expired: { emoji: "🕓", label: "PEDIDO VENCIDO", color: "#667085", soft: "#f2f4f7" },
  };
  return visuals[eventType];
}

function firstName(order: OrderRecord) {
  return String(order.customer_name || "").trim().split(/\s+/)[0] || "";
}

export function renderOrderEmail(
  eventType: OrderEmailEvent,
  order: OrderRecord,
  publicUrl: string,
  /** Foto por productId, en URL absoluta. Sin esto las filas van sin miniatura. */
  fotos: Record<string, string> = {},
) {
  const copy = emailCopy(eventType, order);
  const visual = emailVisual(eventType);
  const customerGreeting = eventType === "team_new_order"
    ? ""
    : `<p style="font-size:15px;line-height:1.5;margin:0 0 8px;color:#475467">${
      firstName(order) ? `Hola, ${escapeHtml(firstName(order))} 👋` : "¡Hola! 👋"
    }</p>`;
  const pagado = order.payment_status === "approved";
  const totalLabel = pagado ? "Total pagado" : "Total";
  const destination = order.delivery_method === "retiro"
    ? "Retiro en el local de Sáenz 1587"
    : `Envío${order.shipping_carrier ? ` por ${order.shipping_carrier}` : ""}${
      order.address ? ` a ${order.address}` : ""
    }`;
  const buttonUrl = eventType === "team_new_order"
    ? `${publicUrl.replace(/\/$/, "")}/admin/pedidos`
    : eventType === "customer_order_expired"
    ? `${publicUrl.replace(/\/$/, "")}/`
    : `${publicUrl.replace(/\/$/, "")}/cuenta/pedidos`;
  const customerWhatsAppButton = eventType === "team_new_order"
    ? ""
    : `<div style="text-align:center;margin-top:12px"><a href="${escapeHtml(whatsappUrl(order))}" style="display:inline-block;background:#1fa855;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">Hablar con Litoral Maq por WhatsApp</a></div>`;
  const totalNote = pagado
    ? "Pago acreditado por Mercado Pago."
    : order.payment_status === "cancelled"
    ? "Pedido cancelado, sin cobro."
    : "Pendiente de pago en Mercado Pago.";

  return {
    subject: copy.subject,
    html:
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:640px){.email-shell{border-radius:0!important}.email-pad{padding:24px 18px!important}.email-title{font-size:24px!important}.email-button{display:block!important;text-align:center!important}}</style></head><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#15253a"><div style="display:none;max-height:0;overflow:hidden">${
        escapeHtml(copy.subject)
      } · Te contamos claramente qué sigue.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table class="email-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,37,58,.08)"><tr><td style="background:#0b3c6f;padding:24px 30px;color:#fff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><strong style="font-size:22px;letter-spacing:-.3px">litoral <span style="font-size:12px;font-weight:400">maq</span></strong><div style="margin-top:5px;color:#bfe7ff;font-size:13px">Herramientas para hacer realidad tus proyectos</div></td><td align="right" style="font-size:12px;color:#d9efff">Pedido<br><strong style="font-size:14px;color:#fff">${
        escapeHtml(order.id)
      }</strong></td></tr></table></td></tr><tr><td class="email-pad" style="padding:30px"><div style="display:inline-block;background:${visual.soft};color:${visual.color};font-size:11px;font-weight:700;letter-spacing:.7px;padding:7px 10px;border-radius:999px">${visual.emoji} ${visual.label}</div><div style="height:18px"></div>${customerGreeting}<h1 class="email-title" style="font-size:27px;line-height:1.2;margin:0 0 12px;letter-spacing:-.4px">${copy.title}</h1><p style="font-size:16px;line-height:1.6;margin:0 0 24px;color:#344054">${copy.intro}</p><div style="font-size:13px;font-weight:700;color:#667085;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px">Detalle de tu pedido</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${
        orderLinesHtml(order.lines, fotos)
      }</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#f6f8fb;border-radius:10px">${
        subtotalRowsHtml(order)
      }<tr><td style="padding:14px"><strong>${totalLabel}</strong><br><span style="color:#667085;font-size:12px">${totalNote}</span></td><td style="padding:14px;text-align:right;font-size:18px;font-weight:700">${
        money(order.total)
      }</td></tr><tr><td colspan="2" style="padding:0 14px 14px;color:#475467;font-size:13px"><strong>Entrega:</strong> ${
        escapeHtml(destination)
      }</td></tr>${paymentSummary(order)}</table>${
        nextStepsHtml(eventType, order)
      }<div style="text-align:center;margin-top:26px"><a href="${
        escapeHtml(buttonUrl)
      }" class="email-button" style="display:inline-block;background:#f58220;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:9px">${
        copy.action || "Ver mi pedido"
      }</a></div>${customerWhatsAppButton}${
        eventType === "team_new_order" ? "" : localHtml()
      }<p style="color:#667085;font-size:12px;line-height:1.5;margin:26px 0 0">¿Tenés alguna duda? Respondé por WhatsApp y te ayudamos. Este correo fue generado automáticamente por Litoral Maq; nunca te vamos a pedir claves ni datos completos de tu tarjeta.</p><p style="color:#98a2b3;font-size:11px;line-height:1.5;margin:14px 0 0;text-align:center">Gracias por elegir Litoral Maq 💙</p></td></tr></table></td></tr></table></body></html>`,
  };
}
