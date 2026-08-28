import {
  getTypedSupabaseClient,
  readSupabaseConfig,
} from "@/services/persistence/supabase/client";

/** Despierta el procesador; la base ya dejó el evento en una outbox idempotente. */
export async function flushOrderNotifications(orderId?: string) {
  const config = readSupabaseConfig();
  if (config.status !== "ok") return { claimed: 0, sent: 0, failed: 0 };
  const client = getTypedSupabaseClient(config.config);
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) return { claimed: 0, sent: 0, failed: 0 };
  const response = await fetch(
    `${config.config.url.replace(/\/$/, "")}/functions/v1/order-notifications`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: config.config.publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(orderId ? { orderId } : {}),
    },
  );
  if (!response.ok)
    throw new Error(
      "El cambio se guardó, pero el correo quedó pendiente de reintento.",
    );
  return response.json() as Promise<{
    claimed: number;
    sent: number;
    failed: number;
  }>;
}
