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

Deno.test("andreani-geo - sin Authorization rechaza 401", async () => {
  const { client } = staffClient();
  const req = new Request("https://example.com/andreani-geo?resource=localidades&postalCode=3400");
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 401);
});

Deno.test("andreani-geo - resource inválido rechaza 400", async () => {
  const { client, token } = staffClient();
  const req = new Request("https://example.com/andreani-geo?resource=depositos&postalCode=3400", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const response = await handler(req, { adminClient: client });
  assertEquals(response.status, 400);
});

Deno.test("andreani-geo - localidades y sucursales responden en modo mock", async () => {
  const { client, token } = staffClient();
  for (const resource of ["localidades", "sucursales"]) {
    const req = new Request(`https://example.com/andreani-geo?resource=${resource}&postalCode=3400`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const response = await handler(req, { adminClient: client });
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(Array.isArray(body), true);
  }
});

Deno.test("andreani-geo - flag apagado: 503 y no devuelve localidades ni sucursales", async () => {
  const { client, token } = staffClient();
  Deno.env.delete("ANDREANI_ENABLED");
  try {
    for (const resource of ["localidades", "sucursales"]) {
      const req = new Request(`https://example.com/andreani-geo?resource=${resource}&postalCode=3400`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const response = await handler(req, { adminClient: client });
      assertEquals(response.status, 503);
      const body = await response.json();
      assertEquals(Array.isArray(body), false);
    }
  } finally {
    Deno.env.set("ANDREANI_ENABLED", "true");
  }
});
