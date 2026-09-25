import type { Product } from "./types";
import { canAddProductToCart } from "./product-availability";

export type StarProduct = { product: Product; image: string };
type PreferredStar = { id: string; image: string };

// Elegidos a mano, en orden, con la foto de producto que se muestra en el
// inicio. Si alguno deja de ser válido (inactivo, sin stock, fuera del rango de
// precio) se salta solo y lo reemplaza otro producto del catálogo.
// 3506 (motosierra Knock Out) queda afuera hasta tener una foto de producto
// real: su imagen es un arte de marca y desentonaba con las otras.
export const STAR_PREFERRED_IDS: readonly PreferredStar[] = [
  { id: "3381", image: "/products/catalog/3381-aa518-220plus.webp" },
  { id: "3499", image: "/products/catalog/3499-bwir150.webp" },
  { id: "3542", image: "/products/catalog/3542-lo180-220.webp" },
  { id: "3216", image: "/products/catalog/3216-sk455-1.webp" },
  { id: "3588", image: "/products/catalog/3588-ai1014-12c1.webp" },
];

// FNV-1a: desempate estable por id, sin Math.random.
function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * "Los elegidos de Litoral Maq": siempre `count` productos (o los que haya).
 * Candidatos: activos, comprables, con foto y con precio entre `minPrice` y
 * `maxPrice` (los extremos cuentan como válidos). Primero van los `preferred`
 * válidos, en orden, con su foto propia; el resto se completa con productos de
 * categorías distintas a las ya elegidas (una vuelta por categoría; recién si
 * faltan se repite categoría). Dentro de una categoría: destacados, más stock y
 * un desempate estable por id. No rota con el tiempo: cada elegido se queda
 * hasta que deja de ser válido y entonces lo reemplaza otro.
 */
export function selectStarProducts(
  products: Product[],
  {
    count = 4,
    minPrice = 40000,
    maxPrice = 100000,
    preferred = STAR_PREFERRED_IDS,
  }: { count?: number; minPrice?: number; maxPrice?: number; preferred?: readonly PreferredStar[] } = {},
): StarProduct[] {
  const candidates = products.filter(
    (product) =>
      product.image &&
      canAddProductToCart(product) &&
      product.price !== null &&
      product.price >= minPrice &&
      product.price <= maxPrice,
  );

  const picks: StarProduct[] = [];
  for (const { id, image } of preferred) {
    const product = candidates.find((candidate) => candidate.id === id);
    if (product && picks.length < count) picks.push({ product, image });
  }
  const chosen = new Set(picks.map(({ product }) => product.id));

  const byCategory = new Map<string, Product[]>();
  for (const product of candidates) {
    if (chosen.has(product.id)) continue;
    byCategory.set(product.category, [...(byCategory.get(product.category) ?? []), product]);
  }
  const groups = [...byCategory.entries()].map(([category, group]) => ({
    picked: picks.filter(({ product }) => product.category === category).length,
    order: hash(category),
    group: group.sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        b.stock - a.stock ||
        hash(a.id) - hash(b.id) ||
        a.id.localeCompare(b.id),
    ),
  }));

  while (picks.length < count) {
    // La categoría con menos elegidos va primero: se agotan las distintas antes de repetir.
    const next = groups
      .filter(({ group }) => group.length)
      .sort((a, b) => a.picked - b.picked || a.order - b.order)[0];
    if (!next) break;
    const product = next.group.shift()!;
    next.picked++;
    picks.push({ product, image: product.image! });
  }
  return picks;
}
