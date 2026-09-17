import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import { getOrderWhatsAppUrl } from "./whatsapp";

describe("confirmación de pedido por WhatsApp", () => {
  it("arma un mensaje comercial con pedido, productos, total y entrega", () => {
    const order = {
      id: "LM-123", lines: [{ productId: "p1", productName: "Taladro", quantity: 2 }],
      total: 50000, deliveryMethod: "retiro", paymentStatus: "approved",
      paymentInstallments: 3, paymentInstallmentAmount: 16666.67,
      paymentMethodId: "master",
    } as Order;
    const url = new URL(getOrderWhatsAppUrl(order, order.id));
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/5493794215065");
    expect(url.searchParams.get("text")).toMatch(/LM-123.*2× Taladro.*50\.000.*Sáenz 1587/i);
    expect(url.searchParams.get("text")).toMatch(/Mastercard: 3 cuotas de \$\s?16\.666,67/i);
  });

  it("envío a coordinar pide acordar logística con la preferencia elegida", () => {
    const order = {
      id: "LM-124", lines: [{ productId: "p1", productName: "Amoladora", quantity: 1 }],
      total: 130000, shipping: 0, deliveryMethod: "envio", shippingStatus: "manual_quote",
      shippingCarrier: "Vía Cargo", paymentStatus: "approved", paymentMethodId: "debvisa",
    } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text");
    expect(text).toMatch(/hice la compra LM-124/);
    expect(text).toMatch(/envío a coordinar, prefiero despacharlo con Vía Cargo/);
    expect(text).toMatch(/coordinar la logística y el costo del envío/);
  });

  it("ofrece un mensaje mínimo si el pedido todavía no cargó", () => {
    expect(decodeURIComponent(getOrderWhatsAppUrl(undefined, "LM-999"))).toContain("LM-999");
  });
});
