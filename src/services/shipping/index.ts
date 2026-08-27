import { getTypedSupabaseClient, readSupabaseConfig } from "@/services/persistence/supabase/client";
import type { ShippingCreationResult, ShippingQuoteRequest, ShippingQuoteResult } from "./types";

export class ShippingIntegrationError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = "ShippingIntegrationError";
  }
}

function getConfig() {
  if (process.env.NEXT_PUBLIC_SHIPPING_ENABLED !== "true") {
    throw new ShippingIntegrationError("La cotización automática todavía no está activada.", 503);
  }
  const result = readSupabaseConfig();
  if (result.status !== "ok") {
    throw new ShippingIntegrationError("La cotización automática todavía no está activada.", 503);
  }
  return result.config;
}

async function authenticatedRequest(path: string, body: unknown) {
  const config = getConfig();
  const client = getTypedSupabaseClient(config);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new ShippingIntegrationError("La sesión venció. Volvé a intentar.", 401);
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      apikey: config.publishableKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "No se pudo completar la operación logística.";
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // La función puede haber fallado antes de producir JSON.
    }
    throw new ShippingIntegrationError(message, response.status);
  }
  return response;
}

export async function quoteShipping(request: ShippingQuoteRequest): Promise<ShippingQuoteResult> {
  const response = await authenticatedRequest("shipping-quote", request);
  return await response.json() as ShippingQuoteResult;
}

export async function createShipping(orderId: string): Promise<ShippingCreationResult> {
  const response = await authenticatedRequest("shipping-create", { orderId });
  return await response.json() as ShippingCreationResult;
}

export async function downloadShippingLabel(orderId: string) {
  const response = await authenticatedRequest("shipping-label", { orderId, format: "pdf" });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Etiqueta ${orderId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type { ShippingCreationResult, ShippingQuoteOption, ShippingQuoteRequest, ShippingQuoteResult } from "./types";
