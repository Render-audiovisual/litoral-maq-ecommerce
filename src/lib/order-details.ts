import type { Order, OrderLine, Product } from "./types";

export type ResolvedOrderLine = OrderLine & {
  productName: string;
  productCode: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  historicalSnapshot: boolean;
};

export const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  pendiente: "Pendiente",
  pago_simulado: "Pago demo",
  preparando: "Preparando",
  listo: "Listo para entregar",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** Etiquetas del circuito operativo que ve el equipo en el panel. */
export const ADMIN_ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  pendiente: "Paso 0 · Pedido recibido",
  pago_simulado: "Paso 0 · Pedido de prueba",
  preparando: "Paso 1 · Preparando",
  listo: "Paso 2 · Listo para entregar",
  enviado: "Paso 3 · Enviado",
  entregado: "Paso 4 · Entregado",
  cancelado: "Cancelado · Fuera del circuito",
};

export const ORDER_STATUS_MESSAGES: Record<Order["status"], string> = {
  pendiente:
    "Recibimos tu solicitud. Estamos verificando stock, entrega y total final.",
  pago_simulado: "Este es un pedido histórico del período de pruebas.",
  preparando: "Tu pedido fue confirmado y el equipo lo está preparando.",
  listo: "Tu pedido está preparado y listo para retirar o despachar.",
  enviado:
    "Tu pedido ya salió. El negocio te compartirá el seguimiento disponible.",
  entregado: "El pedido figura como entregado.",
  cancelado:
    "La solicitud fue cancelada. Si necesitás ayuda, comunicate con Litoral Maq.",
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
    if (status === "entregado") return "Retirado · Fuera del circuito";
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
