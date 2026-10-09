import { errorResponse, handleOptions, HttpError, json, requireAdmin, serviceClient } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  try {
    if (request.method !== "POST") throw new HttpError(405, "Método no permitido.");
    const db = serviceClient();
    await requireAdmin(request, db);
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) throw new HttpError(413, "La foto supera 5 MB.");
    const form = await request.formData();
    const file = form.get("file");
    const productId = String(form.get("productId") || "");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(productId)) throw new HttpError(400, "Producto inválido.");
    const { data: product, error: productError } = await db.from("products").select("id").eq("id", productId).maybeSingle();
    if (productError || !product) throw new HttpError(404, "Producto no encontrado.");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new HttpError(400, "Elegí una foto de hasta 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
    const webp = new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
    const type = jpeg ? "image/jpeg" : png ? "image/png" : webp ? "image/webp" : "";
    if (!type || file.type !== type) throw new HttpError(400, "Solo se permiten fotos JPG, PNG o WebP válidas.");
    const bucket = "product-photos";
    const { data: existing } = await db.storage.getBucket(bucket);
    if (!existing) {
      const { error } = await db.storage.createBucket(bucket, { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
      if (error) {
        const { data: concurrent } = await db.storage.getBucket(bucket);
        if (!concurrent) throw new HttpError(503, "No se pudo preparar el almacenamiento.");
      }
    }
    const path = `${productId}/${crypto.randomUUID()}.${jpeg ? "jpg" : png ? "png" : "webp"}`;
    const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw new HttpError(503, "No se pudo guardar la foto.");
    return json(request, { url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl });
  } catch (error) { return errorResponse(request, error); }
});
