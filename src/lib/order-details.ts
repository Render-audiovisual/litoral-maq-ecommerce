import type { Order, OrderLine, PaymentStatus, Product } from "./types";

export type ResolvedOrderLine = OrderLine & {
  productName: string;
  productCode: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  historicalSnapshot: boolean;
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  approved: "Confirmado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reintegrado",
  charged_back: "Contracargo",
};

export const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  pendiente: "Pendiente",
  pago_simulado: "Pedido histórico",
  preparando: "Preparando",
  listo: "Listo para entregar",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/**
 * Empresas de envío que el cliente elige cuando el envío no se cotiza en el
 * momento. Litoral Maq le pasa el costo con esa empresa después del pago.
 */
export const SHIPPING_CARRIER_OPTIONS = ["Vía Cargo", "OCA", "Andreani"] as const;

/** Provincias con el código que usan los correos (el que guarda el pedido). */
export const PROVINCES = [
  ["B", "Buenos Aires"],
  ["C", "Ciudad Autónoma de Buenos Aires"],
  ["K", "Catamarca"],
  ["H", "Chaco"],
  ["U", "Chubut"],
  ["W", "Corrientes"],
  ["X", "Córdoba"],
  ["E", "Entre Ríos"],
  ["P", "Formosa"],
  ["Y", "Jujuy"],
  ["L", "La Pampa"],
  ["F", "La Rioja"],
  ["M", "Mendoza"],
  ["N", "Misiones"],
  ["Q", "Neuquén"],
  ["R", "Río Negro"],
  ["A", "Salta"],
  ["J", "San Juan"],
  ["D", "San Luis"],
  ["Z", "Santa Cruz"],
  ["S", "Santa Fe"],
  ["G", "Santiago del Estero"],
  ["V", "Tierra del Fuego"],
  ["T", "Tucumán"],
] as const;

/** "W" → "Corrientes". Un valor que no es código (pedidos viejos) queda igual. */
export function provinceName(province?: string) {
  return PROVINCES.find(([code]) => code === province)?.[1] ?? province ?? "";
}

/**
 * Dirección que se guarda en el pedido. A sucursal sin cotización automática
 * todavía no hay sucursal elegida: se guarda el destino (localidad y CP), nunca
 * la calle del domicilio.
 */
export function buildOrderAddress(input: {
  deliveryType: "domicilio" | "sucursal";
  branchName?: string | null;
  branchAddress?: string | null;
  street: string;
  streetNumber: string;
  floor?: string;
  apartment?: string;
  locality: string;
  postalCode: string;
}) {
  const locality = input.locality.trim();
  if (input.deliveryType === "sucursal") {
    return input.branchName || input.branchAddress
      ? `${input.branchName || "Sucursal"} · ${input.branchAddress || locality}`
      : `Sucursal del correo a coordinar · ${locality} · CP ${input.postalCode}`;
  }
  const floor = input.floor?.trim();
  const apartment = input.apartment?.trim();
  return `${input.street.trim()} ${input.streetNumber.trim()}${floor ? ` · Piso ${floor}` : ""}${apartment ? ` · Depto ${apartment}` : ""} · ${locality} · CP ${input.postalCode}`;
}

/** Texto de la forma de entrega para el panel, Mis pedidos y los mensajes. */
export function deliveryLabel(order: Pick<Order, "deliveryMethod" | "shippingDeliveryType">) {
  if (order.deliveryMethod === "retiro") return "Retiro en Sáenz 1587";
  return order.shippingDeliveryType === "sucursal" ? "Envío a sucursal del correo" : "Envío a domicilio";
}

/**
 * Envío a coordinar: el cliente paga los productos y el envío se arregla aparte.
 * Pasa cuando no hubo cotización automática (por ejemplo, otra provincia).
 */
export function isShippingToCoordinate(
  order: Pick<Order, "deliveryMethod" | "shippingQuoteId" | "shippingStatus">,
) {
  return order.deliveryMethod === "envio" &&
    (!order.shippingQuoteId || order.shippingStatus === "manual_quote");
}

