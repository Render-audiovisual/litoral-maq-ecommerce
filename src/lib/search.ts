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

// El texto normalizado de cada producto no cambia, y se vuelve a pedir en
// cada tecla: normalizar 500 nombres por pulsación era buena parte del costo.
const haystackCache = new WeakMap<Product, string>();

function haystack(product: Product) {
  const cached = haystackCache.get(product);
  if (cached !== undefined) return cached;
  const text = normalize(
    [product.name, product.brand, product.code, product.category]
      .filter(Boolean)
      .join(" "),
  );
  haystackCache.set(product, text);
  return text;
}

/** Menor es mejor: arranca el texto > arranca una palabra > cae en el medio.
 * -1 significa que el token no está. */
function scoreToken(text: string, token: string) {
  if (text.startsWith(token)) return 0;
  if (text.includes(` ${token}`)) return 1;
  return text.includes(token) ? 2 : -1;
}

/** Damerau-Levenshtein con corte temprano: cuenta el intercambio de dos
 * letras como un solo error, porque "amolda" por "amolad" es el typo más
 * común al tipear rápido. Devuelve `max + 1` apenas se pasa del límite. */
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** Con menos de cuatro letras casi cualquier palabra queda a un error de
 * distancia, así que ahí no se tolera nada. */
function typoTolerance(token: string) {
  if (token.length < 4) return 0;
  return token.length >= 7 ? 2 : 1;
}

/** El token se compara contra el arranque de cada palabra, no contra la
 * palabra entera: si no, "taldro" nunca alcanzaría a "TALADRO PERCUTOR".
 *
 * Se exige que coincida la primera letra. Es lo que separa "taldro" de los
 * taladros y no de los atornilladores, y de paso evita el 95% de las
 * comparaciones caras. El precio es no perdonar un error en la primera letra,
 * que además es el más raro: casi nadie se equivoca al arrancar la palabra. */
function matchesWithTypo(text: string, token: string) {
  const max = typoTolerance(token);
  if (max === 0) return -1;
  const words = text.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    if (words[index][0] !== token[0]) continue;
    for (const length of [token.length, token.length + 1]) {
      if (editDistance(token, words[index].slice(0, length), max) <= max) return index;
    }
  }
  return -1;
}

function collect(products: Product[], tokens: string[], allowTypos: boolean) {
  const scored: { product: Product; score: number }[] = [];
  for (const product of products) {
    const text = haystack(product);
    let score = 0;
    let matches = true;
    for (const token of tokens) {
      const tokenScore = scoreToken(text, token);
      if (tokenScore >= 0) {
        score += tokenScore;
        continue;
      }
      // Lo aproximado siempre puntúa peor que lo literal, y dentro de lo
      // aproximado gana el que coincide más cerca del principio: el nombre
      // abre el texto y la categoría lo cierra, así que "taldro" pone los
      // taladros arriba de los atornilladores, que sólo coinciden porque su
      // categoría se llama "Taladros y atornilladores".
      const typoIndex = allowTypos ? matchesWithTypo(text, token) : -1;
      if (typoIndex >= 0) {
        score += 3 + typoIndex;
        continue;
      }
      matches = false;
      break;
    }
    if (matches) scored.push({ product, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.product.featured) - Number(a.product.featured) ||
      b.product.stock - a.product.stock,
  );
  return scored.map((item) => item.product);
}

/** Cada palabra de la consulta tiene que aparecer en algún lado del producto,
 * no la frase entera: "taladro bosch" encuentra el taladro de Bosch aunque el
 * nombre diga "TALADRO PERCUTOR 810W BOSCH".
 *
 * Los typos se toleran recién en una segunda pasada, cuando la búsqueda
 * literal no encontró nada: es más cara y puede traer ruido, pero cualquier
 * cosa es mejor que devolverle una lista vacía a quien escribió "taldro". */
export function searchProducts(products: Product[], query: string, limit?: number) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return limit === undefined ? products : products.slice(0, limit);

  // ponytail: la pasada aproximada recorre el catálogo entero palabra por
  // palabra. Con ~500 productos son unos pocos milisegundos; si el catálogo
  // crece mucho, indexar los términos o mover la búsqueda al servidor.
  const literal = collect(products, tokens, false);
  const result = literal.length ? literal : collect(products, tokens, true);
  return limit === undefined ? result : result.slice(0, limit);
}
