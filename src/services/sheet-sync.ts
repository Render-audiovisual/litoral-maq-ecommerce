import type { Product } from "@/lib/types";
import { DEFAULT_PURCHASE_LIMIT } from "@/lib/purchase-limits";
import type { SheetSyncAdapter } from "./adapters";

export const LITORAL_SHEET_ID = "17Y7jES70K_Gr-nQO6Om5PtRFu7nnNObDlbsRsXLdIrA";
export const LITORAL_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${LITORAL_SHEET_ID}/export?format=csv&gid=0`;

const CURATED_ACTIVE_COMPLETIONS: Record<
  string,
  Pick<Product, "description"> & Partial<Pick<Product, "image">>
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

function applyCuratedCompletion(product: Product): Product {
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

function parseCsv(input: string): string[][] {
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
  const normalized = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

export function parseSheetProducts(csv: string, currentProducts: Product[]) {
  const rows = parseCsv(csv);
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
    .reduce<Product[]>((products, row, index) => {
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
        } satisfies Product);
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
      } satisfies Product);
      return products;
    }, []);

  if (invalidRows.length) {
    throw new Error(
      `Hay filas incompletas o con precio inválido: ${invalidRows.slice(0, 8).join(", ")}${invalidRows.length > 8 ? "…" : ""}.`,
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
    warnings: [
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

export const googleSheetSyncAdapter: SheetSyncAdapter = {
  async sync(currentProducts) {
    const response = await fetch(`${LITORAL_SHEET_CSV_URL}&_=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Google Sheets respondió ${response.status}.`);
    const result = parseSheetProducts(await response.text(), currentProducts);
    return {
      ...result,
      source: "Google Sheet · Lista de precios - LitoralMaq",
    };
  },
};
