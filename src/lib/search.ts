import type { Product } from "@/lib/types";

/** Minúsculas y sin acentos: "INALÁMBRICO" y "inalambrico" tienen que
 * encontrarse entre sí. El catálogo viene de la lista comercial en
 * mayúsculas y el cliente escribe como puede. */
export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function haystack(product: Product) {
  return normalize(
    [product.name, product.brand, product.code, product.category]
      .filter(Boolean)
      .join(" "),
  );
}

/** Menor es mejor: arranca el texto > arranca una palabra > cae en el medio.
 * -1 significa que el token no está. */
function scoreToken(text: string, token: string) {
  if (text.startsWith(token)) return 0;
  if (text.includes(` ${token}`)) return 1;
  return text.includes(token) ? 2 : -1;
}

/** Cada palabra de la consulta tiene que aparecer en algún lado del producto,
 * no la frase entera: "taladro bosch" encuentra el taladro de Bosch aunque el
 * nombre diga "TALADRO PERCUTOR 810W BOSCH". */
export function searchProducts(products: Product[], query: string, limit?: number) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return limit === undefined ? products : products.slice(0, limit);

  const scored: { product: Product; score: number }[] = [];
  for (const product of products) {
    const text = haystack(product);
    let score = 0;
    let matches = true;
    for (const token of tokens) {
      const tokenScore = scoreToken(text, token);
      if (tokenScore === -1) {
        matches = false;
        break;
      }
      score += tokenScore;
    }
    if (matches) scored.push({ product, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.product.featured) - Number(a.product.featured) ||
      b.product.stock - a.product.stock,
  );
  const result = scored.map((item) => item.product);
  return limit === undefined ? result : result.slice(0, limit);
}
