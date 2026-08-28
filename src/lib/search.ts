import { getProductAvailability } from "@/lib/product-availability";
import type { Product } from "@/lib/types";

/** Minúsculas y sin acentos: el catálogo viene en mayúsculas y el cliente
 * escribe como puede. También compactamos signos para comparar códigos y
 * nombres sin que un guion cambie el resultado. */
export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type SearchIndex = {
  name: string;
  brand: string;
  code: string;
  category: string;
};

const indexCache = new WeakMap<Product, SearchIndex>();

function indexProduct(product: Product) {
  const cached = indexCache.get(product);
  if (cached) return cached;
  const index = {
    name: normalize(product.name),
    brand: normalize(product.brand),
    code: normalize(product.code ?? ""),
    category: normalize(product.category),
  };
  indexCache.set(product, index);
  return index;
}

/** Vocabulario del rubro. No pretende inventar productos: solamente traduce
 * formas habituales de pedir la misma herramienta a términos del catálogo. */
const SYNONYM_GROUPS = [
  ["taladro", "agujereadora"],
  ["amoladora", "esmeriladora", "moladora"],
  ["desmalezadora", "bordeadora", "motoguadana", "guadana"],
  ["motosierra", "electrosierra"],
  ["compresor", "compresora"],
  ["aspiradora", "aspirador"],
  ["hidrolavadora", "hidro"],
  ["generador", "grupo", "electrogeno"],
  ["atornillador", "destornillador"],
  ["rotomartillo", "percutor"],
  ["ingletadora", "tronzadora"],
  ["sopladora", "soplador"],
] as const;

const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) SYNONYMS.set(term, group.filter((candidate) => candidate !== term));
}

type Candidate = { term: string; penalty: number };

function candidatesFor(token: string): Candidate[] {
  return [
    { term: token, penalty: 0 },
    ...(SYNONYMS.get(token) ?? []).map((term) => ({ term, penalty: 4 })),
  ];
}

/** Menor es mejor: coincidencia en nombre > código > marca > categoría. */
function literalScore(text: string, token: string) {
  if (!text) return -1;
  if (text === token) return 0;
  if (text.startsWith(token)) return 1;
  if (text.includes(` ${token}`)) return 2;
  return text.includes(token) ? 3 : -1;
}

function bestLiteralScore(index: SearchIndex, candidates: Candidate[]) {
  const fields = [
    { text: index.name, weight: 0 },
    { text: index.code, weight: 1 },
    { text: index.brand, weight: 3 },
    { text: index.category, weight: 5 },
  ];
  let best = Infinity;
  for (const candidate of candidates) {
    for (const field of fields) {
      const score = literalScore(field.text, candidate.term);
      if (score >= 0) best = Math.min(best, score + field.weight + candidate.penalty);
    }
  }
  return Number.isFinite(best) ? best : -1;
}

/** Damerau-Levenshtein: una letra cambiada, omitida, agregada o invertida
 * cuenta como un error. El catálogo es chico y esta pasada sólo se ejecuta
 * cuando no hubo resultados literales ni por sinónimo. */
function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
    }
  }
  return rows[a.length][b.length];
}

function typoTolerance(token: string) {
  if (token.length < 4 || /^\d+$/.test(token)) return 0;
  return token.length >= 8 ? 2 : 1;
}

function fuzzyWordScore(text: string, token: string) {
  const maximum = typoTolerance(token);
  if (!maximum || !text) return -1;
  let best = Infinity;
  for (const [wordIndex, word] of text.split(" ").entries()) {
    for (let length = Math.max(2, token.length - maximum); length <= token.length + maximum; length += 1) {
      const candidate = word.slice(0, length);
      if (!candidate) continue;
      const distance = editDistance(token, candidate);
      if (distance <= maximum) best = Math.min(best, distance * 2 + Math.min(wordIndex, 4));
    }
  }
  return Number.isFinite(best) ? best : -1;
}

function bestFuzzyScore(index: SearchIndex, token: string) {
  const fields = [
    { text: index.name, weight: 0 },
    { text: index.brand, weight: 3 },
    { text: index.category, weight: 5 },
  ];
  let best = Infinity;
  for (const field of fields) {
    const score = fuzzyWordScore(field.text, token);
    if (score >= 0) best = Math.min(best, 10 + field.weight + score);
  }
  return Number.isFinite(best) ? best : -1;
}

function availabilityRank(product: Product) {
  const availability = getProductAvailability(product);
  if (availability === "available" || availability === "sheet-managed") return 0;
  if (availability === "unknown") return 1;
  return 2;
}

function collect(products: Product[], tokens: string[], allowTypos: boolean) {
  const scored: { product: Product; score: number }[] = [];
  for (const product of products) {
    const index = indexProduct(product);
    let total = 0;
    let matches = true;
    for (const token of tokens) {
      const literal = bestLiteralScore(index, candidatesFor(token));
      if (literal >= 0) {
        total += literal;
        continue;
      }
      const fuzzy = allowTypos ? bestFuzzyScore(index, token) : -1;
      if (fuzzy >= 0) {
        total += fuzzy;
        continue;
      }
      matches = false;
      break;
    }
    if (matches) scored.push({ product, score: total });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      availabilityRank(a.product) - availabilityRank(b.product) ||
      Number(b.product.featured) - Number(a.product.featured) ||
      a.product.name.localeCompare(b.product.name, "es"),
  );
  return scored.map(({ product }) => product);
}

/** Todas las palabras tienen que tener sentido dentro del mismo producto.
 * Primero se buscan coincidencias exactas y sinónimos; la tolerancia a typos
 * entra sólo si esa pasada no encontró nada, para no ensuciar resultados. */
export function searchProducts(products: Product[], query: string, limit?: number) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return limit === undefined ? products : products.slice(0, limit);

  const literal = collect(products, tokens, false);
  const result = literal.length ? literal : collect(products, tokens, true);
  return limit === undefined ? result : result.slice(0, limit);
}
