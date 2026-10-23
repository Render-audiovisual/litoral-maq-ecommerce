// Solo lectura. Pide cada tabla pública por REST con la clave pública y cuenta filas devueltas.
// Uso: NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... node scripts/audit-anon-rls.mjs
// Opcional: AUDIT_ACCESS_TOKEN=<jwt de un cliente de prueba> para auditar como ese usuario (sin él, anon).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}
const token = process.env.AUDIT_ACCESS_TOKEN;
const headers = { apikey: key, Authorization: `Bearer ${token ?? key}` };

const tables = [
  "profiles", "products", "orders", "carts", "audit_log", "payments", "payment_events",
  "shipping_quotes", "shipping_shipments", "shipping_events", "order_notification_outbox",
  "catalog_sync_runs", "system_heartbeat", "system_alerts", "customer_checkout_details",
  "welcome_discount_claims",
];
// Funciones que no deben dar datos a anon.
const rpcs = ["admin_set_role", "admin_set_user_active"];

console.log(`Rol: ${token ? "authenticated (token)" : "anon"}\n`);
let leaks = 0;
for (const t of tables) {
  const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=5`, { headers });
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body) ? body.length : "-";
  console.log(`${t.padEnd(28)} HTTP ${res.status}  filas=${rows}${!Array.isArray(body) ? `  ${body?.message ?? ""}` : ""}`);
  if (Array.isArray(body) && body.length && t === "products") {
    console.log(`  columnas visibles: ${Object.keys(body[0]).join(", ")}`);
  } else if (Array.isArray(body) && body.length && !token) {
    leaks++;
  }
}
for (const f of rpcs) {
  const res = await fetch(`${url}/rest/v1/rpc/${f}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(f === "admin_set_role" ? { target_email: "x@x.x", new_role: "customer" } : { target_email: "x@x.x", active: true }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`rpc ${f.padEnd(24)} HTTP ${res.status}  ${body?.message ?? ""}`);
}
console.log(leaks ? `\nFUGA: ${leaks} tabla(s) devolvieron filas a anon` : "\nOK: ninguna tabla (salvo products) devolvió filas");
process.exit(leaks ? 1 : 0);
