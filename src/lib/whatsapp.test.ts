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
    const text = url.searchParams.get("text") || "";
    expect(text).toContain("Hice la compra LM-123");
    expect(text).toContain("Productos: 2× Taladro.");
    expect(text).toMatch(/Total pagado: \$\s?50\.000/);
    expect(text).toContain("Elegí retiro en el local de Sáenz 1587.");
    expect(text).toMatch(/Mastercard: 3 cuotas de \$\s?16\.666,67/i);
  });

  it("envío a cotizar llega con la empresa elegida y el destino", () => {
    const order = {
      id: "LM-124", lines: [{ productId: "p1", productName: "Amoladora", quantity: 1 }],
      total: 130000, shipping: 0, deliveryMethod: "envio", shippingStatus: "manual_quote",
      shippingCarrier: "Vía Cargo", paymentStatus: "approved", paymentMethodId: "debvisa",
      customerName: "Juan Pérez", address: "San Juan 1234 · Resistencia", province: "Chaco",
    } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text") || "";
    expect(text).toContain("Hola, buenas. Soy Juan Pérez.");
    expect(text).toContain("Hice la compra LM-124");
    expect(text).toContain("Elegí el envío por Vía Cargo a San Juan 1234 · Resistencia · Chaco.");
    expect(text).toContain("Quedo a la espera del costo del envío.");
  });

  it("ofrece un mensaje mínimo si el pedido todavía no cargó", () => {
    expect(decodeURIComponent(getOrderWhatsAppUrl(undefined, "LM-999"))).toContain("LM-999");
  });
});
