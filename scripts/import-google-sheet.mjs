import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SHEET_ID =
  process.env.LITORAL_SHEET_ID ||
  "17Y7jES70K_Gr-nQO6Om5PtRFu7nnNObDlbsRsXLdIrA";
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

function parseCsv(input) {
  const rows = [];
  let row = [];
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
    rows.push(row);
  }
  return rows;
}

function parsePrice(value) {
  const normalized = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const categoryRules = [
  ["Soldadura", /SOLDAD|ELECTRODO|ALAMBRE MIG|MASCARA FOTOSENSIBLE/],
  ["Amoladoras", /AMOLADOR/],
  ["Taladros y atornilladores", /TALADRO|ATORNILLADOR|MECHA|MANDRIL/],
  ["Jardín", /DESMALEZ|MOTOSIERRA|CORTACESP|PODAD|BORDEAD|SOPLADOR|ASPERSOR/],
  ["Compresores y neumática", /COMPRESOR|NEUMATIC|INFLADOR|PISTOLA DE AIRE/],
  ["Hidrolavado y bombas", /HIDROLAV|BOMBA|MOTOBOMBA/],
  ["Herramientas manuales", /ALICATE|PINZA|LLAVE|DESTORNILL|MARTILLO|SERRUCHO|TENAZA|CUTTER/],
  ["Seguridad", /ANTEOJO|GUANTE|CASCO|PROTECTOR|MASCARA|CHALECO/],
  ["Accesorios y consumibles", /DISCO|LIJA|CEPILLO|PUNTA|HOJA|ADAPTADOR|ALARGADOR/],
  ["Construcción", /HORMIGON|MEZCLADOR|FRATACHO|LLANA|NIVEL|CORTADORA/],
];

function inferCategory(name) {
  return categoryRules.find(([, rule]) => rule.test(name))?.[0] || "Otros";
}

function inferBrand(name) {
  const specificBrands = [
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

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`No se pudo descargar la planilla (${response.status}).`);
}
const rows = parseCsv(await response.text());
const [headers, ...body] = rows;
const normalizedHeaders = headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
const validHeaders =
  ["codigo", "cod", "sku"].includes(normalizedHeaders[0]) &&
  ["articulo", "producto", "nombre"].includes(normalizedHeaders[1]) &&
  ["preciocon", "precio", "preciocontado"].includes(normalizedHeaders[2]);
if (!validHeaders) {
  throw new Error(`Encabezados inesperados: ${headers.join(", ")}`);
}

const outputDirectory = path.join(process.cwd(), "src", "data");
let currentProducts = [];
try {
  currentProducts = JSON.parse(
    await readFile(path.join(outputDirectory, "products.json"), "utf8"),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const currentByCode = new Map(
  currentProducts.filter((product) => product.code).map((product) => [product.code, product]),
);
const seenCodes = new Set();
let created = 0;
let updated = 0;

const sheetProducts = body
  .map(([code = "", article = "", rawPrice = ""], index) => {
    const name = article.trim();
    const price = parsePrice(rawPrice);
    const cleanCode = code.trim();
    if (!name && !cleanCode && price === null) return null;
    if (cleanCode && seenCodes.has(cleanCode)) {
      throw new Error(`El código ${cleanCode} está duplicado en el Sheet.`);
    }
    if (cleanCode) seenCodes.add(cleanCode);

    const existing = cleanCode ? currentByCode.get(cleanCode) : null;
    if (existing) {
      updated += 1;
      return {
        ...existing,
        name: name || existing.name,
        price,
        rawPrice: rawPrice.trim() || null,
        source: "google-sheet",
        sourceRow: index + 2,
        incomplete: existing.incomplete.filter(
          (item) => !["code", "price", "sheet-absent"].includes(item),
        ),
      };
    }

    created += 1;
    return {
      id: cleanCode || `fila-${index + 2}`,
      slug: `${slugify(name || `producto-${index + 2}`)}-${cleanCode || index + 2}`,
      code: cleanCode || null,
      name: name || "Producto sin nombre",
      price,
      rawPrice: rawPrice.trim() || null,
      category: inferCategory(name.toUpperCase()),
      brand: inferBrand(name.toUpperCase()),
      image: null,
      images: [],
      stock: 0,
      lowStockThreshold: 5,
      active: false,
      featured: false,
      description: null,
      variants: [],
      source: "google-sheet",
      sourceRow: index + 2,
      incomplete: [
        !cleanCode && "code",
        price === null && "price",
        "image",
        "stock",
        "description",
      ].filter(Boolean),
    };
  })
  .filter(Boolean);

// La planilla puede perder filas por un error humano o por una exportación
// parcial. Conservamos esos productos como borradores inactivos para no
// perder imágenes, fichas técnicas, URLs ni referencias históricas.
const retiredProducts = currentProducts
  .filter((product) => product.code && !seenCodes.has(product.code))
  .map((product) => ({
    ...product,
    active: false,
    featured: false,
    incomplete: [...new Set([...(product.incomplete || []), "sheet-absent"])],
  }));
const products = [...sheetProducts, ...retiredProducts];

const report = {
  source: url,
  importedAt: new Date().toISOString(),
  sheetRows: sheetProducts.length,
  rows: products.length,
  created,
  updated,
  retired: retiredProducts.length,
  missingCode: products.filter((product) => !product.code).length,
  missingPrice: products.filter((product) => product.price === null).length,
  missingImage: products.filter((product) => !product.image).length,
  simulatedStock: 0,
  categories: [...new Set(products.map((product) => product.category))].sort(),
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "products.json"),
  `${JSON.stringify(products, null, 2)}\n`,
);
await writeFile(
  path.join(outputDirectory, "import-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
