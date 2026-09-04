import type { SheetSyncAdapter } from "./adapters";
import {
  readSupabaseConfig,
} from "@/services/persistence/supabase/client";

const SYNC_TIMEOUT_MS = 30_000;

/**
 * La lectura, validación y escritura del Sheet viven exclusivamente en la
 * Edge Function. El navegador solo envía la sesión administrativa y recibe
 * el resumen de una transacción ya confirmada.
 */
export const googleSheetSyncAdapter: SheetSyncAdapter = {
  async sync(accessToken) {
    const endpointOverride = process.env.NEXT_PUBLIC_SHEET_SYNC_ENDPOINT?.trim();
    const config = readSupabaseConfig();
    if (!endpointOverride && config.status !== "ok") {
      throw new Error(
        "La sincronización del Sheet requiere el backend Supabase configurado.",
      );
    }
    if (!accessToken) {
      throw new Error("La sesión de administrador venció. Volvé a ingresar.");
    }

    const supabaseUrl = config.status === "ok"
      ? config.config.url.replace(/\/$/, "")
      : "";
    const endpoint = endpointOverride ||
      `${supabaseUrl}/functions/v1/admin-sync-products`;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      SYNC_TIMEOUT_MS,
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(config.status === "ok" ? { apikey: config.config.publishableKey } : {}),
          "content-type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as
        | ({ error?: string } & Awaited<ReturnType<SheetSyncAdapter["sync"]>>)
        | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            "No se pudo sincronizar el Sheet. El catálogo actual no fue modificado.",
        );
      }
      if (
        !payload ||
        !Number.isInteger(payload.total) ||
        !Number.isInteger(payload.created) ||
        !Number.isInteger(payload.updated) ||
        !Number.isInteger(payload.unchanged) ||
        !Number.isInteger(payload.removed) ||
        !payload.lastSyncedAt
      ) {
        throw new Error(
          "El servidor devolvió un resultado de sincronización inválido. Recargá el panel antes de reintentar.",
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "La sincronización tardó demasiado. El catálogo actual se conservó; reintentá en un minuto.",
        );
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  },
};
