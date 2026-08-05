import { isValidAdminSession } from "../lib/auth";
import type { AuditEntry, Order, Product, Session } from "../lib/types";

export const AUDIT_LOG_LIMIT = 200;

export type AdminMutationResult<T> = {
  applied: boolean;
  next: T;
  auditEntry: AuditEntry | null;
};

function createAuditEntry(admin: Session, action: string, detail: string, now: number = Date.now()): AuditEntry {
  return {
    id: `audit-${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(now).toISOString(),
    adminId: admin.user.id,
    adminEmail: admin.user.email,
    action,
    detail,
  };
}

export function appendAuditEntry(current: AuditEntry[], entry: AuditEntry): AuditEntry[] {
  return [entry, ...current].slice(0, AUDIT_LOG_LIMIT);
}

export function applySaveProduct(
  products: Product[],
  adminSession: Session | null,
  product: Product,
): AdminMutationResult<Product[]> {
  if (!isValidAdminSession(adminSession)) {
    return { applied: false, next: products, auditEntry: null };
  }
  const exists = products.some((item) => item.id === product.id);
  const next = exists
    ? products.map((item) => (item.id === product.id ? product : item))
    : [product, ...products];
  return {
    applied: true,
    next,
    auditEntry: createAuditEntry(adminSession, "producto.guardar", `${product.code || product.id} · ${product.name}`),
  };
}

export function applyDeleteProduct(
  products: Product[],
  adminSession: Session | null,
  id: string,
): AdminMutationResult<Product[]> {
  if (!isValidAdminSession(adminSession)) {
    return { applied: false, next: products, auditEntry: null };
  }
  return {
    applied: true,
    next: products.filter((product) => product.id !== id),
    auditEntry: createAuditEntry(adminSession, "producto.eliminar", id),
  };
}

export function applyReplaceProducts(
  products: Product[],
  adminSession: Session | null,
  next: Product[],
): AdminMutationResult<Product[]> {
  if (!isValidAdminSession(adminSession)) {
    return { applied: false, next: products, auditEntry: null };
  }
  return {
    applied: true,
    next,
    auditEntry: createAuditEntry(adminSession, "producto.sincronizar", `${next.length} productos`),
  };
}

export function applyUpdateOrderStatus(
  orders: Order[],
  adminSession: Session | null,
  id: string,
  status: Order["status"],
): AdminMutationResult<Order[]> {
  if (!isValidAdminSession(adminSession)) {
    return { applied: false, next: orders, auditEntry: null };
  }
  return {
    applied: true,
    next: orders.map((order) => (order.id === id ? { ...order, status } : order)),
    auditEntry: createAuditEntry(adminSession, "pedido.estado", `${id} → ${status}`),
  };
}