/** Etiquetas del circuito operativo que ve el equipo en el panel. */
export const ADMIN_ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  pendiente: "Paso 0 · Pedido recibido",
  pago_simulado: "Pedido histórico",
  preparando: "Paso 1 · Preparando",
  listo: "Paso 2 · Listo para entregar",
  enviado: "Paso 3 · Enviado",
  entregado: "Paso 4 · Entregado",
  cancelado: "Cancelado",
};

export const ORDER_STATUS_MESSAGES: Record<Order["status"], string> = {
  pendiente:
    "Recibimos tu pedido. Se confirma cuando Mercado Pago acredita el pago.",
  pago_simulado: "Pedido histórico.",
  preparando: "Tu pedido fue confirmado y el equipo lo está preparando.",
  listo: "Tu pedido está preparado y listo para retirar o despachar.",
  enviado:
    "Tu pedido ya salió. El negocio te compartirá el seguimiento disponible.",
  entregado: "El pedido figura como entregado.",
  cancelado:
    "El pedido fue cancelado. Si necesitás ayuda, comunicate con Litoral Maq.",
};

const DELIVERY_STATUS_FLOW: Record<
  Order["deliveryMethod"],
  Order["status"][]
> = {
  envio: ["pendiente", "preparando", "listo", "enviado", "entregado", "cancelado"],
  retiro: ["pendiente", "preparando", "listo", "entregado", "cancelado"],
};

/**
 * El retiro en sucursal no atraviesa el paso "Enviado": se prepara, se
 * avisa que está listo y finalmente se marca como retirado. Conservamos el
 * estado actual al principio para que un pedido histórico con una combinación
 * vieja pueda corregirse desde el panel.
 */
export function orderStatusOptions(order: Order) {
  const flow = DELIVERY_STATUS_FLOW[order.deliveryMethod];
  return flow.includes(order.status) ? flow : [order.status, ...flow];
}

export function adminOrderStatusLabel(
  status: Order["status"],
  deliveryMethod: Order["deliveryMethod"],
) {
  if (deliveryMethod === "retiro") {
    if (status === "listo") return "Paso 2 · Listo para retirar";
    if (status === "entregado") return "Retirado";
  }
  if (deliveryMethod === "envio" && status === "listo") {
    return "Paso 2 · Listo para despachar";
  }
  return ADMIN_ORDER_STATUS_LABELS[status];
}

export function orderStatusLabel(order: Order) {
  if (order.deliveryMethod === "retiro") {
    if (order.status === "listo") return "Listo para retirar";
    if (order.status === "entregado") return "Retirado";
  }
  return ORDER_STATUS_LABELS[order.status];
}

export function orderStatusMessage(order: Order) {
  if (order.status === "pendiente" && process.env.NEXT_PUBLIC_MERCADO_PAGO_ENABLED !== "true") {
    return "Recibimos tu pedido. Te contactamos para coordinar el pago.";
  }
  if (order.deliveryMethod === "retiro") {
    if (order.status === "listo") {
      return "Tu pedido está preparado. Ya podés retirarlo en Sáenz 1587.";
    }
    if (order.status === "entregado") {
      return "Tu pedido ya fue retirado de la sucursal.";
    }
  }
  return ORDER_STATUS_MESSAGES[order.status];
}

export function isActiveOrder(order: Order) {
  return !["entregado", "cancelado"].includes(order.status);
}

export function snapshotOrderLines(
  lines: OrderLine[],
  products: Product[],
): OrderLine[] {
  return lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    return {
      productId: line.productId,
      quantity: line.quantity,
      productName:
        product?.name ?? line.productName ?? "Producto no disponible",
      productCode: product?.code ?? line.productCode ?? null,
      unitPrice: product?.price ?? line.unitPrice ?? null,
    };
  });
}

export function resolveOrderLines(
  order: Order,
  products: Product[],
): ResolvedOrderLine[] {
  return order.lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const unitPrice = line.unitPrice ?? product?.price ?? null;
    return {
      ...line,
      productName:
        line.productName ?? product?.name ?? "Producto no disponible",
      productCode: line.productCode ?? product?.code ?? null,
      unitPrice,
      lineTotal: unitPrice === null ? null : unitPrice * line.quantity,
      historicalSnapshot:
        line.productName !== undefined && line.unitPrice !== undefined,
    };
  });
}
