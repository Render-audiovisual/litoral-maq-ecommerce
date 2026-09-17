import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import { getOrderWhatsAppUrl } from "./whatsapp";

describe("confirmación de pedido por WhatsApp", () => {
  it("arma un mensaje comercial con pedido, productos, total y entrega", () => {
    const order = {
      id: "LM-123", lines: [{ productId: "p1", productName: "Taladro", quantity: 2 }],
      total: 50000, deliveryMethod: "retiro",
    } as Order;
    const url = new URL(getOrderWhatsAppUrl(order, order.id));
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/5493794215065");
    expect(url.searchParams.get("text")).toMatch(/LM-123.*2× Taladro.*50\.000.*Sáenz 1587/i);
  });

  it("ofrece un mensaje mínimo si el pedido todavía no cargó", () => {
    expect(decodeURIComponent(getOrderWhatsAppUrl(undefined, "LM-999"))).toContain("LM-999");
  });
});

describe("el pago en el mensaje de WhatsApp", () => {
  const base = {
    id: "LM-124",
    lines: [{ productId: "p1", productName: "Amoladora", quantity: 1 }],
    total: 150000,
    deliveryMethod: "retiro",
  } as Order;

  it("dice las cuotas cuando Mercado Pago ya acreditó", () => {
    const url = getOrderWhatsAppUrl(
      { ...base, paymentStatus: "approved", payment: { installments: 3, installmentAmount: 50000 } },
      base.id,
    );
    expect(decodeURIComponent(url)).toMatch(/💳 Pago: 3 cuotas de \$.?50\.000,00/);
  });

  it("nombra el medio cuando el pago fue en una sola cuota", () => {
    const url = getOrderWhatsAppUrl(
      { ...base, paymentStatus: "approved", payment: { installments: 1, paymentTypeId: "debit_card" } },
      base.id,
    );
    expect(decodeURIComponent(url)).toContain("💳 Pago: Mercado Pago (débito)");
  });

  // Antes de acreditar no hay cuotas que contar: el mensaje no debe inventarlas.
  it("no menciona el pago si todavía está pendiente", () => {
    const url = getOrderWhatsAppUrl({ ...base, paymentStatus: "pending" }, base.id);
    expect(decodeURIComponent(url)).not.toContain("Pago:");
  });
});
