import { getTypedSupabaseClient, readSupabaseConfig } from "./persistence/supabase/client";
export type WelcomeBenefit = {eligible:boolean;pendingOrderId?:string;reason?:string};
export async function readWelcomeBenefit():Promise<WelcomeBenefit> {
  const config=readSupabaseConfig();
  if(config.status!=="ok") throw new Error("No se pudo verificar el beneficio.");
  const {data,error}=await getTypedSupabaseClient(config.config).functions.invoke("welcome-discount",{body:{}});
  if(error || typeof data?.eligible!=="boolean") throw new Error("No se pudo verificar el beneficio.");
  return data as WelcomeBenefit;
}
