import { createAdminClient, requireStaff, type MinimalSupabaseClient } from "../_shared/supabase-admin.ts";
import { errorResponse, HttpError } from "../_shared/http.ts";
import {
  AndreaniDisabledError,
  assertAndreaniEnabled,
  checkRateLimit,
  quote,
  RateLimitError,
  validateQuoteInput,
  ValidationError,
} from "../_shared/andreani.ts";

/** `deps.adminClient` es solo para tests (ver andreani.test.ts) — en
 * producción Deno.serve(handler) más abajo nunca lo pasa, así que siempre
 * se crea el client real. */
export async function handler(req: Request, deps: { adminClient?: MinimalSupabaseClient } = {}): Promise<Response> {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Método no soportado.");
    const client = deps.adminClient ?? createAdminClient();
    const staff = await requireStaff(req, client);
    assertAndreaniEnabled(); // ni siquiera cotiza un mock con el flag apagado.
    checkRateLimit(staff.id);

    const body = await req.json().catch(() => null);
    let input;
    try {
      input = validateQuoteInput(body);
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(400, error.message);
      throw error;
    }

    const result = await quote(input);
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
