import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import { getOrderDelay, humanizeElapsed } from "./order-delays";

const now = new Date("2026-09-24T12:00:00.000Z");
const hoursAgo = (hours: number, minutes = 0) =>
  new Date(now.getTime() - (hours * 60 + minutes) * 60_000).toISOString();

function order(patch: Partial<Order>): Order {
  return {
    id: "LM-1",
    customerId: "c1",
    customerName: "Cliente",
    email: "c@example.com",
    lines: [],
    total: 100,
    shipping: 0,
    deliveryMethod: "retiro",
    status: "pendiente",
    createdAt: hoursAgo(1),
    paymentReference: "",
    paymentStatus: "pending",
    ...patch,
  };
}

describe("humanizeElapsed", () => {
  it("usa horas por debajo de un día y días desde ahí", () => {
    expect(humanizeElapsed(0.5)).toBe("hace menos de 1 h");
    expect(humanizeElapsed(5)).toBe("hace 5 h");
    expect(humanizeElapsed(23.9)).toBe("hace 23 h");
    expect(humanizeElapsed(24)).toBe("hace 1 día");
    expect(humanizeElapsed(47)).toBe("hace 1 día");
    expect(humanizeElapsed(72)).toBe("hace 3 días");
  });
});

describe("getOrderDelay", () => {
  it("pagado y sin preparar: se marca desde las 24 h exactas", () => {
    const paid = { status: "pendiente" as const, paymentStatus: "approved" as const };
    expect(getOrderDelay(order({ ...paid, statusChangedAt: hoursAgo(23, 59) }), now)).toBeNull();
    expect(getOrderDelay(order({ ...paid, statusChangedAt: hoursAgo(24) }), now)).toEqual({
      kind: "paid-not-started",
      hours: 24,
      label: "Pagado sin preparar hace 1 día",
    });
  });

  it("listo: distingue retiro de envío y marca desde las 72 h", () => {
    expect(getOrderDelay(order({ status: "listo", statusChangedAt: hoursAgo(71, 59) }), now)).toBeNull();
    expect(getOrderDelay(order({ status: "listo", statusChangedAt: hoursAgo(72) }), now)?.label).toBe(
      "Listo sin retirar hace 3 días",
    );
    const shipping = getOrderDelay(
      order({ status: "listo", deliveryMethod: "envio", statusChangedAt: hoursAgo(80) }),
      now,
    );
    expect(shipping?.kind).toBe("ready-not-collected");
    expect(shipping?.label).toBe("Listo sin despachar hace 3 días");
  });

  it("enviado: marca desde los 7 días", () => {
    expect(getOrderDelay(order({ status: "enviado", statusChangedAt: hoursAgo(167, 59) }), now)).toBeNull();
    expect(getOrderDelay(order({ status: "enviado", statusChangedAt: hoursAgo(192) }), now)).toEqual({
      kind: "shipped-not-closed",
      hours: 192,
      label: "Enviado sin cerrar hace 8 días",
    });
  });

  it("sin statusChangedAt usa la fecha de creación", () => {
    expect(getOrderDelay(order({ status: "listo", createdAt: hoursAgo(100) }), now)?.kind).toBe(
      "ready-not-collected",
    );
  });

  it("no marca pedidos cerrados, cancelados ni pendientes sin pago", () => {
    const old = hoursAgo(500);
    expect(getOrderDelay(order({ status: "pendiente", statusChangedAt: old }), now)).toBeNull();
    expect(getOrderDelay(order({ status: "cancelado", paymentStatus: "approved", statusChangedAt: old }), now)).toBeNull();
    expect(getOrderDelay(order({ status: "entregado", paymentStatus: "approved", statusChangedAt: old }), now)).toBeNull();
    expect(getOrderDelay(order({ status: "preparando", paymentStatus: "approved", statusChangedAt: old }), now)).toBeNull();
  });
});
