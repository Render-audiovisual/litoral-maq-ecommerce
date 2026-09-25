import type { Product } from "./types";
import { canAddProductToCart } from "./product-availability";

const MAX_PER_CATEGORY = 2;
const TIERS = 3;
// El carrusel se renueva solo cada 48 horas, sin servidor ni tarea programada:
// la semilla mezcla la ventana de 48 h con el producto de la ficha.
export const RELATED_ROTATION_MS = 48 * 60 * 60 * 1000;

// FNV-1a: el mismo texto da siempre el mismo número. Mezclar sin Math.random
// hace que dentro de una ventana cada ficha muestre siempre las mismas
// sugerencias, y que cambien al cruzar a la ventana siguiente.
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
 * de distintas categorías (máximo dos de cada una) y repartidos en tres tramos
 * de precio (tercios del precio entre todos los candidatos: más baratos,
 * medios y más caros) para que siempre haya de todo. Se calcula sobre el
 * catálogo activo, así que un producto que se desactiva se reemplaza solo.
 * Dentro de cada categoría y tramo van primero los destacados y luego los de
 * más stock; el resto del orden sale del id del producto actual y de la
 * ventana de 48 horas de `now`.
 */
export function selectRelatedProducts(
  products: Product[],
  current: Product,
  count = 12,
  now = Date.now(),
): Product[] {
  const seed = `${current.id}:${Math.floor(now / RELATED_ROTATION_MS)}`;
  const rank = (product: Product) => hash(`${seed}:${product.id}`);
  const candidates = products
    .filter((product) => product.id !== current.id && product.image && canAddProductToCart(product))
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || a.id.localeCompare(b.id));

  // categoría -> tramo de precio -> productos, mejores primero.
  const byCategory = new Map<string, Product[][]>();
  // Los tramos se cortan por precio, no por posición: con precios iguales
  // caen juntos y manda el orden de calidad.
  const cuts = [1, 2].map((k) => candidates[Math.ceil((k * candidates.length) / TIERS)]?.price ?? Infinity);
  candidates.forEach((product) => {
    const tier = cuts.filter((cut) => (product.price ?? 0) >= cut).length;
    const tiers = byCategory.get(product.category) ?? Array.from({ length: TIERS }, () => []);
    tiers[tier].push(product);
    byCategory.set(product.category, tiers);
  });
  const groups = [...byCategory.entries()]
    .sort(([a], [b]) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`))
    .map(([, tiers]) => ({
      tiers: tiers.map((group) =>
        group.sort((a, b) => Number(b.featured) - Number(a.featured) || b.stock - a.stock || rank(a) - rank(b)),
      ),
      picked: 0,
    }));

  const picks: Product[] = [];
  const firstTier = hash(seed) % TIERS;
  for (let slot = 0; slot < count; slot++) {
    // Cada lugar apunta a un tramo (bajo, medio, alto, bajo…); se elige la
    // categoría con menos elegidos que tenga algo en ese tramo, y si ninguna
    // tiene se toma lo mejor que quede.
    const open = groups
      .filter((group) => group.picked < MAX_PER_CATEGORY)
      .sort((a, b) => a.picked - b.picked);
    const tier = (firstTier + slot) % TIERS;
    const group = open.find((g) => g.tiers[tier].length) ?? open.find((g) => g.tiers.some((t) => t.length));
    if (!group) break;
    const source = group.tiers[tier].length ? group.tiers[tier] : group.tiers.find((t) => t.length)!;
    picks.push(source.shift()!);
    group.picked++;
  }
  return picks;
}
