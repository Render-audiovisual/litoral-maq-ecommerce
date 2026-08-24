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
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function snapshotOrderLines(lines: OrderLine[], products: Product[]): OrderLine[] {
  return lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    return {
      productId: line.productId,
      quantity: line.quantity,
      productName: product?.name ?? line.productName ?? "Producto no disponible",
      productCode: product?.code ?? line.productCode ?? null,
      unitPrice: product?.price ?? line.unitPrice ?? null,
    };
  });
}

export function resolveOrderLines(order: Order, products: Product[]): ResolvedOrderLine[] {
  return order.lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const unitPrice = line.unitPrice ?? product?.price ?? null;
    return {
      ...line,
      productName: line.productName ?? product?.name ?? "Producto no disponible",
      productCode: line.productCode ?? product?.code ?? null,
      unitPrice,
      lineTotal: unitPrice === null ? null : unitPrice * line.quantity,
      historicalSnapshot: line.productName !== undefined && line.unitPrice !== undefined,
    };
  });
}
