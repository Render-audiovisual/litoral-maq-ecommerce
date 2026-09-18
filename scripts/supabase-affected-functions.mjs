// CI de Supabase — calcula qué Edge Functions hay que redesplegar.
//
// Una función está afectada si cambió alguno de sus propios archivos, o si
// cambió cualquier archivo de _shared que ella importe (directa o
// transitivamente: ej. mercado-pago-webhook usa order-notifications.ts, que a
// su vez usa order-email.ts — tocar order-email.ts afecta a las dos). El
// grafo de dependencias se arma leyendo los imports reales del código, nunca
// una lista escrita a mano: así no se desactualiza cuando alguien agrega un
// import nuevo.
//
// Uso:
//   node scripts/supabase-affected-functions.mjs --base <git-ref>
//
// Si --base no resuelve a un commit real (primera corrida del pipeline, tag
// de "último deploy" inexistente, etc.) se asume el caso más seguro: TODAS
// las funciones están afectadas. Es mejor redesplegar de más una vez que
// dejar algo desincronizado en producción por un falso negativo del diff.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const functionsDir = path.join(root, "supabase", "functions");
const sharedDir = path.join(functionsDir, "_shared");

function parseArgs(argv) {
  const args = { base: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base") args.base = argv[i + 1] || "";
  }
  return args;
}

function listFunctionSlugs() {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

/** Imports relativos ("../_shared/x.ts" o "./x.ts") de un archivo .ts. */
function localImportsOf(filePath) {
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const matches = [...source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)];
  return matches.map((match) => match[1]);
}

/** Resuelve un import relativo a una ruta de _shared/ normalizada tipo "http.ts". */
function resolveSharedPath(fromFile, importSpecifier) {
  const resolved = path.normalize(
    path.join(path.dirname(fromFile), importSpecifier),
  );
  const relativeToShared = path.relative(sharedDir, resolved).split(path.sep).join("/");
  if (relativeToShared.startsWith("..")) return null; // no es de _shared
  return relativeToShared;
}

/** Cierre transitivo de dependencias de _shared para un archivo _shared/X dado. */
function sharedTransitiveClosure(startRelPath, cache = new Map()) {
  if (cache.has(startRelPath)) return cache.get(startRelPath);
  const closure = new Set([startRelPath]);
  cache.set(startRelPath, closure); // corta ciclos antes de recursar
  const filePath = path.join(sharedDir, startRelPath);
  for (const spec of localImportsOf(filePath)) {
    const resolved = resolveSharedPath(filePath, spec);
    if (!resolved) continue;
    for (const dep of sharedTransitiveClosure(resolved, cache)) closure.add(dep);
  }
  return closure;
}

/** slug de función -> Set de rutas relativas de _shared/ de las que depende (transitivo). */
function buildDependencyGraph(slugs) {
  const cache = new Map();
  const graph = new Map();
  for (const slug of slugs) {
    const entrypoint = path.join(functionsDir, slug, "index.ts");
    const deps = new Set();
    for (const spec of localImportsOf(entrypoint)) {
      const resolved = resolveSharedPath(entrypoint, spec);
      if (!resolved) continue;
      for (const dep of sharedTransitiveClosure(resolved, cache)) deps.add(dep);
    }
    graph.set(slug, deps);
  }
  return graph;
}

function refExists(ref) {
  if (!ref) return false;
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function changedFilesSince(base) {
  const output = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    encoding: "utf8",
  });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function main() {
  const { base } = parseArgs(process.argv.slice(2));
  const slugs = listFunctionSlugs();
  const graph = buildDependencyGraph(slugs);

  const usedFallback = !refExists(base);
  let changedFiles = [];
  if (!usedFallback) changedFiles = changedFilesSince(base);

  const supabasePrefix = "supabase/";
  const migrationsPrefix = "supabase/migrations/";
  const configPath = "supabase/config.toml";
  const functionsPrefix = "supabase/functions/";
  const sharedPrefix = "supabase/functions/_shared/";

  const changedShared = new Set(
    changedFiles
      .filter((file) => file.startsWith(sharedPrefix))
      .map((file) => file.slice(sharedPrefix.length)),
  );
  const changedFunctionSlugs = new Set(
    changedFiles
      .filter((file) => file.startsWith(functionsPrefix) && !file.startsWith(sharedPrefix))
      .map((file) => file.slice(functionsPrefix.length).split("/")[0])
      .filter((slug) => slugs.includes(slug)),
  );
  const migrationsChanged = changedFiles.some((file) => file.startsWith(migrationsPrefix));
  const configChanged = changedFiles.includes(configPath);

  let affected;
  if (usedFallback) {
    affected = new Set(slugs);
  } else {
    affected = new Set(changedFunctionSlugs);
    for (const slug of slugs) {
      const deps = graph.get(slug) ?? new Set();
      for (const dep of changedShared) {
        if (deps.has(dep)) {
          affected.add(slug);
          break;
        }
      }
    }
  }

  const result = {
    base: usedFallback ? null : base,
    fallback: usedFallback,
    functions: [...affected].sort(),
    migrationsChanged: usedFallback ? true : migrationsChanged,
    configChanged: usedFallback ? true : configChanged,
    supabaseTouched: usedFallback
      ? true
      : changedFiles.some((file) => file.startsWith(supabasePrefix)),
  };

  console.log(
    usedFallback
      ? `Sin punto de comparación válido ("${base || "(vacío)"}"): se asume que TODO Supabase está afectado.`
      : `Comparando contra ${base}: ${changedFiles.length} archivo(s) cambiado(s) en total.`,
  );
  console.log(`Funciones afectadas (${result.functions.length}): ${result.functions.join(", ") || "(ninguna)"}`);
  console.log(`Migraciones cambiadas: ${result.migrationsChanged ? "sí" : "no"}`);
  console.log(`config.toml cambiado: ${result.configChanged ? "sí" : "no"}`);

  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    const lines = [
      `functions=${JSON.stringify(result.functions)}`,
      `functions_count=${result.functions.length}`,
      `migrations_changed=${result.migrationsChanged}`,
      `config_changed=${result.configChanged}`,
      `supabase_touched=${result.supabaseTouched}`,
      `fallback=${result.fallback}`,
    ];
    appendFileSync(outFile, `${lines.join("\n")}\n`);
  }
}

main();
