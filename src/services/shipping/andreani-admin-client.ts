import { readSupabaseConfig } from "@/services/persistence/supabase/client";
import type { Session } from "@/lib/types";

/**
 * Llama a la Edge Function andreani-shipment (supabase/functions/) desde el
 * panel admin (client component). Nunca toca secretos de Andreani — solo
 * manda el JWT de la sesión admin/employee, que la función valida contra
 * profiles.role (ver _shared/supabase-admin.ts#requireStaff). Sigue el
 * mismo estilo fetch-y-tirar-Error que services/sheet-sync.ts.
 */
/**
 * ¿Se muestran los controles de Andreani en el panel? Apagado por defecto.
 *
 * Es SOLO una señal de interfaz — la autoridad es ANDREANI_ENABLED del lado
 * servidor (secret de Supabase), que hace que las Functions rechacen toda
 * operación con 503. Si alguien fuerza esta variable, lo único que consigue
 * es ver un botón que devuelve 503.
 *
 * Se lee como expresión literal `process.env.NEXT_PUBLIC_X` (nunca
 * destructurada ni dinámica) porque Next.js solo inlinea así en el bundle
 * de cliente — misma regla que services/provider.ts. `overrideEnv` es solo
 * para tests.
 */
export function isAndreaniUiEnabled(overrideEnv?: Record<string, string | undefined>): boolean {
  const raw = overrideEnv?.NEXT_PUBLIC_ANDREANI_UI ?? process.env.NEXT_PUBLIC_ANDREANI_UI;
  return raw?.trim().toLowerCase() === "true";
}

/** Sin `contract` a propósito: la Function nunca lo devuelve (es un dato
 * interno de la cuenta comercial, no del pedido). Ver ORDER_COLUMNS en
 * supabase-adapter.ts y el revoke por columna en la migración 0007. */
export type AndreaniShipmentFields = {
  andreaniShipmentNumber: string | null;
  andreaniStatus: string | null;
  andreaniTrackingUrl: string | null;
  andreaniLabelUrl: string | null;
};

export async function createAndreaniShipment(orderId: string, session: Session): Promise<AndreaniShipmentFields> {
  const configResult = readSupabaseConfig();
  if (configResult.status !== "ok") {
    throw new Error("Supabase no está configurado: no se puede generar el envío de Andreani.");
  }
  const endpoint = `${configResult.config.url.replace(/\/$/, "")}/functions/v1/andreani-shipment?orderId=${encodeURIComponent(orderId)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Andreani respondió ${response.status}.`);
  }
  return {
    andreaniShipmentNumber: body.shipmentNumber ?? null,
    andreaniStatus: body.status ?? null,
    andreaniTrackingUrl: body.trackingUrl ?? null,
    andreaniLabelUrl: body.labelUrl ?? null,
  };
}
