import { getTypedSupabaseClient, readSupabaseConfig } from "@/services/persistence/supabase/client";

export class PaymentIntegrationError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = "PaymentIntegrationError";
  }
}

export function isMercadoPagoEnabled() {
  return process.env.NEXT_PUBLIC_MERCADO_PAGO_ENABLED === "true";
}

export async function createPaymentPreference(orderId: string,welcomeDiscount=false) {
  if (!isMercadoPagoEnabled()) {
    throw new PaymentIntegrationError("Mercado Pago todavía no está activado.", 503);
  }
  const result = readSupabaseConfig();
  if (result.status !== "ok") {
    throw new PaymentIntegrationError("El checkout todavía no está configurado.", 503);
  }
  const client = getTypedSupabaseClient(result.config);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) {
    throw new PaymentIntegrationError("La sesión venció. Volvé a intentar.", 401);
  }
  const response = await fetch(
    `${result.config.url.replace(/\/$/, "")}/functions/v1/payment-create`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: result.config.publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId,welcomeDiscount }),
    },
  );
  if (!response.ok) {
    let message = "No se pudo iniciar el pago.";
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // La función pudo fallar antes de producir JSON.
    }
    throw new PaymentIntegrationError(message, response.status);
  }
  const payload = await response.json() as {
    preferenceId?: string;
    checkoutUrl?: string;
  };
  if (!payload.preferenceId || !payload.checkoutUrl?.startsWith("https://")) {
    throw new PaymentIntegrationError("Mercado Pago no devolvió un checkout válido.", 502);
  }
  return {
    preferenceId: payload.preferenceId,
    checkoutUrl: payload.checkoutUrl,
  };
}

// Arrepentimiento: el cliente cancela su propio pedido mientras no esté pagado.
// La base valida que el pedido sea suyo y siga pendiente (cancel_own_pending_order).
export async function cancelOwnPendingOrder(orderId: string) {
  const result = readSupabaseConfig();
  if (result.status !== "ok") {
    throw new PaymentIntegrationError("No se pudo cancelar el pedido ahora.", 503);
  }
  const client = getTypedSupabaseClient(result.config) as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await client.rpc("cancel_own_pending_order", { p_order_id: orderId });
  if (error) throw new PaymentIntegrationError(error.message || "No se pudo cancelar el pedido.", 400);
}
