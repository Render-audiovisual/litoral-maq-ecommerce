import { createAdminClient, requireStaff, type MinimalSupabaseClient } from "../_shared/supabase-admin.ts";
import { errorResponse, HttpError } from "../_shared/http.ts";
import {
  AndreaniDisabledError,
  assertAndreaniEnabled,
  checkRateLimit,
  localidades,
  RateLimitError,
  sucursales,
  validateGeoQuery,
  ValidationError,
} from "../_shared/andreani.ts";

export async function handler(req: Request, deps: { adminClient?: MinimalSupabaseClient } = {}): Promise<Response> {
  try {
    if (req.method !== "GET") throw new HttpError(405, "Método no soportado.");
    const client = deps.adminClient ?? createAdminClient();
    const staff = await requireStaff(req, client);
    assertAndreaniEnabled();
    checkRateLimit(staff.id);

    const url = new URL(req.url);
    let query;
    try {
      query = validateGeoQuery(url.searchParams.get("resource"), url.searchParams.get("postalCode"));
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }

    const result = query.resource === "sucursales" ? await sucursales(query.postalCode) : await localidades(query.postalCode);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AndreaniDisabledError) return errorResponse(new HttpError(503, error.message));
    if (error instanceof RateLimitError) return errorResponse(new HttpError(429, error.message));
    return errorResponse(error);
  }
}

// import.meta.main: no arrancar el server al importar index.ts desde un
// test (index.test.ts importa `handler` directamente) — solo al ejecutar
// este archivo como entry point real (Deno.serve de la plataforma).
if (import.meta.main) Deno.serve((req) => handler(req));
