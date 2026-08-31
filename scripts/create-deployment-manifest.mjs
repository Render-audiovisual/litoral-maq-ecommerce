import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "src", "data", "products.json");
const catalogBytes = await readFile(catalogPath);
const products = JSON.parse(catalogBytes.toString("utf8"));

const manifest = {
  commit: process.env.DEPLOY_COMMIT || "local",
  ref: process.env.DEPLOY_REF || "local",
  runId: process.env.DEPLOY_RUN_ID || null,
  catalog: {
    path: "src/data/products.json",
    sha256: createHash("sha256").update(catalogBytes).digest("hex"),
    total: products.length,
    active: products.filter((product) => product.active).length,
  },
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(root, "deployment-manifest.json"), serialized);

console.log(
  `Artefactos firmados: commit ${manifest.commit}, catálogo ${manifest.catalog.sha256}, ` +
    `${manifest.catalog.active}/${manifest.catalog.total} activos.`,
);
