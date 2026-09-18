// CI de Supabase — valida supabase/config.toml sin tocar producción.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseToml, parseBoolean, listFunctionSlugs } from "./lib/supabase-config.mjs";

const root = process.cwd();
const functionsDir = path.join(root, "supabase", "functions");

function main() {
  const failures = [];
  const warnings = [];

  let sections;
  try {
    sections = parseToml(readFileSync(path.join(root, "supabase", "config.toml"), "utf8"));
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const slugs = listFunctionSlugs(root);
  const declaredSlugs = new Set();
  const verifyJwtBySlug = {};

  for (const [sectionName, values] of Object.entries(sections)) {
    const match = sectionName.match(/^functions\.(.+)$/);
    if (!match) continue; // otras secciones (db.seed, auth, etc.) no son de funciones
    const slug = match[1];
    declaredSlugs.add(slug);
    if (!slugs.includes(slug)) {
      failures.push(
        `[functions.${slug}] no corresponde a ninguna carpeta en supabase/functions/ (¿función renombrada o borrada?).`,
      );
      continue;
    }
    if (!("verify_jwt" in values)) {
      failures.push(`[functions.${slug}] no define verify_jwt.`);
      continue;
    }
    try {
      verifyJwtBySlug[slug] = parseBoolean(values.verify_jwt, `[functions.${slug}].verify_jwt`);
    } catch (error) {
      failures.push(error.message);
    }
  }

  for (const slug of slugs) {
    const hasEntrypoint = (() => {
      try {
        readFileSync(path.join(functionsDir, slug, "index.ts"));
        return true;
      } catch {
        return false;
      }
    })();
    if (!hasEntrypoint) {
      failures.push(`supabase/functions/${slug}/ no tiene index.ts (entrypoint requerido por el deploy).`);
    }
    if (!declaredSlugs.has(slug)) {
      // No es un error: sin sección propia, la CLI aplica el default seguro
      // (verify_jwt = true). Pero vale la pena que quede a la vista.
      warnings.push(`${slug} no tiene [functions.${slug}] en config.toml; se desplegará con verify_jwt = true (default de la CLI).`);
    }
  }

  console.log(`Funciones detectadas: ${slugs.length}. Declaradas en config.toml: ${declaredSlugs.size}.`);
  for (const slug of slugs) {
    const declared = slug in verifyJwtBySlug ? String(verifyJwtBySlug[slug]) : "true (default)";
    console.log(`  ${slug}: verify_jwt = ${declared}`);
  }
  for (const warning of warnings) console.warn(`WARN  ${warning}`);

  if (failures.length) {
    console.log("");
    for (const failure of failures) console.error(`FAIL  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nconfig.toml OK.");
  }
}

main();
