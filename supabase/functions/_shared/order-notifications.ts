import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  type OrderEmailEvent,
  type OrderRecord,
  renderOrderEmail,
} from "./order-email.ts";

type OutboxEvent = {
  id: string;
  order_id: string;
  event_type: string;
  event_key: string;
  attempts: number;
};

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
  const from = (Deno.env.get("RESEND_FROM_EMAIL") || "").trim();
  const storeUrl = Deno.env.get("STORE_PUBLIC_URL") ||
    "https://litoralmaq.com";
  const adminUrl = Deno.env.get("ADMIN_PUBLIC_URL") ||
    "https://admin.litoralmaq.com";
  if (!apiKey) throw new Error("Falta configurar RESEND_API_KEY.");
  if (!from) throw new Error("Falta configurar RESEND_FROM_EMAIL.");

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
      const email = renderOrderEmail(
        event.event_type as OrderEmailEvent,
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
