import { errorResponse, handleOptions, HttpError, json, requireUser, serviceClient } from "../_shared/http.ts";
import { canManageBestsellerLabels, validBestsellerChange } from "../_shared/bestseller-label.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  try {
    if (request.method !== "POST") throw new HttpError(405, "Método no permitido.");
    const db = serviceClient();
    const user = await requireUser(request, db);
    const { data: profile, error: roleError } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (roleError || !canManageBestsellerLabels(profile?.role)) throw new HttpError(403, "Solo el equipo del local puede administrar etiquetas.");
    const body = await request.json();
    if (body?.action === "check") return json(request, { authorized: true });
    if (!validBestsellerChange(body)) throw new HttpError(400, "Datos de etiqueta inválidos.");
    // Only this column may be changed. Existing product RLS remains untouched.
    const { data, error } = await db.from("products").update({ best_seller: body.bestSeller }).eq("id", body.productId).eq("updated_at", body.updatedAt).select("id,best_seller,updated_at").maybeSingle();
    if (error) throw new HttpError(503, "No se pudo guardar la etiqueta.");
    if (!data) throw new HttpError(409, "El producto cambió. Actualizá la lista antes de guardar.");
    return json(request, { product: data });
  } catch (error) { return errorResponse(request, error); }
});
