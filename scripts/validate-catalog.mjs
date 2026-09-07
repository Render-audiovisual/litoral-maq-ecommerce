import products from "../src/data/products.json" with { type: "json" };

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/17Y7jES70K_Gr-nQO6Om5PtRFu7nnNObDlbsRsXLdIrA/export?format=csv&gid=0";

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
      rows.push(row);
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

const normalize = (value) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

function duplicates(values) {
  const counts = new Map();
  for (const value of values) {
    const key = normalize(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1);
}

const currentProducts = products.filter(
  (product) => !(product.incomplete || []).includes("sheet-absent"),
);
const retiredProducts = products.filter(
  (product) => (product.incomplete || []).includes("sheet-absent"),
);
const duplicateImportedCodes = duplicates(products.map((product) => product.code));
const productsMissingCodeNameOrPrice = products.filter(
  (product) =>
    !product.code ||
    !product.name.trim() ||
    typeof product.price !== "number" ||
    !Number.isFinite(product.price),
).length;
const activeRetiredProducts = retiredProducts.filter((product) => product.active).length;
const committedCatalogIsValid =
  duplicateImportedCodes.length === 0 &&
  productsMissingCodeNameOrPrice === 0 &&
  activeRetiredProducts === 0;

if (!process.argv.includes("--live")) {
  const result = {
    mode: "committed-catalog",
    importedProducts: products.length,
    currentProducts: currentProducts.length,
    retiredProducts: retiredProducts.length,
    activeRetiredProducts,
    duplicateImportedCodes,
    duplicateImportedNames: duplicates(products.map((product) => product.name)),
    productsMissingCodeNameOrPrice,
    verdict: committedCatalogIsValid ? "PASS" : "FAIL",
  };

  console.log(JSON.stringify(result, null, 2));
  if (result.verdict !== "PASS") process.exitCode = 1;
} else {
const response = await fetch(SHEET_URL);
if (!response.ok) throw new Error(`No se pudo leer el Sheet: ${response.status}`);
const rows = parseCsv(await response.text());
const [header, ...sourceRows] = rows;
const emptyRows = sourceRows.filter((row) => row.every((value) => !value.trim()));
const nonEmptyRows = sourceRows.filter((row) => row.some((value) => value.trim()));
const repeatedHeaders = nonEmptyRows.filter(
  ([code, article, price]) =>
    normalize(code) === "CODIGO" &&
    normalize(article) === "ARTICULO" &&
    normalize(price) === "PRECIO",
);
const invalidRows = nonEmptyRows.filter(([code, article, price]) => {
  return !code?.trim() || !article?.trim() || parsePrice(price || "") === null;
});

const productsByCode = new Map(products.map((product) => [normalize(product.code), product]));
const mismatches = [];
for (let index = 0; index < nonEmptyRows.length; index += 1) {
  const [code, article, rawPrice] = nonEmptyRows[index];
  const product = productsByCode.get(normalize(code));
  if (
    !product ||
    normalize(product.code) !== normalize(code) ||
    normalize(product.name) !== normalize(article) ||
    product.price !== parsePrice(rawPrice)
  ) {
    mismatches.push({ sourceRow: index + 2, code, product: product?.code });
  }
}

const result = {
  mode: "live-sheet-reconciliation",
  header,
  csvRecordsIncludingHeader: rows.length,
  sourceProductRows: nonEmptyRows.length,
  importedProducts: products.length,
  currentProducts: currentProducts.length,
  retiredProducts: retiredProducts.length,
  activeRetiredProducts,
  emptyRowsInsideExportedRange: emptyRows.length,
  repeatedHeaders: repeatedHeaders.length,
  invalidRows: invalidRows.length,
  duplicateSourceCodes: duplicates(nonEmptyRows.map(([code]) => code)),
  duplicateSourceNames: duplicates(nonEmptyRows.map(([, name]) => name)),
  duplicateImportedCodes,
  duplicateImportedNames: duplicates(products.map((product) => product.name)),
  productsMissingCodeNameOrPrice,
  sourceToImportMismatches: mismatches,
  verdict:
    nonEmptyRows.length === currentProducts.length &&
    invalidRows.length === 0 &&
    repeatedHeaders.length === 0 &&
    duplicates(nonEmptyRows.map(([code]) => code)).length === 0 &&
    committedCatalogIsValid &&
    retiredProducts.every((product) => !product.active) &&
    mismatches.length === 0
      ? "PASS"
      : "FAIL",
};

console.log(JSON.stringify(result, null, 2));
if (result.verdict !== "PASS") process.exitCode = 1;
}
