// Parser mínimo de supabase/config.toml, compartido por los scripts de CI
// de Supabase. El archivo solo usa secciones "[bloque]" y líneas
// "clave = valor" (booleanos o strings) — nada de arrays ni tablas
// anidadas — así que no hace falta sumar una dependencia de TOML para esto.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function parseToml(text) {
  // "(root)" junta las claves sueltas antes de la primera sección (ej.
  // project_id): son válidas en TOML, este parser no las valida más allá.
  const sections = { "(root)": {} };
  let current = "(root)";
  const lines = text.split("\n");
  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) return;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      sections[current] ??= {};
      return;
    }
    const kvMatch = line.match(/^([\w.-]+)\s*=\s*(.+)$/);
    if (!kvMatch) {
      throw new Error(`Línea ${index + 1} no reconocida en config.toml: "${rawLine}"`);
    }
    sections[current][kvMatch[1]] = kvMatch[2].trim();
  });
  return sections;
}

export function parseBoolean(raw, context) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${context}: se esperaba true/false, se encontró "${raw}".`);
}

/** slug -> true/false, solo para las funciones que tienen [functions.<slug>] con verify_jwt válido. */
export function readVerifyJwtSections(sections) {
  const result = {};
  for (const [sectionName, values] of Object.entries(sections)) {
    const match = sectionName.match(/^functions\.(.+)$/);
    if (!match) continue;
    const slug = match[1];
    if (!("verify_jwt" in values)) continue;
    result[slug] = parseBoolean(values.verify_jwt, `[functions.${slug}].verify_jwt`);
  }
  return result;
}

export function listFunctionSlugs(root = process.cwd()) {
  const functionsDir = path.join(root, "supabase", "functions");
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

export function readSupabaseConfig(root = process.cwd()) {
  const configPath = path.join(root, "supabase", "config.toml");
  return parseToml(readFileSync(configPath, "utf8"));
}
