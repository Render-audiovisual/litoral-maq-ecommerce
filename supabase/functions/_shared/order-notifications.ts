import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";

type OutboxEvent = {
  id: string;
  order_id: string;
  event_type: string;
  event_key: string;
  attempts: number;
};

type OrderLine = {
  productName?: string;
  productCode?: string | null;
  productId?: string;
  quantity?: number;
  unitPrice?: number | null;
};

type OrderRecord = {
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

function emailCopy(eventType: string, order: OrderRecord) {
  const tracking = order.shipping_tracking_number
    ? `Seguimiento: <strong>${
      escapeHtml(order.shipping_tracking_number)
    }</strong>${
      order.shipping_carrier ? ` · ${escapeHtml(order.shipping_carrier)}` : ""
    }.`
    : "Te avisaremos el seguimiento apenas esté disponible.";
  const copies: Record<
    string,
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
      intro: `${
        escapeHtml(order.customer_name)
      } envió una solicitud que necesita revisión operativa.`,
      action: "Abrir panel de pedidos",
    },
    customer_payment_approved: {
      subject: `Pago confirmado · Pedido ${order.id}`,
      title: "Pago confirmado",
      intro:
        "El pago fue acreditado correctamente y el equipo ya puede preparar tu pedido.",
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
  return copies[eventType] || copies.customer_order_received;
}

function renderEmail(eventType: string, order: OrderRecord, storeUrl: string) {
  const copy = emailCopy(eventType, order);
  const destination = order.delivery_method === "retiro"
    ? "Retiro en Sáenz 1587"
    : order.address || "Envío a coordinar";
  const buttonUrl = eventType === "team_new_order"
    ? `${storeUrl.replace(/\/$/, "")}/admin/pedidos`
    : `${storeUrl.replace(/\/$/, "")}/cuenta/pedidos`;
  return {
    subject: copy.subject,
    html:
      `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#15253a"><div style="display:none;max-height:0;overflow:hidden">${
        escapeHtml(copy.subject)
      }</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,37,58,.08)"><tr><td style="background:#0b3c6f;padding:24px 30px;color:#fff"><strong style="font-size:21px">Litoral Maq</strong><div style="margin-top:4px;color:#bfe7ff;font-size:13px">Pedido ${
        escapeHtml(order.id)
      }</div></td></tr><tr><td style="padding:30px"><h1 style="font-size:25px;margin:0 0 12px">${copy.title}</h1><p style="font-size:16px;line-height:1.55;margin:0 0 22px">${copy.intro}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${
        orderLinesHtml(order.lines)
      }</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#f6f8fb;border-radius:10px"><tr><td style="padding:14px"><strong>Total registrado</strong><br><span style="color:#667085;font-size:12px">Sujeto a la confirmación operativa indicada en el pedido.</span></td><td style="padding:14px;text-align:right;font-size:18px;font-weight:700">${
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

async function markFailed(
  db: SupabaseClient,
  event: OutboxEvent,
  message: string,
) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, event.attempts - 1));
  await db.from("order_notification_outbox").update({
    status: "failed",
    last_error: message.slice(0, 400),
    available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", event.id);
}

export async function processPendingOrderNotifications(
  db: SupabaseClient,
  orderId: string | null,
  batchSize = 10,
) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const teamEmail = (Deno.env.get("LITORAL_ORDERS_EMAIL") || "").trim();
  const from = Deno.env.get("RESEND_FROM_EMAIL") ||
    "Litoral Maq <pedidos@litoralmaqrender.rendercorrientes.com>";
  const storeUrl = Deno.env.get("STORE_PUBLIC_URL") ||
    "https://litoralmaqrender.rendercorrientes.com";
  const adminUrl = Deno.env.get("ADMIN_PUBLIC_URL") ||
    "https://admin-litoralmaqrender.rendercorrientes.com";
  if (!apiKey) throw new Error("Falta configurar RESEND_API_KEY.");

  const { data, error } = await db.rpc("claim_order_notifications", {
    requested_order_id: orderId,
    batch_size: batchSize,
  });
  if (error) throw error;
  const events = (data || []) as OutboxEvent[];
  let sent = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const { data: rawOrder, error: orderError } = await db.from("orders")
        .select("*").eq("id", event.order_id).maybeSingle();
      if (orderError || !rawOrder) {
        throw new Error("No se encontró el pedido del evento.");
      }
      const order = rawOrder as OrderRecord;
      const recipient = event.event_type === "team_new_order"
        ? teamEmail
        : order.email;
      if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
        throw new Error(
          event.event_type === "team_new_order"
            ? "Falta configurar LITORAL_ORDERS_EMAIL."
            : "El pedido no tiene un email válido.",
        );
      }
      const email = renderEmail(
        event.event_type,
        order,
        event.event_type === "team_new_order" ? adminUrl : storeUrl,
      );
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": event.event_key,
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: email.subject,
          html: email.html,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !payload.id) {
        throw new Error(
          payload.message || `Resend respondió ${response.status}.`,
        );
      }
      await db.from("order_notification_outbox").update({
        status: "sent",
        provider_message_id: payload.id,
        last_error: null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", event.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      await markFailed(
        db,
        event,
        error instanceof Error ? error.message : "Error desconocido",
      );
    }
  }
  return { claimed: events.length, sent, failed };
}
