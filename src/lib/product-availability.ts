import type { Product } from "./types";

export type ProductAvailability = "unknown" | "sheet-managed" | "available" | "out-of-stock";

/**
 * El Google Sheet comercial no informa existencias por unidad, pero Litoral
 * confirmó una regla comercial: todo código presente en el Sheet vigente
 * está disponible, y ellos administran esa lista. Un producto publicado
 * (`active`) ya pasó ese filtro de presencia en el Sheet más imagen y
 * descripción verificadas (ver `getLaunchProducts`), así que mientras no
 * tenga una cantidad real cargada (`incomplete` sigue trayendo "stock"),
 * su disponibilidad es "sheet-managed": comercialmente disponible, sin
 * inventar una cantidad de unidades. Un producto no publicado con stock
 * sin confirmar sigue siendo "unknown" — nadie garantiza su disponibilidad.
 */
export function getProductAvailability(product: Product): ProductAvailability {
  if (product.incomplete.includes("stock")) {
    return product.active ? "sheet-managed" : "unknown";
  }
  return product.stock > 0 ? "available" : "out-of-stock";
}

export function canAddProductToCart(product: Product) {
  return product.price !== null && getProductAvailability(product) !== "out-of-stock";
}

export function availabilityLabel(product: Product) {
  const availability = getProductAvailability(product);
  if (availability === "unknown") return "Consultar disponibilidad";
  if (availability === "sheet-managed") return "Disponible";
  if (availability === "available") return "Disponible";
  return "Sin stock";
}
