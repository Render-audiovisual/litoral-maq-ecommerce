import {
  errorResponse,
  handleOptions,
  json,
  requireAdmin,
  serviceClient,
} from "../_shared/http.ts";
import { CatalogSheetValidationError } from "../_shared/catalog-sheet.ts";
import { MANUAL_SYNC_SOURCE, runCatalogSync } from "../_shared/catalog-sync.ts";

async function recordFailure(
  db: ReturnType<typeof serviceClient>,
  adminId: string,
  error: unknown,
) {
  const detail = error instanceof Error ? error.message.slice(0, 1200) : "Error desconocido";
  await db.from("catalog_sync_runs").insert({
    admin_id: adminId,
    status: "failed",
    source: MANUAL_SYNC_SOURCE,
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
    const { result, warnings } = await runCatalogSync(db, {
      adminId: admin.id,
      source: MANUAL_SYNC_SOURCE,
    });
    return json(request, { ...result, warnings });
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
