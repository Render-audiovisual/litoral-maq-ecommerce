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
  payment_installments: 3,
  payment_installment_amount: 6666.67,
  payment_method_id: "visa",
  payment_type_id: "credit_card",
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

    expect(email.subject).toBe(
      "¡Gracias por tu compra! Pedido LM-12345678 confirmado",
    );
    expect(email.html).toContain("Total pagado");
    expect(email.html).toContain("Pago acreditado por Mercado Pago.");
    expect(email.html).toContain("Visa · 3 cuotas de $\u00a06.666,67");
    expect(email.html).toContain("coordinamos el envío a tu domicilio");
    expect(email.html).not.toContain("Sujeto a la confirmación operativa");
    expect(email.html).toContain("https://litoralmaq.com/cuenta/pedidos");
    expect(email.html).toContain("Hablar con Litoral Maq por WhatsApp");
    expect(email.html).toContain("wa.me/5493794215065");
    expect(email.html).toContain("3%20cuotas%20de%20%24%C2%A06.666%2C67");
  });

  it("para retiro avisa que se confirmará cuando el pedido esté listo", () => {
    const email = renderOrderEmail(
      "customer_payment_approved",
      order("retiro"),
      "https://litoralmaq.com/",
    );

    expect(email.html).toContain("listo para retirar en Sáenz 1587");
  });

  it("para retiro usa el aviso listo para retirar y cierra como retirado", () => {
    const ready = renderOrderEmail(
      "customer_order_ready",
      order("retiro"),
      "https://litoralmaq.com",
    );
    const collected = renderOrderEmail(
      "customer_order_delivered",
      order("retiro"),
      "https://litoralmaq.com",
    );

    expect(ready.subject).toContain("listo para retirar");
    expect(ready.html).toContain("ya podés retirarlo en Sáenz 1587");
    expect(collected.subject).toContain("retirado");
    expect(collected.html).toContain("retirado de la sucursal");
  });

  it("conserva los textos de despacho y entrega para logística", () => {
    const ready = renderOrderEmail(
      "customer_order_ready",
      order("envio"),
      "https://litoralmaq.com",
    );
    const delivered = renderOrderEmail(
      "customer_order_delivered",
      order("envio"),
      "https://litoralmaq.com",
    );

    expect(ready.html).toContain("listo para ser despachado");
    expect(delivered.subject).toContain("entregado");
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
    expect(email.html).not.toContain("Hablar con Litoral Maq por WhatsApp");
  });
});

describe("detalle del correo de compra", () => {
  const conPago = (): OrderRecord => ({
    ...order("envio"),
    total: 134_999,
    shipping: 15_000,
    payment_installments: 3,
    payment_installment_amount: 48_500,
    payment_method_id: "visa",
    payment_type_id: "credit_card",
  });

  it("abre el total: productos y envío por separado", () => {
    const email = renderOrderEmail("customer_payment_approved", conPago(), "https://litoralmaq.com");
    expect(email.html).toContain("Productos");
    expect(email.html).toContain("119.999"); // 134.999 menos 15.000 de envío
  });

  it("incluye la foto del producto cuando la hay, y no rompe cuando falta", () => {
    const base = conPago();
    const conFoto = renderOrderEmail(
      "customer_payment_approved",
      { ...base, lines: [{ ...base.lines[0], productId: "p1" }] },
      "https://litoralmaq.com",
      { p1: "https://litoralmaq.com/products/catalog/x.webp" },
    );
    expect(conFoto.html).toContain("products/catalog/x.webp");
    const sinFoto = renderOrderEmail("customer_payment_approved", base, "https://litoralmaq.com");
    expect(sinFoto.html).not.toContain("<img");
  });

  it("dice qué sigue y dónde está el local", () => {
    const email = renderOrderEmail("customer_payment_approved", conPago(), "https://litoralmaq.com");
    expect(email.html).toContain("Qué sigue");
    expect(email.html).toContain("Sáenz 1587, Corrientes");
  });

  // El aviso interno no lleva los datos del local: el equipo ya sabe dónde trabaja.
  it("el aviso al equipo no incluye el bloque del local", () => {
    const email = renderOrderEmail("team_new_order", conPago(), "https://admin.litoralmaq.com");
    expect(email.html).not.toContain("Horarios:");
  });
});
