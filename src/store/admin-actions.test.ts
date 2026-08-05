import { describe, expect, it } from "vitest";
import type { Order, Product, Session } from "@/lib/types";
import {
  AUDIT_LOG_LIMIT,
  appendAuditEntry,
  applyDeleteProduct,
  applyReplaceProducts,
  applySaveProduct,
  applyUpdateOrderStatus,
} from "./admin-actions";

const now = Date.now();

const products: Product[] = [
  {
    id: "p1",
    slug: "p1",
    code: "P1",
    name: "Producto Uno",
    price: 100,
    rawPrice: "100",
    category: "Otros",
    brand: "X",
    image: null,
    images: [],
    stock: 5,
    lowStockThreshold: 2,
    active: true,
    featured: false,
    description: null,
    variants: [],
    source: "seed",
    sourceRow: 0,
    incomplete: [],
  },
];

const orders: Order[] = [
  {
    id: "o1",
    customerId: "customer-x@test.com",
    customerName: "X",
    email: "x@test.com",
    lines: [],
    total: 100,
    shipping: 0,
    deliveryMethod: "retiro",
    status: "pendiente",
    createdAt: new Date(now).toISOString(),
    paymentReference: "MP-1",
  },
];

const adminSession: Session = {
  user: { id: "admin-1", name: "Administrador Litoral Maq", email: "admin@litoralmaq.com", role: "admin" },
  token: "t",
  expiresAt: now + 60_000,
};
const expiredAdminSession: Session = { ...adminSession, expiresAt: now - 1000 };
const customerSession: Session = {
  user: { id: "customer-1", name: "Cliente", email: "cliente@test.com", role: "customer" },
  token: "t",
  expiresAt: now + 60_000,
};
const malformedNoUser = { token: "t", expiresAt: now + 60_000 } as unknown as Session;
const malformedBadExpiry = {
  user: { id: "admin-1", name: "Administrador Litoral Maq", email: "admin@litoralmaq.com", role: "admin" },
  token: "t",
  expiresAt: "no-es-numero",
} as unknown as Session;

const invalidScenarios: [string, Session | null][] = [
  ["sin adminSession", null],
  ["sesión vencida", expiredAdminSession],
  ["sesión con rol no administrador (customer)", customerSession],
  ["sesión malformada sin user", malformedNoUser],
  ["sesión malformada con expiresAt inválido", malformedBadExpiry],
];

describe("admin-actions: mutaciones bloqueadas sin sesión admin válida", () => {
  for (const [label, session] of invalidScenarios) {
    it(`saveProduct — ${label}`, () => {
      const result = applySaveProduct(products, session, { ...products[0], price: 999 });
      expect(result.applied).toBe(false);
      expect(result.next).toBe(products);
      expect(result.auditEntry).toBeNull();
    });

    it(`deleteProduct — ${label}`, () => {
      const result = applyDeleteProduct(products, session, "p1");
      expect(result.applied).toBe(false);
      expect(result.next).toBe(products);
      expect(result.auditEntry).toBeNull();
    });

    it(`replaceProducts — ${label}`, () => {
      const result = applyReplaceProducts(products, session, [{ ...products[0], id: "otro" }]);
      expect(result.applied).toBe(false);
      expect(result.next).toBe(products);
      expect(result.auditEntry).toBeNull();
    });

    it(`updateOrderStatus — ${label}`, () => {
      const result = applyUpdateOrderStatus(orders, session, "o1", "enviado");
      expect(result.applied).toBe(false);
      expect(result.next).toBe(orders);
      expect(result.auditEntry).toBeNull();
    });
  }
});

describe("admin-actions: sesión admin válida aplica una sola vez y audita", () => {
  it("saveProduct", () => {
    const result = applySaveProduct(products, adminSession, { ...products[0], price: 999 });
    expect(result.applied).toBe(true);
    expect(result.next).toHaveLength(1);
    expect(result.next[0].price).toBe(999);
    expect(result.auditEntry?.action).toBe("producto.guardar");
    expect(result.auditEntry?.adminId).toBe("admin-1");
    expect(result.auditEntry?.adminEmail).toBe("admin@litoralmaq.com");
    expect(result.auditEntry?.detail).toMatch(/P1/);
  });

  it("deleteProduct", () => {
    const result = applyDeleteProduct(products, adminSession, "p1");
    expect(result.applied).toBe(true);
    expect(result.next).toHaveLength(0);
    expect(result.auditEntry?.action).toBe("producto.eliminar");
    expect(result.auditEntry?.detail).toBe("p1");
  });

  it("replaceProducts", () => {
    const next = [{ ...products[0], id: "nuevo" }];
    const result = applyReplaceProducts(products, adminSession, next);
    expect(result.applied).toBe(true);
    expect(result.next).toBe(next);
    expect(result.auditEntry?.action).toBe("producto.sincronizar");
    expect(result.auditEntry?.detail).toBe("1 productos");
  });

  it("updateOrderStatus", () => {
    const result = applyUpdateOrderStatus(orders, adminSession, "o1", "enviado");
    expect(result.applied).toBe(true);
    expect(result.next[0].status).toBe("enviado");
    expect(result.auditEntry?.action).toBe("pedido.estado");
    expect(result.auditEntry?.detail).toBe("o1 → enviado");
  });
});

describe("appendAuditEntry: tope de entradas", () => {
  it("conserva las más recientes primero al superar el límite", () => {
    let log: ReturnType<typeof appendAuditEntry> = [];
    for (let i = 0; i < AUDIT_LOG_LIMIT + 5; i += 1) {
      log = appendAuditEntry(log, {
        id: `audit-${i}`,
        at: new Date(now + i).toISOString(),
        adminId: "admin-1",
        adminEmail: "admin@litoralmaq.com",
        action: "producto.guardar",
        detail: `entrada-${i}`,
      });
    }
    expect(log).toHaveLength(AUDIT_LOG_LIMIT);
    expect(log[0].id).toBe(`audit-${AUDIT_LOG_LIMIT + 4}`);
    expect(log[log.length - 1].id).toBe("audit-5");
    expect(log.some((entry) => entry.id === "audit-0")).toBe(false);
  });
});
