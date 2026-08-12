import type { Product } from "@/lib/types";

export const PROVISIONAL_WINNER_LIMIT = 10;
export const HOME_WINNER_LIMIT = 6;
export const HERO_PRODUCT_CODE = "580";

function familyKey(product: Product) {
  const name = product.name.toUpperCase();
  const families: Array<[string, RegExp]> = [
    ["taladro", /TALADRO|ATORNILLADOR/],
    ["amoladora", /AMOLADOR/],
    ["soldadora", /SOLDADOR/],
    ["desmalezadora", /DESMALEZ/],
    ["motosierra", /MOTOSIERRA|ELECTROSIERRA/],
    ["hormigonera", /HORMIGONER/],
    ["llave-impacto", /LLAVE DE IMPACTO/],
    ["compresor", /COMPRESOR|INFLADOR/],
    ["hidrolavadora", /HIDROLAV/],
    ["aspiradora", /ASPIRADOR/],
  ];
  return families.find(([, pattern]) => pattern.test(name))?.[0] ?? product.category;
}

function byStockThenImage(a: Product, b: Product) {
  return b.stock - a.stock || Number(Boolean(b.image)) - Number(Boolean(a.image)) || a.name.localeCompare(b.name);
}

export function getWinningProducts(products: Product[], limit = PROVISIONAL_WINNER_LIMIT) {
  const eligible = products
    .filter((product) => product.active && product.stock > 0 && product.price !== null)
    .sort(byStockThenImage);
  if (!eligible.length || limit <= 0) return [];

  const hero = eligible.find((product) => product.code === HERO_PRODUCT_CODE)
    ?? eligible.find((product) => /^TALADRO\b/i.test(product.name));
  const winners: Product[] = hero ? [hero] : [];
  const winnerIds = new Set(winners.map((product) => product.id));
  const usedFamilies = new Set(winners.map(familyKey));

  // La Home necesita imágenes comerciales y variedad. Primero elige las
  // familias visuales con mayor stock y luego completa sin repetir ids.
  for (const product of eligible.filter((item) => item.image)) {
    if (winners.length >= Math.min(HOME_WINNER_LIMIT, limit)) break;
    const family = familyKey(product);
    if (winnerIds.has(product.id) || usedFamilies.has(family)) continue;
    winners.push(product);
    winnerIds.add(product.id);
    usedFamilies.add(family);
  }
  for (const product of eligible.filter((item) => item.image)) {
    if (winners.length >= Math.min(HOME_WINNER_LIMIT, limit)) break;
    if (winnerIds.has(product.id)) continue;
    winners.push(product);
    winnerIds.add(product.id);
  }
  for (const product of eligible) {
    if (winners.length >= limit) break;
    if (winnerIds.has(product.id)) continue;
    winners.push(product);
    winnerIds.add(product.id);
  }
  return winners;
}

export function getWinnerRankMap(products: Product[]) {
  return new Map(getWinningProducts(products).map((product, index) => [product.id, index + 1]));
}
