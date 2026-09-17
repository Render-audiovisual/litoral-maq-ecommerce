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
  return `Pago confirmado con ${paymentMethodLabel(order.paymentMethodId)}: ${detail}.`;
}

export function getWhatsAppUrl(message = "Hola, quiero consultar por los productos de Litoral Maq.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function getOrderWhatsAppUrl(order: Order | undefined, orderId: string) {
  if (!order) {
    return getWhatsAppUrl(`Hola, buenas. Hice el pedido ${orderId} desde la web y quiero consultar por su estado.`);
  }
  const products = order.lines
    .map((line) => `${line.quantity}× ${line.productName || line.productCode || line.productId}`)
    .join(", ");
  const productTotal = Math.max(0, order.total - (order.shipping || 0));
  const pagado = order.paymentStatus === "approved";
  const coordinar = isShippingToCoordinate(order);
  const destino = [order.address, order.province].filter(Boolean).join(" · ");
  const hacia = destino ? ` a ${destino}` : "";
  // El mensaje llega completo: Litoral Maq solo tiene que responder con el costo
  // del envío por la empresa elegida (o avisar cuándo retirar).
  const entrega = order.deliveryMethod === "retiro"
    ? "Elegí retiro en el local de Sáenz 1587."
    : coordinar
      ? `Elegí el envío por ${order.shippingCarrier || "la empresa que me recomienden"}${hacia}.`
      : `Elegí el envío por ${order.shippingCarrier || "correo"} (${formatCurrency(order.shipping)})${hacia}.`;
  const cierre = !pagado
    ? "Quiero confirmar que les llegó el pago."
    : order.deliveryMethod === "retiro"
      ? "¿Me avisan cuándo puedo pasar a retirarlo?"
      : coordinar
        ? "Quedo a la espera del costo del envío."
        : "Quedo atento al número de seguimiento.";
  return getWhatsAppUrl([
    `Hola, buenas.${order.customerName ? ` Soy ${order.customerName}.` : ""}`,
    `${pagado ? "Hice la compra" : "Hice el pedido"} ${order.id} desde la web.`,
    `Productos: ${products}.`,
    `${pagado ? "Total pagado" : "Total"}${coordinar ? " (productos)" : ""}: ${formatCurrency(coordinar ? productTotal : order.total)}.`,
    paymentSummary(order),
    entrega,
    cierre,
  ].filter(Boolean).join("\n"));
}
