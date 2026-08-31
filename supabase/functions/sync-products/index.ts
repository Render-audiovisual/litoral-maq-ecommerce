import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";
import { parseSheetRows, type SheetProduct } from "../_shared/sheet-parser.ts";
import { readSheet } from "../_shared/sheet-source.ts";

type ProductRow = Record<string, unknown>;

function rowToProduct(row: ProductRow): SheetProduct {
  return {
    id: String(row.id),
    slug: String(row.slug),
    code: (row.code as string | null) ?? null,
    name: String(row.name),
    price: row.price === null ? null : Number(row.price),
    rawPrice: (row.raw_price as string | null) ?? null,
    category: String(row.category),
    brand: String(row.brand),
    image: (row.image as string | null) ?? null,
    images: (row.images as string[] | null) ?? [],
    stock: Number(row.stock ?? 0),
    lowStockThreshold: Number(row.low_stock_threshold ?? 0),
    purchaseLimit: (row.purchase_limit as number | null) ?? undefined,
    active: Boolean(row.active),
    featured: Boolean(row.featured),
    description: (row.description as string | null) ?? null,
    variants: (row.variants as string[] | null) ?? [],
    source: String(row.source),
    sourceRow: Number(row.source_row ?? 0),
    incomplete: (row.incomplete as string[] | null) ?? [],
    shippingWeightKg: (row.shipping_weight_kg as number | null) ?? null,
    shippingHeightCm: (row.shipping_height_cm as number | null) ?? null,
    shippingWidthCm: (row.shipping_width_cm as number | null) ?? null,
    shippingLengthCm: (row.shipping_length_cm as number | null) ?? null,
    shippingEnabled: Boolean(row.shipping_enabled),
  };
}

function productToRow(product: SheetProduct): ProductRow {
  return {
    id: product.id,
    slug: product.slug,
    code: product.code ?? product.id,
    name: product.name,
    price: product.price,
    raw_price: product.rawPrice,
    category: product.category,
    brand: product.brand,
    image: product.image,
    images: product.images,
    stock: product.stock,
    low_stock_threshold: product.lowStockThreshold,
    purchase_limit: product.purchaseLimit ?? 3,
    active: product.active,
    featured: product.featured,
    description: product.description,
    variants: product.variants,
    source: product.source,
    source_row: product.sourceRow,
    incomplete: product.incomplete,
    shipping_weight_kg: product.shippingWeightKg ?? null,
    shipping_height_cm: product.shippingHeightCm ?? null,
    shipping_width_cm: product.shippingWidthCm ?? null,
    shipping_length_cm: product.shippingLengthCm ?? null,
    shipping_enabled: product.shippingEnabled ?? false,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Sincroniza el catálogo contra el Google Sheet, entero del lado del
 * servidor.
 *
 * Por qué existe: el panel es un export estático (next.config.ts →
 * output: "export") servido en Hostinger, así que no hay rutas /api donde
 * poner esto. Mientras el navegador leía el Sheet, el CSP del panel
 * bloqueaba docs.google.com y la sincronización dependía además de que
 * Google mandara cabeceras CORS que no manda. Acá adentro no rige ninguna
 * de las dos cosas, el Sheet puede estar privado, y sobre todo: si algo
 * sale mal se aborta ANTES de escribir y el catálogo vigente queda intacto.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  const db = serviceClient();
  let runId: string | null = null;
  try {
    const admin = await requireAdmin(request, db);
    const { data: run } = await db.from("sheet_sync_runs").insert({
      triggered_by: admin.id,
    }).select("id").maybeSingle();
    runId = (run?.id as string | undefined) ?? null;

    const { data: rows, error: readError } = await db.from("products").select(
      "*",
    );
    if (readError) {
      throw new HttpError(503, "No pudimos leer el catálogo actual.");
    }
    const current = (rows || []).map(rowToProduct);

    // Lectura y validación completas ANTES de escribir nada. parseSheetRows
    // aborta si faltan encabezados, si un código viene duplicado, si más del
    // 10% de las filas son inválidas o si el Sheet trae menos de 100
    // productos (señal de export truncado). Cualquiera de esos casos sale
    // por el catch con el catálogo como estaba.
    const sheet = await readSheet();
    const result = parseSheetRows(sheet.rows, current);

    // Una sola sentencia, atómica: entra el catálogo entero o no entra
    // nada. Un upsert por tandas dejaría la base a mitad de camino entre
    // dos versiones del Sheet si fallara una tanda intermedia.
    const { error: writeError } = await db.rpc("apply_sheet_catalog", {
      payload: result.products.map(productToRow),
    });
    if (writeError) {
      throw new HttpError(
        503,
        `El Sheet se leyó bien pero la base rechazó la escritura: ${writeError.message}`,
      );
    }

    const report = {
      created: result.created,
      updated: result.updated,
      removed: result.removed,
      skipped: result.skipped,
      errors: 0,
      source: sheet.source,
      syncedAt: new Date().toISOString(),
      warnings: result.warnings,
    };
    if (runId) {
      await db.from("sheet_sync_runs").update({
        finished_at: report.syncedAt,
        status: "ok",
        source: sheet.source,
        created: report.created,
        updated: report.updated,
        removed: report.removed,
        skipped: report.skipped,
        detail: { warnings: result.warnings, sheetRows: sheet.rows.length },
      }).eq("id", runId);
    }
    return json(request, report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      // El catálogo no se tocó: lo único que queda por registrar es el
      // motivo, que es justo la corrida que alguien va a querer mirar.
      await db.from("sheet_sync_runs").update({
        finished_at: new Date().toISOString(),
        status: "error",
        errors: 1,
        detail: { message },
      }).eq("id", runId);
    }
    return errorResponse(request, error);
  }
});
