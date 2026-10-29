import { HttpError, type serviceClient } from "./http.ts";
import {
  type CatalogSheetRow,
  type ParsedCatalogSheet,
  parseCatalogSheet,
  parseShippingDimensionsSheet,
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

const DEFAULT_SHEET_ID = "1JeracKoJtCUpyC3erG8SKUxRNlfn2fLX";
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_ATTEMPTS = 2;

function sheetCsvUrl() {
  const sheetId = (Deno.env.get("LITORAL_SHEET_ID") || DEFAULT_SHEET_ID).trim();
  // Sin gid: Google exporta la primera pestaña. El .xls de los dueños cambia de
  // gid cada vez que se vuelve a subir, así que fijarlo rompe el sync (400).
  const gid = (Deno.env.get("LITORAL_SHEET_GID") || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(sheetId) || (gid && !/^\d+$/.test(gid))) {
    throw new HttpError(503, "La fuente del catálogo no está configurada correctamente.");
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

export async function fetchSheetCsv(url = sheetCsvUrl()) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${url}&_=${Date.now()}`, {
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

// Planilla opcional de peso y medidas de envío (LITORAL_SHIPPING_SHEET_ID).
// Un error acá no frena la sincronización de precios: vuelve como aviso.
async function syncShippingDimensions(db: CatalogDb): Promise<string | null> {
  const sheetId = (Deno.env.get("LITORAL_SHIPPING_SHEET_ID") || "").trim();
  if (!sheetId) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
    return "La planilla de medidas de envío no está bien configurada.";
  }
  try {
    const parsed = parseShippingDimensionsSheet(
      await fetchSheetCsv(
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
      ),
    );
    const { data, error } = await db.rpc("sync_shipping_dimensions", {
      p_rows: parsed.rows.map((row) => ({
        code: row.code,
        weight_kg: row.weightKg,
        height_cm: row.heightCm,
        width_cm: row.widthCm,
        length_cm: row.lengthCm,
      })),
    });
    if (error) throw new Error("la base rechazó la actualización");
    return `Medidas de envío: ${data ?? 0} producto(s) actualizados desde la planilla (${parsed.rows.length} con datos completos${
      parsed.incomplete.length ? `, ${parsed.incomplete.length} fila(s) incompletas ignoradas` : ""
    }).`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "error desconocido";
    return `No se pudieron actualizar las medidas de envío (${reason}). Los precios sí se sincronizaron.`;
  }
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
        stock: null,
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
      stock: row.stock,
    })),
    p_source: source,
  });
  if (error) throw new HttpError(503, "La base rechazó la sincronización. El catálogo actual no fue modificado.");
  const dimensionsWarning = await syncShippingDimensions(db);

  return {
    result: data as Record<string, unknown>,
    warnings: [
      "Se conservaron imágenes, descripciones, categorías, marcas y límites personalizados.",
      ...(parsed.invalidRows.length
        ? [
            `Hay ${parsed.invalidRows.length} fila(s) con precio o datos ilegibles en el Sheet (fila ${
              parsed.invalidRows.slice(0, 8).join(", fila ")
            }${parsed.invalidRows.length > 8 ? "…" : ""}). Se mantuvo el precio anterior donde el producto ya existía; revisá esas celdas en el Sheet (formato de columna angosto suele mostrar "############").`,
          ]
        : []),
      ...(dimensionsWarning ? [dimensionsWarning] : []),
    ],
  };
}
