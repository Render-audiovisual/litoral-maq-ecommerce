// CI de Supabase — decide si hay migraciones para aplicar, y corta en seco
// si el historial de producción no coincide con los archivos del repo.
//
// No corre nada contra la base: lee el JSON que ya generó
// `supabase migration list --output-format json` (se lo pasa el workflow,
// que es quien tiene las credenciales) y lo compara contra
// supabase/migrations/. Deliberadamente separado del comando de la CLI para
// poder probar esta lógica con un JSON de ejemplo, sin tocar producción.
//
// Uso:
//   node scripts/supabase-plan-migrations.mjs --migration-list <archivo.json>
import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--migration-list") args.migrationList = argv[i + 1];
  }
  return args;
}

function findMigrationFile(version) {
  const entries = readdirSync(migrationsDir);
  return entries.find((name) => name === `${version}.sql` || name.startsWith(`${version}_`)) ?? null;
}

function main() {
  const { migrationList } = parseArgs(process.argv.slice(2));
  if (!migrationList) {
    console.error("FAIL  Falta --migration-list <archivo.json>.");
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(migrationList, "utf8"));
  } catch (error) {
    console.error(`FAIL  No se pudo leer/parsear ${migrationList}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const entries = Array.isArray(parsed.migrations) ? parsed.migrations : null;
  if (!entries) {
    console.error(`FAIL  ${migrationList} no tiene la forma esperada ({"migrations":[...]})."`);
    process.exitCode = 1;
    return;
  }

  const remoteOnly = entries.filter((entry) => entry.remote && !entry.local);
  const pendingLocal = entries.filter((entry) => entry.local && !entry.remote);

  if (remoteOnly.length > 0) {
    console.error(
      "FAIL  Producción tiene migraciones aplicadas que no existen en supabase/migrations/ del repo:",
    );
    for (const entry of remoteOnly) console.error(`  - ${entry.remote} (${entry.time || "sin fecha"})`);
    console.error("");
    console.error(
      "Esto pasa cuando algo se aplicó directo a producción (dashboard, MCP, CLI suelta) sin pasar por un commit.",
    );
    console.error("No se puede seguir así sin arreglar el historial primero. Opciones:");
    console.error(
      "  1) Si esos cambios ya están reflejados en algún archivo de supabase/migrations/ con OTRO nombre:",
    );
    console.error(
      `     supabase migration repair --status applied ${remoteOnly.map((entry) => entry.remote).join(" ")}`,
    );
    console.error("     (marca esas versiones remotas como resueltas sin volver a ejecutarlas).");
    console.error("  2) Si no hay archivo local equivalente, traé el estado real de producción:");
    console.error("     supabase db pull");
    console.error("     (genera el/los archivo(s) de migración que faltan, para commitear).");
    console.error("");
    console.error("Ninguna de las dos opciones es automática: hay que decidir cuál corresponde y commitear el resultado.");
    process.exitCode = 1;
    return;
  }

  const pendingFiles = [];
  for (const entry of pendingLocal) {
    const file = findMigrationFile(entry.local);
    if (!file) {
      console.error(
        `FAIL  ${entry.local} figura como migración local pendiente pero no encontré el archivo en supabase/migrations/.`,
      );
      process.exitCode = 1;
      return;
    }
    pendingFiles.push(path.join("supabase", "migrations", file));
  }

  if (pendingFiles.length === 0) {
    console.log("No hay migraciones pendientes: producción ya tiene aplicado todo lo que hay en el repo.");
  } else {
    console.log(`Migraciones pendientes de aplicar (${pendingFiles.length}):`);
    for (const file of pendingFiles) console.log(`  - ${file}`);
  }

  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    appendFileSync(
      outFile,
      [
        `has_pending_migrations=${pendingFiles.length > 0}`,
        `pending_migration_files=${JSON.stringify(pendingFiles)}`,
        "",
      ].join("\n"),
    );
  }
}

main();
