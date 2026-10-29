import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import {
  getOrderWhatsAppUrl,
  getPendingOrderCustomerWhatsAppUrl,
  isValidArgentinePhone,
  normalizeArgentineWhatsAppNumber,
} from "./whatsapp";

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

  it("recontacta al cliente con un mensaje amistoso, con el pedido y asesoría", () => {
    const order = {
      id: "LM-125",
      customerName: "franco romero",
      phone: "+54 9 3794 11-2233",
      status: "pendiente",
      lines: [
        { productId: "p1", productName: "Taladro", quantity: 1 },
        { productId: "p2", productName: "Amoladora", quantity: 2 },
      ],
    } as Order;
    const url = new URL(getPendingOrderCustomerWhatsAppUrl(order));
    expect(url.pathname).toBe("/5493794112233");
    const text = url.searchParams.get("text") || "";
    expect(text).toContain("👋 ¡Hola Franco! ¿Cómo estás? Te escribimos de *Litoral Maq*.");
    expect(text).toContain("🧾 Vimos que solicitaste el pedido *LM-125*:\n• 1 × Taladro\n• 2 × Amoladora");
    expect(text).toContain("¿Querés seguir con tu compra?");
    expect(text).toContain("te ayudamos a elegir las mejores máquinas para vos");
    expect(text).toContain("📍 Lo podés retirar en nuestro local de Corrientes Capital");
    expect(text).toContain("¡Quedamos atentos! 😊");
    expect(text).not.toContain("ya venció");
  });

  it("sin nombre igual saluda", () => {
    const order = { id: "LM-129", phone: "3794112233", status: "pendiente", lines: [] } as unknown as Order;
    const text = new URL(getPendingOrderCustomerWhatsAppUrl(order)).searchParams.get("text") || "";
    expect(text).toContain("👋 ¡Hola! ¿Cómo estás?");
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
    expect(text).toContain("🧾 Vimos que solicitaste el pedido *LM-126*");
    expect(text).toContain("⏰ Ese pedido ya venció");
    expect(text).not.toContain("¿Querés seguir con tu compra?");
    expect(text).toContain("¿Lo retomamos? 😊");
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

  it("con un teléfono que no se puede normalizar no arma enlace", () => {
    const order = { id: "LM-130", phone: "0379 15 453", status: "pendiente", lines: [] } as unknown as Order;
    expect(getPendingOrderCustomerWhatsAppUrl(order)).toBe("");
  });
});

describe("pedido sin pago: el mensaje no da por hecho un pago", () => {
  const base = {
    id: "LM-200", lines: [{ productId: "p1", productName: "Taladro", quantity: 1 }],
    total: 50000, customerName: "Ana",
  };

  it("sin pago pide coordinar pago y entrega", () => {
    const order = { ...base, deliveryMethod: "retiro", paymentStatus: "pending" } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text") || "";
    expect(text).toContain("🙌 Les escribo por mi pedido en la web. Les comparto el detalle:");
    expect(text).toContain("Quiero coordinar el pago y la entrega, ¿me ayudan? ");
    expect(text).not.toContain("Gracias por recibir mi compra");
    expect(text).not.toContain("les llegó el pago");
  });

  it("pagado mantiene el texto de siempre", () => {
    const order = { ...base, deliveryMethod: "retiro", paymentStatus: "approved" } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text") || "";
    expect(text).toContain("✅ Gracias por recibir mi compra. Les comparto el detalle:");
    expect(text).toContain("¿Me avisan cuándo puedo pasar a retirarlo?");
  });

  it("el destino muestra el nombre de la provincia, no el código", () => {
    const order = {
      ...base, deliveryMethod: "envio", shippingStatus: "manual_quote", shippingCarrier: "OCA",
      address: "San Juan 1234 · Corrientes · CP 3400", province: "W", paymentStatus: "pending",
    } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text") || "";
    expect(text).toContain("Elegí el envío por OCA · San Juan 1234 · Corrientes · CP 3400 · Corrientes");
    expect(text).not.toContain("· W");
  });

  it("envío a sucursal lo dice en la entrega", () => {
    const order = {
      ...base, deliveryMethod: "envio", shippingStatus: "manual_quote", shippingCarrier: "OCA",
      shippingDeliveryType: "sucursal", paymentStatus: "pending",
      address: "Sucursal del correo a coordinar · La Plata · CP 1900", province: "B",
    } as Order;
    const text = new URL(getOrderWhatsAppUrl(order, order.id)).searchParams.get("text") || "";
    expect(text).toContain("Envío a sucursal del correo por OCA · Sucursal del correo a coordinar · La Plata · CP 1900 · Buenos Aires");
  });
});

describe("normalización de celulares argentinos", () => {
  it.each([
    ["3794530578", "5493794530578"],
    ["+54 9 3794 53-0578", "5493794530578"],
    ["03794530578", "5493794530578"],
    ["5493794530578", "5493794530578"],
    ["(379) 4530578", "5493794530578"],
    ["379 15 4530578", "5493794530578"],
    ["0379 15 4530578", "5493794530578"],
    ["54 379 15 4530578", "5493794530578"],
    ["+54 379 4530578", "5493794530578"],
    ["011 15 5555 1234", "5491155551234"],
    ["+54 11 5555-1234", "5491155551234"],
    ["2966 15 123456", "5492966123456"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeArgentineWhatsAppNumber(raw)).toBe(expected);
    expect(isValidArgentinePhone(raw)).toBe(true);
  });

  it.each(["", "abcdef", "4530578", "379453", "37945305781234", "549379453057812", "0379 15 453"])(
    "%s no se puede normalizar",
    (raw) => {
      expect(normalizeArgentineWhatsAppNumber(raw)).toBe("");
      expect(isValidArgentinePhone(raw)).toBe(false);
    },
  );
});
