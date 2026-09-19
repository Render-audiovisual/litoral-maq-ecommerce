import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";
import {
  CatalogSheetValidationError,
  parseCatalogSheet,
} from "../_shared/catalog-sheet.ts";

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

async function fetchSheetCsv() {
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

async function recordFailure(
  db: ReturnType<typeof serviceClient>,
  adminId: string,
  error: unknown,
) {
  const detail = error instanceof Error ? error.message.slice(0, 1200) : "Error desconocido";
  await db.from("catalog_sync_runs").insert({
    admin_id: adminId,
    status: "failed",
    source: "Google Sheet · Lista de precios - LitoralMaq",
    error_detail: detail,
    finished_at: new Date().toISOString(),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return json(request, { error: "Método no permitido." }, 405);

  const db = serviceClient();
  let adminId: string | null = null;
  try {
    const admin = await requireAdmin(request, db);
    adminId = admin.id;
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

    const { data, error } = await db.rpc("sync_catalog_from_sheet", {
      p_admin_id: admin.id,
      p_products: keptRows.map((row) => ({
        code: row.code,
        name: row.name,
        price: row.price,
        raw_price: row.rawPrice,
        source_row: row.sourceRow,
        slug: row.slug,
      })),
      p_source: "Google Sheet · Lista de precios - LitoralMaq",
    });
    if (error) throw new HttpError(503, "La base rechazó la sincronización. El catálogo actual no fue modificado.");

    return json(request, {
      ...(data as Record<string, unknown>),
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
    });
  } catch (error) {
    if (adminId) {
      try {
        await recordFailure(db, adminId, error);
      } catch (logError) {
        console.error("No se pudo registrar el fallo de sincronización", logError);
      }
    }
    if (error instanceof CatalogSheetValidationError) {
      return json(request, { error: `${error.message} El catálogo actual no fue modificado.` }, error.status);
    }
    return errorResponse(request, error);
  }
});
