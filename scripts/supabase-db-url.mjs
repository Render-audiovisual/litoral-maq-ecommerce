// CI de Supabase — arma la URL de conexión a la base por el pooler.
//
// Por qué no --project-ref + --password: eso conecta a db.<ref>.supabase.co,
// que en este proyecto solo tiene registro IPv6 (sin registro A). Los runners
// de GitHub Actions solo salen por IPv4, así que la conexión directa nunca
// llega. El pooler (session mode, puerto 5432) sí responde por IPv4 y acepta
// los mismos comandos de la CLI (migration list, db push).
//
// La contraseña llega por entorno y sale percent-encoded: una contraseña con
// @, / o # rompería la URL sin ese paso.
const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;
const host = process.env.SUPABASE_POOLER_HOST || "aws-0-sa-east-1.pooler.supabase.com";

if (!ref || !password) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_DB_PASSWORD (secret del Environment production).");
  process.exit(1);
}

const encoded = encodeURIComponent(password);
const url = `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`;

// GitHub solo enmascara el valor exacto del secret; la forma percent-encoded
// puede ser distinta, así que se registra la máscara a mano ANTES de exportar.
console.log(`::add-mask::${encoded}`);
console.log(`::add-mask::${url}`);

// En CI se exporta como DB_URL para los pasos siguientes del mismo job. Fuera
// de CI (prueba local) se imprime la URL enmascarada a mano por quien la corre.
import { appendFileSync } from "node:fs";
if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `DB_URL=${url}
`);
  console.log("DB_URL exportada al entorno del job.");
} else {
  console.log(url);
}
