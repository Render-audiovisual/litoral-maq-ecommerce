const url = (process.env.E2E_SUPABASE_URL || "").trim().replace(/\/$/, "");
const key = (process.env.E2E_SUPABASE_PUBLISHABLE_KEY || "").trim();
const productionUrl = (process.env.PRODUCTION_SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");

if (Boolean(url) !== Boolean(key)) {
  throw new Error(
    "Staging incompleto: E2E_SUPABASE_URL y E2E_SUPABASE_PUBLISHABLE_KEY deben configurarse juntos.",
  );
}

if (!url) {
  console.log("E2E aislados en modo local; staging Supabase todavía no está configurado.");
  process.exit(0);
}

if (url === productionUrl) {
  throw new Error("Los E2E no pueden apuntar al proyecto Supabase de producción.");
}

const parsed = new URL(url);
if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
  throw new Error("E2E_SUPABASE_URL no es una URL válida de Supabase.");
}

console.log(`E2E configurados contra staging aislado: ${parsed.origin}`);
