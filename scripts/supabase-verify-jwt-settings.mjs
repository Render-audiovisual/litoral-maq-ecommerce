// CI de Supabase — después de un deploy, confirma que lo que quedó activo
// en el proyecto tiene el mismo verify_jwt que pide supabase/config.toml.
//
// La CLI ya debería respetar config.toml sola (nunca se le pasa
// --no-verify-jwt), pero esto lo confirma con el estado real del proyecto
// en vez de asumirlo: si alguna vez el comportamiento de la CLI cambia, o
// alguien tocó una función a mano desde el dashboard, esto lo detecta acá
// y no en el primer webhook que falla en producción.
//
// Uso:
//   node scripts/supabase-verify-jwt-settings.mjs --deployed <functions-list.json>
import { readFileSync } from "node:fs";
import { readVerifyJwtSections, readSupabaseConfig } from "./lib/supabase-config.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--deployed") args.deployed = argv[i + 1];
  }
  return args;
}

function main() {
  const { deployed } = parseArgs(process.argv.slice(2));
  if (!deployed) {
    console.error("FAIL  Falta --deployed <functions-list.json>.");
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(deployed, "utf8"));
  } catch (error) {
    console.error(`FAIL  No se pudo leer/parsear ${deployed}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const functions = Array.isArray(parsed.functions) ? parsed.functions : null;
  if (!functions) {
    console.error(`FAIL  ${deployed} no tiene la forma esperada ({"functions":[...]}).`);
    process.exitCode = 1;
    return;
  }

  const expected = readVerifyJwtSections(readSupabaseConfig());
  const deployedBySlug = new Map(functions.map((fn) => [fn.slug, fn]));

  const mismatches = [];
  for (const [slug, expectedValue] of Object.entries(expected)) {
    const live = deployedBySlug.get(slug);
    if (!live) continue; // no está desplegada todavía; no es un mismatch de verify_jwt
    if (live.verify_jwt !== expectedValue) {
      mismatches.push(
        `${slug}: config.toml pide verify_jwt=${expectedValue}, el proyecto tiene verify_jwt=${live.verify_jwt}.`,
      );
    }
    if (live.status !== "ACTIVE") {
      mismatches.push(`${slug}: quedó en estado "${live.status}" (se esperaba ACTIVE) tras el deploy.`);
    }
  }

  if (mismatches.length) {
    console.error(`FAIL  ${mismatches.length} función(es) no coinciden con supabase/config.toml:`);
    for (const line of mismatches) console.error(`  - ${line}`);
    process.exitCode = 1;
    return;
  }

  console.log(`OK  ${deployedBySlug.size} función(es) desplegadas coinciden con supabase/config.toml (verify_jwt y estado ACTIVE).`);
}

main();
