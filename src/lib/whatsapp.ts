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
  if (order.paymentStatus !== "approved") return "";
  const installments = Number(order.paymentInstallments);
  const amount = Number(order.paymentInstallmentAmount);
  const detail = Number.isInteger(installments) && installments > 1
    ? `${installments} cuotas${Number.isFinite(amount) && amount > 0 ? ` de ${formatCurrency(amount)}` : ""}`
    : "1 pago";
  return ` Pago confirmado con ${paymentMethodLabel(order.paymentMethodId)}: ${detail}.`;
}

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
  const productTotal = Math.max(0, order.total - (order.shipping || 0));
  const pagado = order.paymentStatus === "approved";
  const coordinar = isShippingToCoordinate(order);
  const delivery = order.deliveryMethod === "retiro"
    ? "retiro en el local de Sáenz 1587"
    : coordinar
      ? `envío a coordinar${
        order.shippingCarrier ? `, prefiero despacharlo con ${order.shippingCarrier}` : ""
      }`
      : `envío por ${order.shippingCarrier || "correo"} (${formatCurrency(order.shipping)})`;
  // Lo que pide el cliente depende de cómo lo recibe: retirar o acordar el envío.
  const cierre = !pagado
    ? "Quiero confirmar disponibilidad y próximos pasos."
    : order.deliveryMethod === "retiro"
      ? "¿Me avisan cuándo puedo pasar a retirarlo?"
      : coordinar
        ? "Quiero coordinar la logística y el costo del envío."
        : "Quedo atento al número de seguimiento.";
  return getWhatsAppUrl(
    `Hola, ${pagado ? "hice la compra" : "envié la solicitud"} ${order.id} desde la web. ` +
    `Productos: ${products}. Total de productos: ${formatCurrency(productTotal)}. ` +
    `Elegí ${delivery}.${paymentSummary(order)} ${cierre}`,
  );
}
