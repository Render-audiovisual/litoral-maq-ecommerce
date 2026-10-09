import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/types";
import { customerHasPurchase, getSalesAnalytics } from "@/lib/admin-analytics";

function order(overrides: Partial<Order>): Order {
  return {
    id: "LM-1",
    customerId: "customer-1",
    customerName: "Cliente",
    email: "cliente@example.com",
    lines: [{ productId: "p1", productName: "Taladro", quantity: 2, unitPrice: 100 }],
    total: 220,
    shipping: 20,
    deliveryMethod: "envio",
    status: "preparando",
    createdAt: "2026-10-08T12:00:00-03:00",
    paymentReference: "mp-1",
    paymentStatus: "approved",
    ...overrides,
  };
}

describe("admin analytics", () => {
  it("calcula ventas solo con pagos aprobados del período", () => {
    const result = getSalesAnalytics(
      [
        order({ id: "approved" }),
        order({ id: "pending", paymentStatus: "pending", total: 900 }),
        order({ id: "cancelled", status: "cancelado", total: 500 }),
        order({ id: "old", createdAt: "2026-09-01T12:00:00-03:00", total: 700 }),
      ],
      7,
      new Date("2026-10-09T10:00:00-03:00"),
    );
    expect(result.approvedTotal).toBe(220);
    expect(result.approvedOrders).toBe(1);
    expect(result.averageTicket).toBe(220);
    expect(result.units).toBe(2);
    expect(result.topProducts[0]).toMatchObject({ name: "Taladro", units: 2, total: 200 });
  });

  it("separa reintegros y calcula comparación", () => {
    const result = getSalesAnalytics(
      [
        order({ id: "current", total: 300 }),
        order({ id: "previous", total: 200, createdAt: "2026-09-29T12:00:00-03:00" }),
        order({ id: "refund", total: 80, paymentStatus: "refunded" }),
      ],
      7,
      new Date("2026-10-09T10:00:00-03:00"),
    );
    expect(result.changePercent).toBe(50);
    expect(result.refundedTotal).toBe(80);
  });

  it("muestra únicamente clientes con una compra real", () => {
    expect(customerHasPurchase([order({})], "customer-1", "otro@example.com")).toBe(true);
    expect(customerHasPurchase([order({ paymentStatus: "pending" })], "customer-1", "cliente@example.com")).toBe(false);
    expect(customerHasPurchase([order({ status: "pago_simulado", paymentStatus: undefined })], "customer-1", "cliente@example.com")).toBe(false);
  });
});
