import { getTypedSupabaseClient, readSupabaseConfig } from "./persistence/supabase/client";
import { parseSavedCheckoutDetails, type SavedCheckoutDetails } from "@/lib/saved-checkout-details";

async function invoke(body: Record<string,unknown>) {
  const config=readSupabaseConfig();
  if(config.status!=="ok") throw new Error("El guardado por cuenta no está disponible en esta vista.");
  const {data,error}=await getTypedSupabaseClient(config.config).functions.invoke("checkout-details",{body});
  if(error) throw new Error("No pudimos conectar con tus datos guardados. Podés completar la compra igualmente.");
  return data;
}
export async function readCheckoutDetails() {
  const result=await invoke({operation:"read"});
  return result?.details ? parseSavedCheckoutDetails(result.details) : null;
}
export async function saveCheckoutDetails(details: SavedCheckoutDetails, accountId: string) {
  const result=await invoke({operation:"save",accountId,consent:true,details:parseSavedCheckoutDetails(details)});
  if(result?.saved!==true) throw new Error("No se confirmó el guardado. Volvé a intentar.");
}
