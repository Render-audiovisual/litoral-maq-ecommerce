import { describe, expect, it } from "vitest";
import type { Order, Session } from "@/lib/types";
import { selectOwnOrders } from "./orders";

const sessionA: Session = {
  user: { id: "customer-a@test.com", name: "A", email: "a@test.com", role: "customer" },
  token: "t",
  expiresAt: Date.now() + 60_000,
};
const sessionB: Session = {
  user: { id: "customer-b@test.com", name: "B", email: "b@test.com", role: "customer" },
  token: "t",
  expiresAt: Date.now() + 60_000,
};

const baseOrder = {
  lines: [],
  total: 100,
  shipping: 0,
  deliveryMethod: "retiro" as const,
  status: "pendiente" as const,
  createdAt: new Date().toISOString(),
  paymentReference: "MP-1",
};

const orders: Order[] = [
  { ...baseOrder, id: "o1", customerId: "customer-a@test.com", customerName: "A", email: "a@test.com" },
  { ...baseOrder, id: "o2", customerId: "customer-a@test.com", customerName: "A", email: "A@TEST.com " },
  { ...baseOrder, id: "o3", customerId: "customer-b@test.com", customerName: "B", email: "b@test.com" },
  // heredado: sin customerId estable, solo coincide por email normalizado
  { ...baseOrder, id: "o4", customerId: "legacy-unknown", customerName: "A", email: " a@test.com" },
];

describe("selectOwnOrders", () => {
  it("un cliente ve solo sus propios pedidos, sin importar mayúsculas/espacios en el email", () => {
    const mine = selectOwnOrders(orders, sessionA);
    expect(mine.map((o) => o.id).sort()).toEqual(["o1", "o2", "o4"]);
  });

  it("un cliente no puede ver pedidos de otro", () => {
    const mine = selectOwnOrders(orders, sessionA);
    expect(mine.some((order) => order.id === "o3")).toBe(false);
  });

  it("otro cliente ve exclusivamente los suyos", () => {
    const mine = selectOwnOrders(orders, sessionB);
    expect(mine.map((o) => o.id)).toEqual(["o3"]);
  });
});
