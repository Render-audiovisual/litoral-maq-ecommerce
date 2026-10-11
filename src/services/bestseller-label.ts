import { getTypedSupabaseClient, readSupabaseConfig } from "./persistence/supabase/client";

export function labelClient() {
  const config = readSupabaseConfig();
  if (config.status !== "ok") throw new Error("El acceso al equipo todavía no está configurado.");
  return getTypedSupabaseClient(config.config);
}

export async function requestLabel(body: { action: "check" } | { productId: string; bestSeller: boolean; updatedAt: string }) {
  const { data, error } = await labelClient().functions.invoke("product-bestseller-label", { body });
  if (error) throw new Error("No se pudo completar el cambio. Verificá tu acceso o actualizá la lista.");
  return data;
}
