import { errorResponse, handleOptions, HttpError, json, requireUser, serviceClient } from "./http.ts";
import { parseSavedCheckoutDetails } from "./saved-checkout-details.ts";

export async function handleCheckoutDetails(request: Request, suppliedDb?: ReturnType<typeof serviceClient>) {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return json(request, {error:"Método no permitido."},405);
  try {
    const db = suppliedDb ?? serviceClient();
    const user = await requireUser(request, db);
    if (user.is_anonymous || !user.email_confirmed_at) throw new HttpError(403,"Ingresá con una cuenta verificada para guardar tus datos.");
    const raw = await request.text();
    if (raw.length > 10000) throw new HttpError(413,"Datos demasiado extensos.");
    let body: Record<string,unknown>;
    try { body=JSON.parse(raw); } catch { throw new HttpError(400,"Solicitud inválida."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400,"Solicitud inválida.");
    if (body.operation === "read") {
      const {data,error}=await db.from("customer_checkout_details").select("details,updated_at").eq("customer_id",user.id).maybeSingle();
      if(error) throw new HttpError(503,"No pudimos cargar los datos guardados.");
      return json(request,{details:data?.details ?? null,updatedAt:data?.updated_at ?? null});
    }
    if (body.operation !== "save" || body.consent !== true) throw new HttpError(400,"Confirmá que querés guardar estos datos.");
    if (body.accountId !== user.id) throw new HttpError(403,"Tu cuenta cambió. Revisá los datos antes de guardarlos.");
    let details;
    try { details=parseSavedCheckoutDetails(body.details); } catch(error) { throw new HttpError(422,(error as Error).message); }
    const {error}=await db.from("customer_checkout_details").upsert({customer_id:user.id,details,updated_at:new Date().toISOString()});
    if(error) throw new HttpError(503,"No pudimos guardar tus datos. La compra puede continuar.");
    return json(request,{saved:true});
  } catch(error) { return errorResponse(request,error); }
}
