// Correr con (desde la raíz del repo): deno test --config supabase/functions/deno.json --allow-env supabase/functions
import { assertEquals } from "@std/assert";
import { FakeAdminClient } from "../_shared/test-support.ts";
import { handler } from "./index.ts";

// La integración está apagada por defecto (ANDREANI_ENABLED=false); estos
// tests ejercitan el comportamiento con la integración prendida. El flag
// apagado tiene su propio test al final.
Deno.env.set("ANDREANI_ENABLED", "true");

function staffClient(role: "admin" | "employee" | "customer" = "admin") {
  const client = new FakeAdminClient();
  const token = `token-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  client.setAuthUser(token, userId);
  client.tables.profiles.set(userId, { id: userId, role });
  return { client, token };
}

Deno.test("andreani-quote - sin Authorization rechaza 401", async () => {
  const { client } = staffClient();
  const req = new Request("https://example.com/andreani-quote", { method: "POST", body: "{}" });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 401);
});

Deno.test("andreani-quote - rol customer rechaza 403", async () => {
  const { client, token } = staffClient("customer");
  const req = new Request("https://example.com/andreani-quote", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ postalCode: "3400", weightKg: 5 }),
  });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 403);
});

Deno.test("andreani-quote - payload inválido (CP mal formado) rechaza 400, sin llegar a cotizar", async () => {
  const { client, token } = staffClient();
  const req = new Request("https://example.com/andreani-quote", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ postalCode: "no-es-un-cp", weightKg: 5 }),
  });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 400);
});

Deno.test("andreani-quote - peso fuera de rango rechaza 400", async () => {
  const { client, token } = staffClient();
  const req = new Request("https://example.com/andreani-quote", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ postalCode: "3400", weightKg: 999999 }),
  });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 400);
});

Deno.test("andreani-quote - request válida cotiza en modo mock (obligatorio)", async () => {
  const { client, token } = staffClient();
  const req = new Request("https://example.com/andreani-quote", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ postalCode: "3400", weightKg: 5 }),
  });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.simulated, true);
});

Deno.test("andreani-quote - excede el límite de requests por minuto -> 429", async () => {
  const { client, token } = staffClient();
  const makeReq = () =>
    new Request("https://example.com/andreani-quote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ postalCode: "3400", weightKg: 5 }),
    });
  let last;
  for (let i = 0; i < 31; i += 1) last = await handler(makeReq(), { adminClient: client });
  assertEquals(last!.status, 429);
});

Deno.test("andreani-quote - flag apagado: 503 y NO cotiza (ni siquiera un mock) para un admin real", async () => {
  const { client, token } = staffClient();
  Deno.env.delete("ANDREANI_ENABLED");
  try {
    const req = new Request("https://example.com/andreani-quote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ postalCode: "3400", weightKg: 5 }),
    });
    const response = await handler(req, { adminClient: client });
    assertEquals(response.status, 503);
    const body = await response.json();
    // No debe devolver ninguna cotización, ni marcada como simulada.
    assertEquals(body.amount, undefined);
    assertEquals(body.simulated, undefined);
  } finally {
    Deno.env.set("ANDREANI_ENABLED", "true");
  }
});
