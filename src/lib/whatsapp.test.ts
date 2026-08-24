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
