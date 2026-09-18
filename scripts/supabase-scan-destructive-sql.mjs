// CI de Supabase — marca si alguna migración pendiente puede borrar datos.
//
// Es deliberadamente angosto: solo mira operaciones que pierden datos de
// verdad (DROP TABLE/COLUMN/SCHEMA/DATABASE, TRUNCATE). Cosas como
// "drop policy if exists" o "drop function" NO entran acá — son moneda
// corriente en cualquier migración de Supabase que retoca RLS o funciones,
// y no pierden ni una fila. Si esto marcara esos casos como "destructivos",
// el gate de aprobación manual se dispararía todo el tiempo y en la
// práctica dejaría de significar algo.
//
// Uso:
//   node scripts/supabase-scan-destructive-sql.mjs archivo1.sql archivo2.sql ...
import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";

const DESTRUCTIVE_PATTERNS = [
  { label: "DROP TABLE", regex: /\bdrop\s+table\b/i },
  { label: "DROP COLUMN", regex: /\bdrop\s+column\b/i },
  { label: "DROP SCHEMA", regex: /\bdrop\s+schema\b/i },
  { label: "DROP DATABASE", regex: /\bdrop\s+database\b/i },
  { label: "TRUNCATE", regex: /\btruncate\b/i },
];

function scanFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const hits = [];
  lines.forEach((line, index) => {
    const withoutComment = line.replace(/--.*/, "");
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.regex.test(withoutComment)) {
        hits.push({ file: filePath, line: index + 1, pattern: pattern.label, text: line.trim() });
      }
    }
  });
  return hits;
}

function main() {
  const files = process.argv.slice(2);
  const allHits = files.flatMap(scanFile);

  if (allHits.length === 0) {
    console.log(files.length ? `Ninguna operación destructiva en ${files.length} archivo(s) de migración.` : "No hay migraciones pendientes para escanear.");
  } else {
    console.log(`Se detectaron ${allHits.length} operación(es) potencialmente destructivas:`);
    for (const hit of allHits) {
      console.log(`  ${hit.file}:${hit.line}  [${hit.pattern}]  ${hit.text}`);
    }
  }

  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    const summary = allHits
      .map((hit) => `${hit.file}:${hit.line} [${hit.pattern}]`)
      .join("; ");
    appendFileSync(
      outFile,
      `has_destructive=${allHits.length > 0}\ndestructive_summary=${summary}\n`,
    );
  }
}

main();
