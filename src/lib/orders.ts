import { normalizeEmail } from "./auth";
import type { Order, Session } from "./types";

/**
 * Aislamiento por usuario: un cliente solo ve sus propios pedidos,
 * vinculados primero por `customerId` estable y, como respaldo, por email
 * normalizado (para pedidos heredados que solo coinciden por email).
 */
export function selectOwnOrders(orders: Order[], session: Session): Order[] {
  const sessionEmail = normalizeEmail(session.user.email);
  return orders.filter(
    (order) =>
      (order.customerId === session.user.id || normalizeEmail(order.email) === sessionEmail) &&
      !isExpiredUnpaidOrder(order),
  );
}

/**
 * Pedido cancelado sin haberse pagado (vencido a las 24 h). Al cliente no le
 * sirve verlo en su historial: si quiere seguir, hace un pedido nuevo. El panel
 * sí lo sigue mostrando para recontactar por WhatsApp.
 */
/**
 * El botón "Contactar por WhatsApp" del panel es para retomar una venta que
 * nunca se pagó. No aplica a pedidos pagados, reintegrados, con contracargo
 * ni ya entregados.
 */
export function canRecontactUnpaidOrder(order: Order) {
  const payment = order.paymentStatus ?? "pending";
  return ["pending", "cancelled", "rejected"].includes(payment) && order.status !== "entregado";
}

export function isExpiredUnpaidOrder(order: Order) {
  const payment = order.paymentStatus ?? "pending";
  return order.status === "cancelado" && (payment === "pending" || payment === "cancelled");
}
