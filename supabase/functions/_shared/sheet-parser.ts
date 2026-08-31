/**
 * Parser del Sheet de Litoral. SIN IMPORTS a propósito: este archivo lo
 * comparten dos runtimes distintos — la Edge Function Deno que sincroniza
 * (supabase/functions/sync-products) y el bundle Next del panel. Es la única
 * fuente de verdad de cómo se leen los precios y qué filas son válidas; si
 * se duplicara, el stock visible y el catálogo real podrían divergir sin que
 * nadie se entere, que es exactamente el riesgo que esta sincronización
 * tiene que evitar.
 *
 * Cualquier import (ni siquiera `import type`) rompe el deploy: la función
 * se sube como archivos sueltos dentro de supabase/functions y nada fuera de
 * esa carpeta viaja en el bundle.
 */

/** Espejo estructural de `Product` de src/lib/types.ts. La compatibilidad
 * entre ambos la verifica tsc en services/sheet-sync.ts, no un comentario. */
export type SheetProduct = {
  id: string;
  slug: string;
  code: string | null;
  name: string;
  price: number | null;
  rawPrice: string | null;
  category: string;
  brand: string;
  image: string | null;
  images: string[];
  stock: number;
  lowStockThreshold: number;
  purchaseLimit?: number;
  active: boolean;
  featured: boolean;
  description: string | null;
  variants: string[];
  source: string;
  sourceRow: number;
  incomplete: string[];
  shippingWeightKg?: number | null;
  shippingHeightCm?: number | null;
  shippingWidthCm?: number | null;
  shippingLengthCm?: number | null;
  shippingEnabled?: boolean;
};

/** Copia deliberada de DEFAULT_PURCHASE_LIMIT (src/lib/purchase-limits.ts):
 * este archivo no puede importar. Que sigan iguales lo verifica un test. */
export const DEFAULT_PURCHASE_LIMIT = 3;

