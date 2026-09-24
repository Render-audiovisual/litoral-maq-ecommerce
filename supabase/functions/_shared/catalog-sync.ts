import { HttpError, type serviceClient } from "./http.ts";
import {
  type CatalogSheetRow,
  type ParsedCatalogSheet,
  parseCatalogSheet,
} from "./catalog-sheet.ts";

export type CatalogDb = ReturnType<typeof serviceClient>;

export const MANUAL_SYNC_SOURCE = "Google Sheet · Lista de precios - LitoralMaq";

export type CatalogSyncGuard = (
  parsed: ParsedCatalogSheet,
  keptRows: CatalogSheetRow[],
) => { ok: true } | { ok: false; reason: string };

// El freno de seguridad (solo la corrida automática) cortó antes del RPC.
export class CatalogSyncBlockedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "CatalogSyncBlockedError";
  }
}

const DEFAULT_SHEET_ID = "17Y7jES70K_Gr-nQO6Om5PtRFu7nnNObDlbsRsXLdIrA";
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_ATTEMPTS = 2;

function sheetCsvUrl() {
  const sheetId = (Deno.env.get("LITORAL_SHEET_ID") || DEFAULT_SHEET_ID).trim();
  const gid = (Deno.env.get("LITORAL_SHEET_GID") || "0").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(sheetId) || !/^\d+$/.test(gid)) {
    throw new HttpError(503, "La fuente del catálogo no está configurada correctamente.");
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetCsv() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${sheetCsvUrl()}&_=${Date.now()}`, {
        signal: controller.signal,
        headers: { accept: "text/csv,text/plain;q=0.9" },
      });
      if (!response.ok) {
        throw new Error(`Google Sheets respondió ${response.status}.`);
      }
      const csv = await response.text();
      if (!csv.trim()) throw new Error("Google Sheets devolvió una respuesta vacía.");
      return csv;
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  const reason = lastError instanceof Error ? lastError.message : "respuesta inválida";
  throw new HttpError(503, `No se pudo leer Google Sheets (${reason}). El catálogo actual no fue modificado.`);
}

export async function runCatalogSync(
  db: CatalogDb,
  { adminId, source, guard }: { adminId: string; source: string; guard?: CatalogSyncGuard },
) {
  const parsed = parseCatalogSheet(await fetchSheetCsv());

  // Filas con precio ilegible (p.ej. "############" por un formato de
  // celda angosto en Sheets) igual traen código y nombre: se completan con
  // el precio ya guardado para que la fila siga apareciendo en el Sheet a
  // ojos de la sincronización y no se retire el producto por error.
  const keptRows = [...parsed.rows];
  if (parsed.unpriceable.length) {
    const codes = parsed.unpriceable.map((item) => item.code);
    const { data: existing } = await db
      .from("products")
      .select("code, name, price, raw_price, slug")
      .in("code", codes);
    const byCode = new Map((existing ?? []).map((item) => [item.code, item]));
    for (const { code, sourceRow } of parsed.unpriceable) {
      const current = byCode.get(code);
      if (!current || current.price === null) continue;
      keptRows.push({
        code,
        name: current.name,
        price: current.price,
        rawPrice: current.raw_price ?? String(current.price),
        sourceRow,
        slug: current.slug,
      });
    }
  }

  const verdict = guard?.(parsed, keptRows);
  if (verdict && !verdict.ok) throw new CatalogSyncBlockedError(verdict.reason);

  const { data, error } = await db.rpc("sync_catalog_from_sheet", {
    p_admin_id: adminId,
    p_products: keptRows.map((row) => ({
      code: row.code,
      name: row.name,
      price: row.price,
      raw_price: row.rawPrice,
      source_row: row.sourceRow,
      slug: row.slug,
    })),
    p_source: source,
  });
  if (error) throw new HttpError(503, "La base rechazó la sincronización. El catálogo actual no fue modificado.");

  return {
    result: data as Record<string, unknown>,
    warnings: [
      "El Sheet confirma disponibilidad comercial, pero todavía no informa cantidades físicas.",
      "Se conservaron imágenes, descripciones, categorías, marcas, logística y límites personalizados.",
      ...(parsed.invalidRows.length
        ? [
            `Hay ${parsed.invalidRows.length} fila(s) con precio o datos ilegibles en el Sheet (fila ${
              parsed.invalidRows.slice(0, 8).join(", fila ")
            }${parsed.invalidRows.length > 8 ? "…" : ""}). Se mantuvo el precio anterior donde el producto ya existía; revisá esas celdas en el Sheet (formato de columna angosto suele mostrar "############").`,
          ]
        : []),
    ],
  };
}
