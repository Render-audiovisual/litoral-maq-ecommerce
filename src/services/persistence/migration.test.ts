import { describe, expect, it } from "vitest";
import type { Account, Customer, Order } from "@/lib/types";
import { dedupeCustomersByEmail, mapAccountToProfileDraft, prepareOrderMigration } from "./migration";

describe("mapAccountToProfileDraft", () => {
  it("nunca incluye la contraseña y marca requiresPasswordReset si solo tenía password", () => {
    const account: Account = {
      id: "customer-x@test.com",
      name: "X",
      email: "x@test.com",
      role: "customer",
      providers: { password: { value: "secreta123" } },
      createdAt: new Date().toISOString(),
    };
    const draft = mapAccountToProfileDraft(account);
    expect(draft).not.toHaveProperty("password");
    expect(JSON.stringify(draft)).not.toContain("secreta123");
    expect(draft.requiresPasswordReset).toBe(true);
    expect(draft.hasGoogleProvider).toBe(false);
  });

  it("una cuenta con Google no requiere reset de contraseña", () => {
    const account: Account = {
      id: "customer-x@test.com",
      name: "X",
      email: "x@test.com",
      role: "customer",
      providers: { google: { providerId: "google-oauth2|demo" } },
      createdAt: new Date().toISOString(),
    };
    const draft = mapAccountToProfileDraft(account);
    expect(draft.requiresPasswordReset).toBe(false);
    expect(draft.hasGoogleProvider).toBe(true);
  });
});

describe("prepareOrderMigration", () => {
  const baseOrder: Order = {
    id: "o1",
    customerId: "customer-x@test.com",
    customerName: "X",
    email: "X@Test.com",
    lines: [],
    total: 100,
    shipping: 0,
    deliveryMethod: "retiro",
    status: "pendiente",
    createdAt: new Date().toISOString(),
    paymentReference: "MP-1",
  };

  it("un pedido de cuenta registrada resuelve directo, sin marca pendiente", () => {
    const draft = prepareOrderMigration(baseOrder, "resolved-uuid");
    expect(draft.resolvedCustomerId).toBe("resolved-uuid");
    expect(draft.pendingAnonymousLink).toBe(false);
    expect(draft.order.email).toBe("x@test.com");
  });

  it("un pedido de invitado sin id resuelto queda marcado pendingAnonymousLink", () => {
    const guestOrder: Order = { ...baseOrder, customerId: "guest-x@test.com" };
    const draft = prepareOrderMigration(guestOrder, null);
    expect(draft.pendingAnonymousLink).toBe(true);
    expect(draft.resolvedCustomerId).toBeNull();
  });
});

describe("dedupeCustomersByEmail", () => {
  it("conserva el primer registro, reporta el conflicto y no borra el teléfono existente", () => {
    const customers: Customer[] = [
      { id: "customer-1", name: "Uno", email: " X@Test.com ", role: "customer" },
      { id: "customer-2", name: "Uno duplicado", email: "x@test.com", role: "customer", phone: "123" },
      { id: "admin-1", name: "Admin", email: "admin@litoralmaq.com", role: "admin" },
    ];
    const { customers: deduped, conflicts } = dedupeCustomersByEmail(customers);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("customer-1");
    expect(deduped[0].phone).toBe("123");
    expect(conflicts).toHaveLength(1);
    expect(deduped.some((c) => c.role === "admin")).toBe(false);
  });
});