export const LITORAL_SHEET_ID = "17Y7jES70K_Gr-nQO6Om5PtRFu7nnNObDlbsRsXLdIrA";
export const LITORAL_SHEET_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${LITORAL_SHEET_ID}/export?format=csv&gid=0`;

const CURATED_ACTIVE_COMPLETIONS: Record<
  string,
  Pick<SheetProduct, "description"> & Partial<Pick<SheetProduct, "image">>
> = {
  "3348": {
    image: "/promos/cortacesped-gladiator-1600w.jpg",
    description:
      "Cortacésped eléctrico Gladiator CP536/220 de 1600 W para mantenimiento de jardines.",
  },
  "3757": {
    image: "/promos/electrosierra-forest-20v.jpg",
    description:
      "Electrosierra Forest & Garden E912/20C1 de 20 V con espada de 12 pulgadas.",
  },
  "3687": {
    image: "/promos/escalera-obra-multifuncion.jpg",
    description: "Escalera multifunción Obra EMA804 con configuración 4 x 4.",
  },
  "3353": {
    image: "/promos/hormigonera-obra-140l.jpg",
    description: "Hormigonera Obra MH8140/25 de 140 litros.",
  },
  "3732": {
    description: "Llave de impacto Neo LI1065/20C1 de 20 V y 650 N·m.",
  },
  "3246": {
    description:
      "Mini motosierra inalámbrica Garden para tareas de corte y mantenimiento exterior.",
  },
  "3506": {
    description: "Motosierra Knock Out KOM345 de 45 cc y corte de 460 mm.",
  },
  "580": {
    description: "Taladro Energy ID13/2/220 de 550 W con mandril de 13 mm.",
  },
};

function applyCuratedCompletion(product: SheetProduct): SheetProduct {
  const completion = product.code
    ? CURATED_ACTIVE_COMPLETIONS[product.code]
    : null;
  if (!completion) return product;
  const image = completion.image || product.image;
  const description = completion.description || product.description;
  return {
    ...product,
    image,
    images:
      image && !product.images.includes(image)
        ? [image, ...product.images]
        : product.images,
    description,
    incomplete: product.incomplete.filter(
      (item) =>
        !(item === "image" && image) &&
        !(item === "description" && description),
    ),
  };
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parsePrice(value: string) {
  // Celda vacía NO es cero: Number("") da 0 y el producto entraría al
  // catálogo a $0. Un precio de 0 o negativo tampoco es un precio: la fila
  // se omite y se informa, que es distinto de venderla regalada.
  if (!value.trim()) return null;
  const normalized = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const categoryRules: Array<[string, RegExp]> = [
  ["Soldadura", /SOLDAD|ELECTRODO|ALAMBRE MIG|MASCARA FOTOSENSIBLE/],
  ["Amoladoras", /AMOLADOR/],
  ["Taladros y atornilladores", /TALADRO|ATORNILLADOR|MECHA|MANDRIL/],
  ["Jardín", /DESMALEZ|MOTOSIERRA|CORTACESP|PODAD|BORDEAD|SOPLADOR|ASPERSOR/],
  ["Compresores y neumática", /COMPRESOR|NEUMATIC|INFLADOR|PISTOLA DE AIRE/],
  ["Hidrolavado y bombas", /HIDROLAV|BOMBA|MOTOBOMBA/],
  [
    "Herramientas manuales",
    /ALICATE|PINZA|LLAVE|DESTORNILL|MARTILLO|SERRUCHO|TENAZA|CUTTER/,
  ],
  ["Seguridad", /ANTEOJO|GUANTE|CASCO|PROTECTOR|MASCARA|CHALECO/],
  [
    "Accesorios y consumibles",
    /DISCO|LIJA|CEPILLO|PUNTA|HOJA|ADAPTADOR|ALARGADOR/,
  ],
  ["Construcción", /HORMIGON|MEZCLADOR|FRATACHO|LLANA|NIVEL|CORTADORA/],
];

function inferCategory(name: string) {
  return categoryRules.find(([, rule]) => rule.test(name))?.[0] || "Otros";
}

function inferBrand(name: string) {
  const specificBrands: Array<[string, RegExp]> = [
    ["FOREST & GARDEN", /\bFOREST(?:\s*&\s*GARDEN)?\b/],
    ["KNOCK OUT", /\bKNO(?:CK|CT)\s+OUT\b/],
    ["ENERGY NEXT", /\b(?:E|N)NERGY\s+NEXT\b/],
    ["NEO NEXT", /\bNEO\s+NEXT\b/],
    ["OBRA", /\bOBRA\b/],
  ];
  const specificBrand = specificBrands.find(([, rule]) => rule.test(name));
  if (specificBrand) return specificBrand[0];

  const brands = [
    "ENERGY",
    "NEO",
    "GLADIATOR",
    "LUSQTOFF",
    "STANLEY",
    "BOSCH",
    "DEWALT",
    "MAKITA",
    "DOWEN PAGIO",
    "TOTAL",
  ];
  return brands.find((brand) => name.includes(brand)) || "Sin marca informada";
}

function imageFor(name: string) {
  if (name.includes("AMOLADOR")) return "/products/AMOLADORA ANGULAR.png";
  if (name.includes("DESMALEZ")) return "/products/DESMALEZADORA.png";
  if (name.includes("MOTOSIERRA")) return "/products/MOTOSIERRA_.png";
  if (name.includes("SOLDADORA") && /MIG|MAG|3 EN 1/.test(name))
    return "/products/SOLDADORA 3 en 1.png";
  if (name.includes("SOLDADORA")) return "/products/SOLDADORA.png";
  if (name.includes("TALADRO") || name.includes("ATORNILLADOR"))
    return "/products/TALADRO ATORNILLADOR.png";
  return null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Un Sheet que dejó de estar compartido NO responde 403: responde 200 con
 * el HTML del login de Google. Sin este control el parser leería esa página
 * como si fueran datos y el catálogo quedaría desincronizado en silencio —
 * el peor escenario cuando el Sheet es la fuente del stock.
 */
export function looksLikeHtml(body: string, contentType?: string | null) {
  return /^\s*<(?:!doctype|html)/i.test(body) ||
    (contentType || "").includes("text/html");
}

export function parseSheetProducts(csv: string, currentProducts: SheetProduct[]) {
  return parseSheetRows(parseCsv(csv), currentProducts);
}

/**
 * La Google Sheets API devuelve las celdas ya separadas, sin pasar por CSV:
 * entra por acá directo y se saltea el parseo de comillas y comas, que es
 * donde el CSV puede romperse con un nombre de producto que lleve coma.
 */
export function parseSheetRows(
  rows: string[][],
  currentProducts: SheetProduct[],
) {
  if (rows.length < 2) throw new Error("El Sheet no contiene productos.");

  const headers = rows[0].map(normalizeHeader);
  const codeIndex = headers.findIndex((header) =>
    ["codigo", "cod", "sku"].includes(header),
  );
  const nameIndex = headers.findIndex((header) =>
    ["articulo", "producto", "nombre"].includes(header),
  );
  const priceIndex = headers.findIndex((header) =>
    ["preciocon", "precio", "preciocontado"].includes(header),
  );
  if ([codeIndex, nameIndex, priceIndex].some((index) => index < 0)) {
    throw new Error(
      `Encabezados inválidos. Se esperaba código, artículo y precio; llegaron: ${rows[0].join(", ")}.`,
    );
  }

  const currentByCode = new Map(
    currentProducts
      .filter((product) => product.code)
      .map((product) => [product.code as string, product]),
  );
  const seenCodes = new Set<string>();
  const invalidRows: number[] = [];
  let created = 0;
  let updated = 0;

  const sheetProducts = rows
    .slice(1)
    .reduce<SheetProduct[]>((products, row, index) => {
      const sourceRow = index + 2;
      const code = (row[codeIndex] || "").trim();
      const name = (row[nameIndex] || "").trim();
      const rawPrice = (row[priceIndex] || "").trim();
      const price = parsePrice(rawPrice);
      if (!code || !name || price === null) {
        invalidRows.push(sourceRow);
        return products;
      }
      if (seenCodes.has(code))
        throw new Error(`El código ${code} está duplicado en el Sheet.`);
      seenCodes.add(code);

      const existing = currentByCode.get(code);
      if (existing) {
        updated += 1;
        products.push({
          ...existing,
          name,
          price,
          rawPrice,
          source: "google-sheet",
          sourceRow,
          purchaseLimit: existing.purchaseLimit ?? DEFAULT_PURCHASE_LIMIT,
          incomplete: existing.incomplete.filter(
            (item) => !["code", "price", "sheet-absent"].includes(item),
          ),
        } satisfies SheetProduct);
        return products;
      }

      created += 1;
      const upperName = name.toUpperCase();
      const image = imageFor(upperName);
      products.push({
        id: code,
        slug: `${slugify(name)}-${code}`,
        code,
        name,
        price,
        rawPrice,
        category: inferCategory(upperName),
        brand: inferBrand(upperName),
        image,
        images: image ? [image] : [],
        stock: 0,
        lowStockThreshold: 5,
        purchaseLimit: DEFAULT_PURCHASE_LIMIT,
        active: false,
        featured: false,
        description: null,
        variants: [],
        source: "google-sheet",
        sourceRow,
        incomplete: [!image && "image", "stock", "description"].filter(
          Boolean,
        ) as string[],
      } satisfies SheetProduct);
      return products;
    }, []);

  // Una fila mal cargada NO puede congelar toda la lista de precios: se
  // omite y se informa. Pero si el Sheet viene mayormente inválido no es un
  // error de tipeo sino otra cosa (columnas corridas, export equivocado), y
  // ahí sí se aborta sin tocar el catálogo.
  const dataRows = rows.length - 1;
  if (invalidRows.length > Math.max(5, dataRows * 0.1)) {
    throw new Error(
      `El Sheet tiene ${invalidRows.length} de ${dataRows} filas inválidas. Se canceló la sincronización sin tocar el catálogo.`,
    );
  }
  if (sheetProducts.length < 100) {
    throw new Error(
      `El Sheet devolvió solo ${sheetProducts.length} productos. Se canceló la sincronización por seguridad.`,
    );
  }

  const retiredProducts = currentProducts
    .filter((product) => !seenCodes.has(product.code || product.id))
    .map((product) => ({
      ...product,
      purchaseLimit: product.purchaseLimit ?? DEFAULT_PURCHASE_LIMIT,
      active: false,
      featured: false,
      incomplete: [...new Set([...product.incomplete, "sheet-absent"])],
    }));
  const removed = retiredProducts.length;

  return {
    products: [...sheetProducts, ...retiredProducts].map(
      applyCuratedCompletion,
    ),
    created,
    updated,
    removed,
    skipped: invalidRows.length,
    warnings: [
      ...(invalidRows.length
        ? [
          `Se omitieron ${invalidRows.length} filas sin código, nombre o precio válido (${
            invalidRows.slice(0, 8).join(", ")
          }${invalidRows.length > 8 ? "…" : ""}). El resto se sincronizó.`,
        ]
        : []),
      "El Sheet confirma disponibilidad comercial, pero no cantidades: se conservaron imágenes, descripciones y demás datos existentes del panel.",
      ...(created
        ? [
            `${created} productos nuevos quedaron disponibles en Sheet pero ocultos hasta completar su ficha.`,
          ]
        : []),
      ...(removed
        ? [
            `${removed} productos ausentes del Sheet se conservaron ocultos; no se borraron.`,
          ]
        : []),
    ],
  };
}
