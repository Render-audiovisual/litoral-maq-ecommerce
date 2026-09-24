import type { Order } from "./types";
import { isShippingToCoordinate, provinceName } from "./order-details";
import { formatCurrency } from "./utils";
import { isExpiredUnpaidOrder } from "./orders";

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

/**
 * Celular argentino → número de wa.me (549 + 10 dígitos). Acepta cómo lo
 * escribe la gente: con +54, con 9, con 0 adelante, con el 15 después del
 * código de área. Si no queda un número nacional de 10 dígitos devuelve ""
 * (mejor no mostrar el botón que abrir un chat con un número equivocado).
 */
export function normalizeArgentineWhatsAppNumber(phone?: string) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("54") && digits.length >= 11) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  else if (digits.startsWith("9") && (digits.length === 11 || digits.length === 13)) digits = digits.slice(1);
  if (digits.length === 12) {
    // El 15 va justo después del código de área (2, 3 o 4 dígitos).
    const area = [2, 3, 4].find((a) => digits.slice(a, a + 2) === "15");
    if (area) digits = digits.slice(0, area) + digits.slice(area + 2);
  }
  // Los códigos de área argentinos empiezan con 1, 2 o 3.
  return /^[1-3]\d{9}$/.test(digits) ? `549${digits}` : "";
}

export function isValidArgentinePhone(phone?: string) {
  return normalizeArgentineWhatsAppNumber(phone) !== "";
}

/** Primer nombre con la inicial en mayúscula: "franco romero" → "Franco". */
function greetingName(fullName?: string) {
  const first = String(fullName || "").trim().split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
}

/**
 * Enlace que usa el equipo, desde el detalle del pedido en el panel, para
 * recontactar a quien pidió y todavía no pagó. Si el pedido ya venció (se
 * canceló a las 24 h sin pago) el mensaje no promete reserva ni stock.
 */
export function getPendingOrderCustomerWhatsAppUrl(order: Order, phone?: string) {
  const number = normalizeArgentineWhatsAppNumber(phone || order.phone);
  if (!number) return "";
  const products = order.lines
    .map((line) => `• ${line.quantity} × ${line.productName || line.productCode || line.productId}`)
    .join("\n");
  const expired = isExpiredUnpaidOrder(order);
  const name = greetingName(order.customerName);
  const message = [
    `👋 ¡Hola${name ? ` ${name}` : ""}! ¿Cómo estás? Te escribimos de *Litoral Maq*.`,
    `🧾 Vimos que solicitaste el pedido *${order.id}*:\n${products}`,
    expired
      ? "⏰ Ese pedido ya venció, pero no hay problema: si querés seguir con tu compra lo resolvemos juntos por acá y te asesoramos personalmente."
      : "🛠️ ¿Querés seguir con tu compra? Contá con nosotros: te ayudamos a elegir las mejores máquinas para vos.",
    "📍 Lo podés retirar en nuestro local de Corrientes Capital o te ayudamos a coordinar el envío 🚚.",
    expired ? "¿Lo retomamos? 😊" : "¡Quedamos atentos! 😊",
  ].join("\n\n");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
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
  const destino = [order.address, provinceName(order.province)].filter(Boolean).join(" · ");
  const sucursal = order.shippingDeliveryType === "sucursal";
  // El mensaje llega completo: Litoral Maq solo tiene que responder con el costo
  // del envío por la empresa elegida (o avisar cuándo retirar).
  const entrega = order.deliveryMethod === "retiro"
    ? "Retiro en el local de Sáenz 1587"
    : coordinar
      ? `${sucursal ? "Envío a sucursal del correo por" : "Elegí el envío por"} ${order.shippingCarrier || "la empresa a coordinar"}${destino ? ` · ${destino}` : ""}`
      : `${order.shippingCarrier || "Correo"} · ${formatCurrency(order.shipping)}${destino ? ` · ${destino}` : ""}`;
  // Sin pago acreditado el mensaje no puede dar por hecho que se pagó.
  const cierre = !pagado
    ? "Quiero coordinar el pago y la entrega, ¿me ayudan? 🙏"
    : order.deliveryMethod === "retiro"
      ? "¿Me avisan cuándo puedo pasar a retirarlo?"
      : coordinar
        ? "Quedo a la espera del costo del envío."
        : "Quedo atento al número de seguimiento.";
  return getWhatsAppUrl([
    `👋 ¡Hola!${order.customerName ? ` Soy *${order.customerName}*.` : ""}`,
    pagado
      ? "✅ Gracias por recibir mi compra. Les comparto el detalle:"
      : "🙌 Les escribo por mi pedido en la web. Les comparto el detalle:",
    `🧾 *Pedido:* ${order.id}`,
    `🛒 *Productos:*\n${products}`,
    `💰 *Total de productos:* ${formatCurrency(coordinar ? productTotal : order.total)}`,
    `💳 *Pago:* ${paymentSummary(order)}`,
    `🚚 *Entrega:* ${entrega}${coordinar ? "\nℹ️ El costo del envío se coordina y abona por separado." : ""}`,
    cierre,
    "¡Muchas gracias! 😊",
  ].join("\n\n"));
}
