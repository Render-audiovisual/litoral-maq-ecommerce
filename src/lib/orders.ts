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
    (order) => order.customerId === session.user.id || normalizeEmail(order.email) === sessionEmail,
  );
}
