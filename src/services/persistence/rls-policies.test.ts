import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const policies = readFileSync(join(process.cwd(), "supabase/migrations/0003_rls_policies.sql"), "utf8");

describe("aislamiento RLS de clientes", () => {
  it("un cliente solo puede leer y crear pedidos con su propio auth.uid()", () => {
    expect(policies).toContain("auth.uid() = customer_id or public.is_admin()");
    expect(policies).toContain("for insert with check (auth.uid() = customer_id or public.is_admin())");
  });

  it("cada carrito solo puede ser leído o escrito por su dueño, sin excepción administrativa", () => {
    expect(policies).toContain(
      "for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)",
    );
  });
});
