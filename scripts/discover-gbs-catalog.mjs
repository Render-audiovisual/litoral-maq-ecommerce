import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SEARCH_ENDPOINT =
  "https://gbs-corp.com/system/ajax/onlinecatalog-search-products.php";
const productsPath = path.join(process.cwd(), "src", "data", "products.json");
const outputPath = path.join(process.cwd(), "tmp", "gbs-catalog-candidates.json");

function normalize(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function modelCandidates(name) {
  const matches = normalize(name).match(
    /[A-Z]{1,8}[A-Z0-9]*(?:[\/-][A-Z0-9.]+)+|[A-Z]{1,8}\d[A-Z0-9.]{1,}(?:[\/-][A-Z0-9.]+)*/g,
  ) || [];

  return [...new Set(matches)]
    .filter((value) => !/^\d+(?:MM|CM|KG|W|V|HP|LTS?)$/.test(value))
    .sort((a, b) => b.length - a.length);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "LitoralMaqCatalogAudit/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function extractPageData(html, model) {
  const imageUrl = html.match(/<img\s+src="([^"]+)"\s+alt=/i)?.[1] || null;
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = html.match(
    new RegExp(
      `data-product-code="${escaped}"[\\s\\S]{0,220}?style="top:([\\d.]+)%;left:([\\d.]+)%;"`,
      "i",
    ),
  );
  const title = html.match(/<span class="header-page-title">([^<]+)<\/span>/i)?.[1]?.trim() || null;
  return {
    imageUrl,
    marker: marker ? { topPercent: Number(marker[1]), leftPercent: Number(marker[2]) } : null,
    pageTitle: title,
  };
}

async function inspectProduct(product) {
  const models = modelCandidates(product.name);
  for (const model of models) {
    const searchUrl = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(model)}&limit=40`;
    const payload = JSON.parse(await fetchText(searchUrl));
    const exactRows = (payload.items || []).filter(
      (row) => normalize(row.productCode) === normalize(model),
    );
    if (!exactRows.length) continue;

    const pages = [];
    const seen = new Set();
    for (const row of exactRows) {
      const cleanUrl = row.url.split("?")[0];
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);
      const html = await fetchText(row.url);
      pages.push({
        catalog: row.catalog,
        pageOrder: row.pageOrder,
        url: row.url,
        ...extractPageData(html, model),
      });
    }

    return {
      productId: product.id,
      productName: product.name,
      currentBrand: product.brand,
      currentImage: product.image,
      currentDescription: product.description,
      model,
      match: "exact_model",
      pages,
    };
  }

  return null;
}

async function runPool(items, worker, concurrency = 4) {
  const output = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        const value = await worker(items[index]);
        if (value) output.push(value);
      } catch (error) {
        output.push({
          productId: items[index].id,
          productName: items[index].name,
          match: "lookup_error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return output;
}

const products = JSON.parse(await readFile(productsPath, "utf8"));
const candidates = products.filter(
  (product) => !product.image && modelCandidates(product.name).length > 0,
);
const results = await runPool(candidates, inspectProduct);
results.sort((a, b) => String(a.productId).localeCompare(String(b.productId), "es", { numeric: true }));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "https://gbs-corp.com/system/onlinecatalogs/HOME",
      catalogProducts: products.length,
      missingImages: products.filter((product) => !product.image).length,
      productsWithModelCandidate: candidates.length,
      exactMatches: results.filter((result) => result.match === "exact_model").length,
      lookupErrors: results.filter((result) => result.match === "lookup_error").length,
      results,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      outputPath,
      catalogProducts: products.length,
      missingImages: products.filter((product) => !product.image).length,
      productsWithModelCandidate: candidates.length,
      exactMatches: results.filter((result) => result.match === "exact_model").length,
      lookupErrors: results.filter((result) => result.match === "lookup_error").length,
    },
    null,
    2,
  ),
);
