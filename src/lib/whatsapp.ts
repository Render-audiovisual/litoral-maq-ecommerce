import type { Order } from "./types";
import { formatCurrency } from "./utils";

const WHATSAPP_NUMBER = "5493794215065";

export function getWhatsAppUrl(message = "Hola, quiero consultar por los productos de Litoral Maq.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function getOrderWhatsAppUrl(order: Order | undefined, orderId: string) {
  if (!order) {
    return getWhatsAppUrl(`Hola, envié la solicitud ${orderId} desde la web y quiero confirmar que la recibieron.`);
  }
  const products = order.lines
    .map((line) => `${line.quantity}× ${line.productName || line.productCode || line.productId}`)
    .join(", ");
  const delivery = order.deliveryMethod === "retiro"
    ? "retiro en Sáenz 1587"
    : order.shippingQuoteId
      ? `envío por ${order.shippingCarrier || "correo"} (${formatCurrency(order.shipping)})`
      : "envío a cotizar";
  const productTotal = Math.max(0, order.total - (order.shipping || 0));
  return getWhatsAppUrl(
    `Hola, envié la solicitud ${order.id} desde la web. ` +
    `Productos: ${products}. Total de productos: ${formatCurrency(productTotal)}. ` +
    `Elegí ${delivery}. Quiero confirmar disponibilidad y próximos pasos.`,
  );
}
