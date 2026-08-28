import type { CartLine, Product } from "./types";

/**
 * El Sheet confirma disponibilidad, pero no informa unidades. Hasta que
 * Litoral cargue stock numérico, este tope conservador evita vender una
 * cantidad mayor sin inventar existencias.
 */
export const DEFAULT_PURCHASE_LIMIT = 3;

export function getPurchaseLimit(product: Pick<Product, "purchaseLimit">) {
  const value = Number(product.purchaseLimit ?? DEFAULT_PURCHASE_LIMIT);
  return Number.isInteger(value) && value > 0
    ? Math.min(value, 99)
    : DEFAULT_PURCHASE_LIMIT;
}

export function clampPurchaseQuantity(
  product: Pick<Product, "purchaseLimit">,
  quantity: number,
) {
  return Math.max(0, Math.min(Math.trunc(quantity), getPurchaseLimit(product)));
}

export function validateCartPurchaseLimits(
  lines: CartLine[],
  products: Product[],
) {
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product)
      return "Uno de los productos del carrito ya no está disponible.";
    const limit = getPurchaseLimit(product);
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > limit
    ) {
      return `Podés solicitar hasta ${limit} unidades de ${product.name} por compra.`;
    }
  }
  return "";
}
