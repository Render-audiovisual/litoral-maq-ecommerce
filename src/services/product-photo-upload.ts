import { getTypedSupabaseClient, readSupabaseConfig } from "./persistence/supabase/client";
import { resolveRequestedProvider } from "./provider";

export async function uploadProductPhoto(productId: string, file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
    throw new Error("Elegí una foto JPG, PNG o WebP de hasta 5 MB.");
  }
  // Local preview only. Production never silently falls back to browser storage.
  if (resolveRequestedProvider() === "local") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No se pudo leer la foto."));
      reader.readAsDataURL(file);
    });
  }
  const config = readSupabaseConfig();
  if (config.status !== "ok") throw new Error("El almacenamiento no está configurado.");
  const body = new FormData(); body.append("productId", productId); body.append("file", file);
  const { data, error } = await getTypedSupabaseClient(config.config).functions.invoke("admin-upload-product-photo", { body });
  if (error || !data?.url) throw new Error("No se pudo subir la foto. La foto anterior sigue guardada. Reintentá.");
  return data.url;
}
