import type { Product } from "./types";

export type ProductAvailability = "unknown" | "available" | "out-of-stock";

/**
 * El Google Sheet comercial no informa existencias. `incomplete` conserva
 * esa procedencia para que un número heredado o de demostración nunca se
 * publique como stock real hasta que un administrador lo confirme.
 */
export function getProductAvailability(product: Product): ProductAvailability {
  if (product.incomplete.includes("stock")) return "unknown";
  return product.stock > 0 ? "available" : "out-of-stock";
}

export function canAddProductToCart(product: Product) {
  return product.price !== null && getProductAvailability(product) !== "out-of-stock";
}

export function availabilityLabel(product: Product) {
  const availability = getProductAvailability(product);
  if (availability === "unknown") return "Consultar disponibilidad";
  if (availability === "available") return "Disponible";
  return "Sin stock";
}
