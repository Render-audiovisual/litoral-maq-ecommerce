import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import products from "../src/data/products.json" with { type: "json" };

const outDir = path.join(process.cwd(), "supabase", "seed");
const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

function sqlString(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return value === null || value === undefined ? "null" : String(value);
}

function sqlBool(value) {
  return value ? "true" : "false";
}

function sqlArray(values) {
  if (!values || values.length === 0) return "'{}'";
  const escaped = values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`);
  return `'{${escaped.join(",")}}'`;
}

function validate(product, index) {
  const problems = [];
  if (!product.id) problems.push("falta id");
  if (!product.slug) problems.push("falta slug");
  if (!product.code) problems.push("falta code");
  if (!product.name || !product.name.trim()) problems.push("falta name");
  if (product.price !== null && typeof product.price !== "number") problems.push("price inválido");
  if (typeof product.stock !== "number") problems.push("stock inválido");
  if (problems.length) {
    return `Producto en índice ${index} (id=${product.id ?? "?"}) con problemas: ${problems.join(", ")}.`;
  }
  return null;
}

function detectDuplicates(list, key) {
  const seen = new Map();
  const duplicates = [];
  for (const product of list) {
    const value = product[key];
    if (!value) continue;
    if (seen.has(value)) {
      duplicates.push(`${key}="${value}" repetido en ids ${seen.get(value)} y ${product.id}`);
    } else {
      seen.set(value, product.id);
    }
  }
  return duplicates;
}

function toInsertRow(product) {
  return `  (${[
    sqlString(product.id),
    sqlString(product.slug),
    sqlString(product.code ?? product.id),
    sqlString(product.name),
    sqlNumber(product.price),
    sqlString(product.rawPrice),
    sqlString(product.category),
    sqlString(product.brand),
    sqlString(product.image),
    sqlArray(product.images),
    sqlNumber(product.stock),
    sqlNumber(product.lowStockThreshold),
    sqlBool(product.active),
    sqlBool(product.featured),
    sqlString(product.description),
    sqlArray(product.variants),
    sqlString(product.source),
    sqlNumber(product.sourceRow),
    sqlArray(product.incomplete),
  ].join(", ")})`;
}

function toSupabaseRow(product) {
  return {
    id: product.id,
    slug: product.slug,
    code: product.code ?? product.id,
    name: product.name,
    price: product.price,
    raw_price: product.rawPrice,
    category: product.category,
    brand: product.brand,
    image: product.image,
    images: product.images ?? [],
    stock: product.stock,
    low_stock_threshold: product.lowStockThreshold,
    active: product.active,
    featured: product.featured,
    description: product.description,
    variants: product.variants ?? [],
    source: product.source,
    source_row: product.sourceRow,
    incomplete: product.incomplete ?? [],
  };
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

/**
 * --apply escribe en `products`, y la política RLS de esa tabla exige
 * is_admin() para insert/update (ver supabase/migrations/0003). La clave
 * publicable (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / *_ANON_KEY) NUNCA
 * puede escribir el catálogo — ni siquiera autenticada como cliente, porque
 * este script corre sin ninguna sesión de usuario detrás. Por eso usa una
 * variable de entorno PRIVADA, sin prefijo NEXT_PUBLIC_, que ningún código
 * de `src/` importa jamás: SUPABASE_SERVICE_ROLE_KEY. Es un script CLI
 * aislado pensado para que lo corra un humano de confianza localmente, no
 * para ejecutarse desde el navegador ni desde ninguna ruta de la app.
 */
async function applyToSupabase(usable) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    console.error("--apply requiere NEXT_PUBLIC_SUPABASE_URL en el entorno (la URL del proyecto no es secreta).");
    process.exitCode = 1;
    return;
  }
  if (!serviceRoleKey) {
    console.error(
      "--apply requiere SUPABASE_SERVICE_ROLE_KEY en el entorno — SIN prefijo NEXT_PUBLIC_, nunca la publicable " +
        "(las políticas RLS de products exigen is_admin(), y este script no tiene sesión de usuario). " +
        "Ejemplo: node --env-file=.env.migration.local scripts/prepare-products-migration.mjs --apply. " +
        "Ver supabase/README.md §5 y .env.migration.example.",
    );
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const rows = usable.map(toSupabaseRow);
  const batches = chunk(rows, 250);

  console.log(`Aplicando ${rows.length} productos contra Supabase en ${batches.length} lote(s)...`);
  let applied = 0;
  for (const batch of batches) {
    const { error, count } = await client.from("products").upsert(batch, { onConflict: "id", count: "exact" });
    if (error) {
      console.error(`Error aplicando lote (${applied}/${rows.length} aplicados hasta ahora):`, error.message);
      process.exitCode = 1;
      return;
    }
    applied += count ?? batch.length;
  }
  console.log(`Listo: ${applied} productos aplicados (upsert idempotente, sin duplicar).`);
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    totalProducts: products.length,
    validationErrors: [],
    duplicates: [],
  };

  products.forEach((product, index) => {
    const problem = validate(product, index);
    if (problem) report.validationErrors.push(problem);
  });

  report.duplicates.push(...detectDuplicates(products, "id"));
  report.duplicates.push(...detectDuplicates(products, "code"));
  report.duplicates.push(...detectDuplicates(products, "slug"));

  const usable = products.filter((product, index) => !validate(product, index));

  const sql = `-- Generado por scripts/prepare-products-migration.mjs — revisar y correr
-- manualmente (psql o el SQL editor de Supabase) una vez creado el
-- proyecto, o usar "--apply" para que este script lo haga por vos.
-- Idempotente: puede correrse más de una vez sin duplicar ni perder datos.
insert into public.products
  (id, slug, code, name, price, raw_price, category, brand, image, images,
   stock, low_stock_threshold, active, featured, description, variants,
   source, source_row, incomplete)
values
${usable.map(toInsertRow).join(",\n")}
on conflict (id) do update set
  slug = excluded.slug,
  code = excluded.code,
  name = excluded.name,
  price = excluded.price,
  raw_price = excluded.raw_price,
  category = excluded.category,
  brand = excluded.brand,
  image = excluded.image,
  images = excluded.images,
  stock = excluded.stock,
  low_stock_threshold = excluded.low_stock_threshold,
  active = excluded.active,
  featured = excluded.featured,
  description = excluded.description,
  variants = excluded.variants,
  source = excluded.source,
  source_row = excluded.source_row,
  incomplete = excluded.incomplete,
  updated_at = now();
`;

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "products.sql"), sql);
  await writeFile(path.join(outDir, "products-report.json"), JSON.stringify(report, null, 2));

  console.log(`Modo: ${shouldApply ? "APLICAR contra Supabase (--apply)" : "dry-run (por defecto, sin --apply)"}`);
  console.log(`Productos totales: ${report.totalProducts}`);
  console.log(`Productos aptos para migrar: ${usable.length}`);
  console.log(`Errores de validación: ${report.validationErrors.length}`);
  console.log(`Duplicados detectados: ${report.duplicates.length}`);
  if (report.validationErrors.length || report.duplicates.length) {
    console.log("Ver supabase/seed/products-report.json para el detalle. No se generó SQL para productos inválidos.");
  }
  console.log(`SQL escrito en supabase/seed/products.sql (${usable.length} filas).`);

  if (shouldApply) {
    await applyToSupabase(usable);
  } else {
    console.log("Dry-run: no se tocó ningún proyecto real. Agregá --apply para ejecutar contra Supabase.");
  }
}

await main();
