import { describe, expect, it } from "vitest";
import type { Order, Product } from "./types";
import { ADMIN_ORDER_STATUS_LABELS, isActiveOrder, ORDER_STATUS_MESSAGES, resolveOrderLines, snapshotOrderLines } from "./order-details";

const product = { id: "p1", name: "Taladro", code: "T-1", price: 250 } as Product;

describe("detalle histórico de pedidos", () => {
  it("guarda nombre, código y precio vigentes al crear el pedido", () => {
    expect(snapshotOrderLines([{ productId: "p1", quantity: 2 }], [product])).toEqual([{
      productId: "p1", quantity: 2, productName: "Taladro", productCode: "T-1", unitPrice: 250,
    }]);
  });

  it("prioriza la foto histórica aunque el catálogo cambie", () => {
    const order = { lines: [{ productId: "p1", quantity: 2, productName: "Nombre original", productCode: "T-1", unitPrice: 200 }] } as Order;
    const resolved = resolveOrderLines(order, [{ ...product, name: "Nombre nuevo", price: 999 }]);
    expect(resolved[0]).toMatchObject({ productName: "Nombre original", unitPrice: 200, lineTotal: 400, historicalSnapshot: true });
  });

  it("resuelve pedidos heredados con el catálogo actual", () => {
    const order = { lines: [{ productId: "p1", quantity: 1 }] } as Order;
    expect(resolveOrderLines(order, [product])[0]).toMatchObject({ productName: "Taladro", unitPrice: 250, historicalSnapshot: false });
  });

  it("expone mensajes de seguimiento y distingue pedidos activos", () => {
    expect(ORDER_STATUS_MESSAGES.pendiente).toMatch(/verificando stock/i);
    expect(isActiveOrder({ status: "preparando" } as Order)).toBe(true);
    expect(isActiveOrder({ status: "entregado" } as Order)).toBe(false);
  });

  it("enumera el circuito operativo del panel desde el paso cero", () => {
    expect(ADMIN_ORDER_STATUS_LABELS.pendiente).toBe("Paso 0 · Pedido recibido");
    expect(ADMIN_ORDER_STATUS_LABELS.preparando).toBe("Paso 1 · Preparando");
    expect(ADMIN_ORDER_STATUS_LABELS.listo).toBe("Paso 2 · Listo para entregar");
    expect(ADMIN_ORDER_STATUS_LABELS.enviado).toBe("Paso 3 · Enviado");
    expect(ADMIN_ORDER_STATUS_LABELS.entregado).toBe("Paso 4 · Entregado");
    expect(ADMIN_ORDER_STATUS_LABELS.cancelado).not.toMatch(/Paso/);
  });
});
