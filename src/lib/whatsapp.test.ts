import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import { getOrderWhatsAppUrl, getPendingOrderCustomerWhatsAppUrl } from "./whatsapp";

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
    expect(text).toContain("🧾 *Pedido:* LM-123");
    expect(text).toContain("🛒 *Productos:*\n• 2 × Taladro");
    expect(text).toMatch(/💰 \*Total de productos:\* \$\s?50\.000/);
    expect(text).toContain("🚚 *Entrega:* Retiro en el local de Sáenz 1587");
    expect(text).toMatch(/Mastercard · 3 cuotas de \$\s?16\.666,67/i);
    expect(text).toContain("¡Muchas gracias! 😊");
  });

  it("envío a cotizar llega con la empresa elegida y el destino", () => {
    const order = {
      id: "LM-124", lines: [{ productId: "p1", productName: "Amoladora", quantity: 1 }],
      total: 130000, shipping: 0, deliveryMethod: "envio", shippingStatus: "manual_quote",
      shippingCarrier: "Vía Cargo", paymentStatus: "approved", paymentMethodId: "debvisa",
      customerName: "Juan Pérez", address: "San Juan 1234 · Resistencia", province: "Chaco",
    } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text") || "";
    expect(text).toContain("👋 ¡Hola! Soy *Juan Pérez*.");
    expect(text).toContain("🚚 *Entrega:* Elegí el envío por Vía Cargo · San Juan 1234 · Resistencia · Chaco");
    expect(text).toContain("ℹ️ El costo del envío se coordina y abona por separado.");
    expect(text).toContain("Quedo a la espera del costo del envío.");
  });

  it("ofrece un mensaje mínimo si el pedido todavía no cargó", () => {
    expect(decodeURIComponent(getOrderWhatsAppUrl(undefined, "LM-999"))).toContain("LM-999");
  });

  it("recontacta al cliente con el pedido pendiente y le ofrece asesoría", () => {
    const order = {
      id: "LM-125",
      customerName: "Ana",
      phone: "+54 9 3794 11-2233",
      status: "pendiente",
      lines: [{ productId: "p1", productName: "Taladro", quantity: 1 }],
    } as Order;
    const url = new URL(getPendingOrderCustomerWhatsAppUrl(order));
    expect(url.pathname).toBe("/5493794112233");
    const text = url.searchParams.get("text") || "";
    expect(text).toContain("Hola Ana");
    expect(text).toContain("Vimos que solicitaste el pedido LM-125 por 1 × Taladro");
    expect(text).toContain("querés continuar con tu compra");
    expect(text).toContain("asesorar");
    expect(text).toContain("Corrientes Capital");
    expect(text).not.toContain("ya venció");
  });

  it("si el pedido venció, el mensaje no promete reserva y ofrece retomar la compra", () => {
    const order = {
      id: "LM-126",
      customerName: "Ana",
      phone: "3794112233",
      status: "cancelado",
      lines: [{ productId: "p1", productName: "Taladro", quantity: 1 }],
    } as Order;
    const text = new URL(getPendingOrderCustomerWhatsAppUrl(order)).searchParams.get("text") || "";
    expect(text).toContain("Vimos que solicitaste el pedido LM-126");
    expect(text).toContain("ya venció");
    expect(text).not.toContain("continuar con tu compra");
    expect(text).toContain("retomemos");
  });

  it("un pedido cancelado que sí se pagó no recibe el texto de pedido vencido", () => {
    const order = {
      id: "LM-128",
      customerName: "Ana",
      phone: "3794112233",
      status: "cancelado",
      paymentStatus: "refunded",
      lines: [{ productId: "p1", productName: "Taladro", quantity: 1 }],
    } as Order;
    const text = new URL(getPendingOrderCustomerWhatsAppUrl(order)).searchParams.get("text") || "";
    expect(text).not.toContain("ya venció");
  });

  it("sin teléfono no arma enlace", () => {
    const order = { id: "LM-127", lines: [] } as unknown as Order;
    expect(getPendingOrderCustomerWhatsAppUrl(order)).toBe("");
  });
});
