import { errorResponse, handleOptions, HttpError, json, requireUser, serviceClient } from "../_shared/http.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  try {
    if (request.method !== "POST") throw new HttpError(405,"Método no permitido.");
    if(Deno.env.get("WELCOME_DISCOUNT_ENABLED")!=="true") return json(request,{eligible:false,reason:"inactive"});
    const db = serviceClient();
    const user = await requireUser(request,db);
    if (user.is_anonymous || !user.email_confirmed_at) return json(request,{eligible:false,reason:"register"});
    const { data, error } = await db.rpc("welcome_discount_status",{p_customer:user.id});
    if (error) throw new HttpError(503,"No se pudo verificar el beneficio.");
    return json(request,data);
  } catch(error) { return errorResponse(request,error); }
});
