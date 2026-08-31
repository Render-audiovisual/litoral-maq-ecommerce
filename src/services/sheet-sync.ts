import type { Product } from "@/lib/types";
import { DEFAULT_PURCHASE_LIMIT } from "@/lib/purchase-limits";
import {
  DEFAULT_PURCHASE_LIMIT as PARSER_PURCHASE_LIMIT,
  LITORAL_SHEET_CSV_URL,
  LITORAL_SHEET_ID,
  looksLikeHtml,
  parseSheetProducts,
  type SheetProduct,
} from "../../supabase/functions/_shared/sheet-parser";
import { getTypedSupabaseClient, readSupabaseConfig } from "@/services/persistence/supabase/client";
import { resolveRequestedProvider } from "./provider";
import type { SheetSyncAdapter, SheetSyncReport } from "./adapters";

export { LITORAL_SHEET_CSV_URL, LITORAL_SHEET_ID, looksLikeHtml, parseSheetProducts };

/**
 * El parser vive en supabase/functions/_shared porque lo comparte la Edge
 * Function (ver el encabezado de ese archivo). No puede importar `Product`,
 * así que declara un espejo estructural: estas dos asignaciones son la
 * verificación de que no se separaron — si alguien agrega un campo a
 * `Product` sin reflejarlo, `tsc` falla acá y no en producción.
 */
const _sheetProductIsProduct: SheetProduct = null as unknown as Product;
const _productIsSheetProduct: Product = null as unknown as SheetProduct;
void _sheetProductIsProduct;
void _productIsSheetProduct;
/** Mismo motivo: la copia del tope por pedido no puede derivar. */
const _purchaseLimitsMatch: typeof DEFAULT_PURCHASE_LIMIT = PARSER_PURCHASE_LIMIT;
void _purchaseLimitsMatch;


/**
 * El navegador NUNCA habla con docs.google.com: el CSP del panel sólo
 * permite `connect-src 'self' https://*.supabase.co` (ver admin-ready/
 * .htaccess), y aunque se abriera, Google no manda cabeceras CORS para el
 * endpoint de export. La lectura del Sheet, la validación y el upsert pasan
 * enteros en la Edge Function `sync-products`, que además conserva el
 * catálogo vigente si el Sheet responde mal.
 */
async function syncViaEdgeFunction() {
  const result = readSupabaseConfig();
  if (result.status !== "ok") {
    throw new Error("La sincronización con el Sheet todavía no está configurada.");
  }
  const config = result.config;
  const client = getTypedSupabaseClient(config);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) {
    throw new Error("La sesión de administrador venció. Volvé a ingresar antes de sincronizar.");
  }
  const response = await fetch(
    `${config.url.replace(/\/$/, "")}/functions/v1/sync-products`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: config.publishableKey,
        "content-type": "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => ({})) as Partial<SheetSyncReport> & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo sincronizar con el Google Sheet.");
  }
  return payload as SheetSyncReport;
}

/**
 * Modo preview local (sin Supabase): no hay servidor donde correr la
 * función, así que el navegador sigue leyendo el CSV. Sirve para demo en
 * localhost, donde no rige el CSP de producción.
 */
async function syncFromBrowser(currentProducts: Product[]) {
  const response = await fetch(`${LITORAL_SHEET_CSV_URL}&_=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Google Sheets respondió ${response.status}.`);
  const body = await response.text();
  if (looksLikeHtml(body, response.headers.get("content-type"))) {
    throw new Error(
      "Google devolvió una página de inicio de sesión en lugar del Sheet. Revisá que siga compartido por link.",
    );
  }
  return parseSheetProducts(body, currentProducts);
}

export const googleSheetSyncAdapter: SheetSyncAdapter = {
  async sync(currentProducts) {
    if (resolveRequestedProvider() === "supabase") return await syncViaEdgeFunction();
    const result = await syncFromBrowser(currentProducts);
    return {
      ...result,
      skipped: 0,
      errors: 0,
      syncedAt: new Date().toISOString(),
      source: "Google Sheet · Lista de precios - LitoralMaq (preview local)",
    };
  },
};
