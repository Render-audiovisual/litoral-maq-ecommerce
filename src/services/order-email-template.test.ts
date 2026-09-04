import { describe, expect, it } from "vitest";
import {
  type OrderRecord,
  renderOrderEmail,
} from "../../supabase/functions/_shared/order-email";

const order = (deliveryMethod: "envio" | "retiro"): OrderRecord => ({
  id: "LM-12345678",
  customer_name: "Ana & Juan",
  email: "cliente@example.com",
  phone: "3794000000",
  lines: [{
    productName: "Taladro <Profesional>",
    productCode: "ABC-1",
    quantity: 2,
    unitPrice: 10_000,
  }],
  total: 20_000,
  shipping: 0,
  delivery_method: deliveryMethod,
  address: deliveryMethod === "envio" ? "Corrientes 123" : null,
  status: "preparando",
  payment_status: "approved",
  shipping_tracking_number: null,
  shipping_carrier: null,
});

describe("correo posterior al pago", () => {
  it("confirma el cobro y explica que el correo de envío se define después", () => {
    const email = renderOrderEmail(
      "customer_payment_approved",
      order("envio"),
      "https://litoralmaq.com",
    );

    expect(email.subject).toBe("Pago confirmado · Pedido LM-12345678");
    expect(email.html).toContain("Pago acreditado por Mercado Pago.");
    expect(email.html).toContain("vamos a evaluar el correo disponible");
    expect(email.html).not.toContain("Sujeto a la confirmación operativa");
    expect(email.html).toContain("https://litoralmaq.com/cuenta/pedidos");
  });

  it("para retiro avisa que se confirmará cuando el pedido esté listo", () => {
    const email = renderOrderEmail(
      "customer_payment_approved",
      order("retiro"),
      "https://litoralmaq.com/",
    );

    expect(email.html).toContain("cuando el pedido esté listo para retirar");
  });

  it("escapa contenido del pedido antes de insertarlo en el HTML", () => {
    const email = renderOrderEmail(
      "customer_order_received",
      order("envio"),
      "https://litoralmaq.com",
    );

    expect(email.html).toContain("Taladro &lt;Profesional&gt;");
    expect(email.html).not.toContain("Taladro <Profesional>");
  });

  it("el aviso interno enlaza al panel administrativo", () => {
    const email = renderOrderEmail(
      "team_new_order",
      order("envio"),
      "https://admin.litoralmaq.com",
    );

    expect(email.html).toContain("https://admin.litoralmaq.com/admin/pedidos");
  });
});
