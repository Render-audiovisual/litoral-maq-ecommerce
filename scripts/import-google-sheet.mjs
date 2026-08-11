import { mkdir, writeFile } from "node:fs/promises";
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

function imageFor(name) {
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

const products = body
  .map(([code = "", article = "", rawPrice = ""], index) => {
    const name = article.trim();
    const price = parsePrice(rawPrice);
    const cleanCode = code.trim();
    if (!name && !cleanCode && price === null) return null;
    return {
      id: cleanCode || `fila-${index + 2}`,
      slug: `${slugify(name || `producto-${index + 2}`)}-${cleanCode || index + 2}`,
      code: cleanCode || null,
      name: name || "Producto sin nombre",
      price,
      rawPrice: rawPrice.trim() || null,
      category: inferCategory(name.toUpperCase()),
      brand: inferBrand(name.toUpperCase()),
      image: imageFor(name.toUpperCase()),
      images: imageFor(name.toUpperCase()) ? [imageFor(name.toUpperCase())] : [],
      stock: 8 + ((index * 17) % 46),
      lowStockThreshold: 5,
      active: true,
      featured: Boolean(imageFor(name.toUpperCase())) && index < 220,
      description: null,
      variants: [],
      source: "google-sheet",
      sourceRow: index + 2,
      incomplete: [
        !cleanCode && "code",
        price === null && "price",
        !imageFor(name.toUpperCase()) && "image",
        "stock",
        "description",
      ].filter(Boolean),
    };
  })
  .filter(Boolean);

const report = {
  source: url,
  importedAt: new Date().toISOString(),
  rows: products.length,
  missingCode: products.filter((product) => !product.code).length,
  missingPrice: products.filter((product) => product.price === null).length,
  missingImage: products.filter((product) => !product.image).length,
  simulatedStock: products.length,
  categories: [...new Set(products.map((product) => product.category))].sort(),
};

const outputDirectory = path.join(process.cwd(), "src", "data");
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
