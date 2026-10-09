import type { Product } from "./types";

export function productGallery(product: Pick<Product, "image" | "images">): string[] {
  return [...new Set([product.image, ...product.images].map((photo) => photo?.trim()).filter((photo): photo is string => Boolean(photo)))];
}

export function withProductGallery(product: Product, photos: string[]): Product {
  if (!photos.length || photos.length > 3) throw new Error("Guardá entre 1 y 3 fotos.");
  return { ...product, image: photos[0], images: [...photos], incomplete: product.incomplete.filter((field) => field !== "image") };
}

export function productPhoto(product: Pick<Product, "image" | "images">): string | null {
  return product.image?.trim() || product.images.find((image) => image.trim())?.trim() || null;
}

export function isPhotoUrl(value: string): boolean {
  if (value.startsWith("/products/") && !value.includes("\\")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

/** Only photo fields change; stock, prices and the rest stay untouched. */
export function withProductPhoto(product: Product, photo: string): Product {
  return {
    ...product,
    image: photo,
    images: [photo, ...product.images.filter((image) => image !== photo)],
    incomplete: product.incomplete.filter((field) => field !== "image"),
  };
}
