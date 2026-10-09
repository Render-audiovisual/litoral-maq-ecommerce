import type { Order } from "@/lib/types";
import { isConfirmedOperationalOrder } from "@/lib/orders";

export type SalesPeriod = 7 | 30 | 90;

export type SalesPoint = {
  label: string;
  total: number;
  orders: number;
};

export type ProductRanking = {
  key: string;
  name: string;
  units: number;
  total: number;
};

export type SalesAnalytics = {
  approvedTotal: number;
  approvedOrders: number;
  averageTicket: number;
  units: number;
  previousTotal: number;
  changePercent: number | null;
  refundedTotal: number;
  points: SalesPoint[];
  topProducts: ProductRanking[];
};

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function orderInRange(order: Order, from: Date, to: Date) {
  const createdAt = validDate(order.createdAt);
  return !!createdAt && createdAt >= from && createdAt < to;
}

function approved(order: Order) {
  return order.paymentStatus === "approved" && order.status !== "cancelado";
}

export function getSalesAnalytics(
  orders: Order[],
  period: SalesPeriod,
  now = new Date(),
): SalesAnalytics {
  const tomorrow = addDays(startOfDay(now), 1);
  const currentFrom = addDays(tomorrow, -period);
  const previousFrom = addDays(currentFrom, -period);
  const current = orders.filter(
    (order) => approved(order) && orderInRange(order, currentFrom, tomorrow),
  );
  const previous = orders.filter(
    (order) => approved(order) && orderInRange(order, previousFrom, currentFrom),
  );
  const approvedTotal = current.reduce((sum, order) => sum + order.total, 0);
  const previousTotal = previous.reduce((sum, order) => sum + order.total, 0);
  const refundedTotal = orders
    .filter(
      (order) =>
        ["refunded", "charged_back"].includes(order.paymentStatus ?? "") &&
        orderInRange(order, currentFrom, tomorrow),
    )
    .reduce((sum, order) => sum + order.total, 0);
  const units = current.reduce(
    (sum, order) =>
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  );
  const bucketCount = period === 7 ? 7 : period === 30 ? 10 : 9;
  const bucketDays = period / bucketCount;
  const points = Array.from({ length: bucketCount }, (_, index) => {
    const from = addDays(currentFrom, Math.round(index * bucketDays));
    const to = index === bucketCount - 1
      ? tomorrow
      : addDays(currentFrom, Math.round((index + 1) * bucketDays));
    const bucketOrders = current.filter((order) => orderInRange(order, from, to));
    const label = period === 7
      ? from.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "")
      : from.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    return {
      label,
      total: bucketOrders.reduce((sum, order) => sum + order.total, 0),
      orders: bucketOrders.length,
    };
  });
  const ranking = new Map<string, ProductRanking>();
  for (const order of current) {
    for (const line of order.lines) {
      const key = line.productId;
      const currentProduct = ranking.get(key) ?? {
        key,
        name: line.productName || line.productCode || "Producto sin nombre",
        units: 0,
        total: 0,
      };
      currentProduct.units += line.quantity;
      currentProduct.total += (line.unitPrice ?? 0) * line.quantity;
      ranking.set(key, currentProduct);
    }
  }
  return {
    approvedTotal,
    approvedOrders: current.length,
    averageTicket: current.length ? approvedTotal / current.length : 0,
    units,
    previousTotal,
    changePercent:
      previousTotal > 0
        ? ((approvedTotal - previousTotal) / previousTotal) * 100
        : approvedTotal > 0
          ? null
          : 0,
    refundedTotal,
    points,
    topProducts: [...ranking.values()]
      .sort((a, b) => b.units - a.units || b.total - a.total)
      .slice(0, 5),
  };
}

export function customerHasPurchase(orders: Order[], customerId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return orders.some(
    (order) =>
      (order.customerId === customerId || order.email.trim().toLowerCase() === normalizedEmail) &&
      order.status !== "pago_simulado" &&
      isConfirmedOperationalOrder(order),
  );
}
