import type { Product } from "./types";
import { canAddProductToCart } from "./product-availability";

const MAX_PER_CATEGORY = 2;

// FNV-1a: el mismo texto da siempre el mismo número. Mezclar sin Math.random
// evita diferencias entre el HTML del servidor y la hidratación, y hace que
// cada ficha muestre siempre las mismas sugerencias.
function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * Sugerencias "También te puede interesar": productos comprables y con foto,
 * repartidos por categoría (una vuelta por categoría, máximo dos de cada una)
 * para invitar a seguir recorriendo el catálogo. Dentro de cada categoría van
 * primero los destacados y luego los de más stock; el resto del orden sale
 * del id del producto actual.
 */
export function selectRelatedProducts(products: Product[], current: Product, count = 10): Product[] {
  const seed = current.id;
  const rank = (product: Product) => hash(`${seed}:${product.id}`);
  const byCategory = new Map<string, Product[]>();
  for (const product of products) {
    if (product.id === current.id || !product.image || !canAddProductToCart(product)) continue;
    byCategory.set(product.category, [...(byCategory.get(product.category) ?? []), product]);
  }

  const groups = [...byCategory.entries()]
    .sort(([a], [b]) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`))
    .map(([, group]) =>
      group.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) || b.stock - a.stock || rank(a) - rank(b),
      ),
    );

  const picks: Product[] = [];
  for (let round = 0; round < MAX_PER_CATEGORY; round++) {
    for (const group of groups) {
      if (picks.length >= count) return picks;
      if (group[round]) picks.push(group[round]);
    }
  }
  return picks;
}
