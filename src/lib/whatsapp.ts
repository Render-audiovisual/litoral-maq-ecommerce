import type { Order } from "./types";
import { isShippingToCoordinate } from "./order-details";
import { formatCurrency } from "./utils";

const WHATSAPP_NUMBER = "5493794215065";

export function paymentMethodLabel(methodId?: string) {
  const labels: Record<string, string> = {
    visa: "Visa",
    master: "Mastercard",
    amex: "American Express",
    naranja: "Naranja X",
    cabal: "Cabal",
    debvisa: "Visa Débito",
    debmaster: "Mastercard Débito",
    account_money: "dinero en Mercado Pago",
  };
  const value = String(methodId || "").trim().toLowerCase();
  return labels[value] || (value ? value.replace(/_/g, " ") : "Mercado Pago");
}

function paymentSummary(order: Order) {
  if (order.paymentStatus !== "approved") return "Pago pendiente de confirmación";
  const installments = Number(order.paymentInstallments);
  const amount = Number(order.paymentInstallmentAmount);
  const detail = Number.isInteger(installments) && installments > 1
    ? `${installments} cuotas${Number.isFinite(amount) && amount > 0 ? ` de ${formatCurrency(amount)}` : ""}`
    : "1 pago";
  return `Pago confirmado con ${paymentMethodLabel(order.paymentMethodId)} · ${detail}`;
}

export function getWhatsAppUrl(message = "Hola, quiero consultar por los productos de Litoral Maq.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function getOrderWhatsAppUrl(order: Order | undefined, orderId: string) {
  if (!order) {
    return getWhatsAppUrl([
      "👋 ¡Hola! Acabo de realizar una compra en la web de Litoral Maq.",
      `🧾 *Pedido:* ${orderId}`,
      "¿Me confirman si lo recibieron correctamente?",
      "¡Muchas gracias! 😊",
    ].join("\n\n"));
  }
  const products = order.lines
    .map((line) => `• ${line.quantity} × ${line.productName || line.productCode || line.productId}`)
    .join("\n");
  const productTotal = Math.max(0, order.total - (order.shipping || 0));
  const pagado = order.paymentStatus === "approved";
  const coordinar = isShippingToCoordinate(order);
  const destino = [order.address, order.province].filter(Boolean).join(" · ");
  // El mensaje llega completo: Litoral Maq solo tiene que responder con el costo
  // del envío por la empresa elegida (o avisar cuándo retirar).
  const entrega = order.deliveryMethod === "retiro"
    ? "Retiro en el local de Sáenz 1587"
    : coordinar
      ? `Elegí el envío por ${order.shippingCarrier || "la empresa a coordinar"}${destino ? ` · ${destino}` : ""}`
      : `${order.shippingCarrier || "Correo"} · ${formatCurrency(order.shipping)}${destino ? ` · ${destino}` : ""}`;
  const cierre = !pagado
    ? "Quiero confirmar que les llegó el pago."
    : order.deliveryMethod === "retiro"
      ? "¿Me avisan cuándo puedo pasar a retirarlo?"
      : coordinar
        ? "Quedo a la espera del costo del envío."
        : "Quedo atento al número de seguimiento.";
  return getWhatsAppUrl([
    `👋 ¡Hola!${order.customerName ? ` Soy *${order.customerName}*.` : ""}`,
    "✅ Gracias por recibir mi compra. Les comparto el detalle:",
    `🧾 *Pedido:* ${order.id}`,
    `🛒 *Productos:*\n${products}`,
    `💰 *Total de productos:* ${formatCurrency(coordinar ? productTotal : order.total)}`,
    `💳 *Pago:* ${paymentSummary(order)}`,
    `🚚 *Entrega:* ${entrega}${coordinar ? "\nℹ️ El costo del envío se coordina y abona por separado." : ""}`,
    cierre,
    "¡Muchas gracias! 😊",
  ].join("\n\n"));
}
