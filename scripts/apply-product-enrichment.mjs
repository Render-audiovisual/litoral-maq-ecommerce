import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const candidatesPath = process.argv[2];
if (!candidatesPath) {
  throw new Error("Indicá el JSON de coincidencias verificadas como primer argumento.");
}

const productsPath = path.join(process.cwd(), "src", "data", "products.json");
const sourcesPath = path.join(process.cwd(), "src", "data", "product-enrichment-sources.json");
const products = JSON.parse(await readFile(productsPath, "utf8"));
const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));
const productsById = new Map(products.map((product) => [product.id, product]));

function decodeEntities(value) {
  return value
    .replaceAll("&mdash;", "—")
    .replaceAll("&ndash;", "–")
    .replaceAll("&Prime;", "″")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ");
}

function cleanDescription(value) {
  if (!value) return null;
  const stopRules = [
    /compar[aá] y ahorr[aá]/i,
    /env[ií]os y beneficios/i,
    /^sku\s*:/i,
    /^compartir$/i,
    /mercadolibre/i,
    /pagando con transferencia/i,
  ];
  const parts = decodeEntities(value)
    .replace(/^descripci[oó]n\s*[·:-]\s*/i, "")
    .split("·")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const selected = [];
  for (const part of parts) {
    if (stopRules.some((rule) => rule.test(part))) break;
    selected.push(part.replace(/[.;:,\s]+$/, ""));
  }
  const description = selected.join(". ").replace(/\.{2,}/g, ".").trim();
  if (description.length < 60) return null;
  if (description.length <= 900) return `${description.replace(/[.\s]+$/, "")}.`;
  const shortened = description.slice(0, 900);
  const lastStop = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("; "));
  return `${shortened.slice(0, lastStop > 500 ? lastStop : 900).replace(/[.\s]+$/, "")}.`;
}

function inferVerifiedBrand(candidate, product) {
  const haystack = `${product.name} ${candidate.title || ""} ${candidate.brand || ""} ${candidate.loc || ""}`.toUpperCase();
  if (/\bFOREST(?:\s*&\s*GARDEN|\s+GARDEN)?\b/.test(haystack)) return "FOREST & GARDEN";
  if (/\bKNO(?:CK|CT)\s+OUT\b/.test(haystack)) return "KNOCK OUT";
  if (/\b(?:E|N)NERGY\s+NEXT\b/.test(haystack)) return "ENERGY NEXT";
  if (/\bNEO\s+NEXT\b/.test(haystack)) return "NEO NEXT";
  if (/\bGLADIATOR\s+PRO\b/.test(haystack)) return "GLADIATOR PRO";
  if (/\bBLACK\s*(?:&|AND)\s*WHITE\b/.test(haystack)) return "BLACK & WHITE";
  if (/\bGLADIATOR\b/.test(haystack)) return "GLADIATOR";
  if (/\bENERGY\b/.test(haystack)) return "ENERGY";
  if (/\bNEO\b/.test(haystack)) return "NEO";
  if (/\bOBRA\b/.test(haystack)) return "OBRA";
  return product.brand;
}

function hasSpecificationConflict(candidate, product) {
  const sourceText = `${candidate.title || ""} ${candidate.description || ""}`;
  const checks = [
    [/(\d{3,4})\s*W\b/gi, "potencia"],
    [/(\d{2,3})\s*BAR\b/gi, "presión"],
    [/(\d{2,4})\s*N\/?M\b/gi, "torque"],
  ];
  const conflicts = [];
  for (const [rule, field] of checks) {
    const expected = [...product.name.matchAll(rule)].map((match) => match[1]);
    if (!expected.length) continue;
    rule.lastIndex = 0;
    const documented = [...sourceText.matchAll(rule)].map((match) => match[1]);
    if (documented.length && !expected.some((value) => documented.includes(value))) {
      conflicts.push(field);
    }
  }
  return conflicts;
}

const sources = [];
let imagesAdded = 0;
let descriptionsAdded = 0;
let brandsCorrected = 0;
let conflictsSkipped = 0;

for (const product of products) {
  const inferredBrand = inferVerifiedBrand({}, product);
  if (inferredBrand !== product.brand) {
    product.brand = inferredBrand;
    brandsCorrected += 1;
  }
}

for (const candidate of candidates) {
  const product = productsById.get(candidate.id);
  if (!product || !candidate.localImage || !candidate.code) continue;
  const normalizedName = product.name.toUpperCase().replace(/\s+/g, "");
  const normalizedCode = candidate.code.toUpperCase().replace(/\s+/g, "");
  if (!normalizedName.includes(normalizedCode)) continue;

  const conflicts = hasSpecificationConflict(candidate, product);
  if (conflicts.length) {
    if (product.image === candidate.localImage) {
      product.image = null;
      product.images = [];
      product.incomplete = Array.from(new Set([...product.incomplete, "image", "description"]));
    }
    conflictsSkipped += 1;
    sources.push({
      productId: product.id,
      model: candidate.code,
      match: "conflicting_specification",
      productSourceUrl: candidate.loc,
      imageSourceUrl: candidate.images[0],
      localImage: null,
      descriptionImported: false,
      conflictsSkipped: conflicts,
      verifiedAt: "2026-08-27",
    });
    continue;
  }

  product.image = candidate.localImage;
  product.images = [candidate.localImage];
  product.incomplete = product.incomplete.filter((item) => item !== "image");
  imagesAdded += 1;

  const verifiedBrand = inferVerifiedBrand(candidate, product);
  if (verifiedBrand !== product.brand) {
    product.brand = verifiedBrand;
    brandsCorrected += 1;
  }

  const description = cleanDescription(candidate.description);
  if (description) {
    product.description = description;
    product.incomplete = product.incomplete.filter((item) => item !== "description");
    descriptionsAdded += 1;
  }

  sources.push({
    productId: product.id,
    model: candidate.code,
    match: "exact_model",
    productSourceUrl: candidate.loc,
    imageSourceUrl: candidate.images[0],
    localImage: candidate.localImage,
    descriptionImported: Boolean(description),
    conflictsSkipped: conflicts,
    verifiedAt: "2026-08-27",
  });
}

await writeFile(productsPath, `${JSON.stringify(products, null, 2)}\n`);
await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);
console.log(JSON.stringify({ imagesAdded, descriptionsAdded, brandsCorrected, conflictsSkipped, sources: sources.length }, null, 2));
