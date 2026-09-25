import type { Order } from "./types";

export type OrderDelayKind = "paid-not-started" | "ready-not-collected" | "shipped-not-closed";
export type OrderDelay = { kind: OrderDelayKind; hours: number; label: string };

/** Horas en el estado actual a partir de las cuales el pedido se marca como demorado. */
export const DELAY_THRESHOLD_HOURS = {
  paidNotStarted: 24,
  readyNotCollected: 72,
  shippedNotClosed: 168,
} as const;

export function humanizeElapsed(hours: number) {
  if (hours < 1) return "hace menos de 1 h";
  if (hours < 24) return `hace ${Math.floor(hours)} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/**
 * Pedidos que llevan demasiado tiempo en el mismo paso. Los pendientes sin
 * pago no entran: ya tienen su circuito de seguimiento y vencimiento.
 */
export function getOrderDelay(order: Order, now: Date): OrderDelay | null {
  const since = Date.parse(order.statusChangedAt ?? order.createdAt);
  if (Number.isNaN(since)) return null;
  const hours = Math.floor((now.getTime() - since) / 3_600_000);
  const delay = (kind: OrderDelayKind, threshold: number, text: string) =>
    hours >= threshold ? { kind, hours, label: `${text} ${humanizeElapsed(hours)}` } : null;

  if (order.status === "pendiente" && order.paymentStatus === "approved") {
    return delay("paid-not-started", DELAY_THRESHOLD_HOURS.paidNotStarted, "Pagado sin preparar");
  }
  if (order.status === "listo") {
    return delay(
      "ready-not-collected",
      DELAY_THRESHOLD_HOURS.readyNotCollected,
      order.deliveryMethod === "retiro" ? "Listo sin retirar" : "Listo sin despachar",
    );
  }
  if (order.status === "enviado") {
    return delay("shipped-not-closed", DELAY_THRESHOLD_HOURS.shippedNotClosed, "Enviado sin cerrar");
  }
  return null;
}
