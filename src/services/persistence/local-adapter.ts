import productsSeed from "@/data/products.json";
import { normalizeEmail } from "@/lib/auth";
import type { AuditEntry, CartLine, Customer, Order, Product } from "@/lib/types";
import { AUDIT_LOG_LIMIT } from "@/store/admin-actions";
import type { PersistenceAdapter } from "./types";

const KEYS = {
  products: "litoral-products-v1",
  cart: "litoral-cart-v1",
  orders: "litoral-orders-v1",
  customers: "litoral-customers-v1",
  auditLog: "litoral-admin-audit-log-v1",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Adaptador activo por defecto: persiste en localStorage, con las mismas
 * claves que usaba `store.tsx` antes de la Etapa 5. Es también el camino de
 * rollback si el adaptador Supabase no está disponible o configurado.
 */
export function createLocalPersistenceAdapter(): PersistenceAdapter {
  return {
    async listProducts() {
      // Distingue "nunca se guardó nada" (primera visita: arranca del seed
      // de 460 productos reales) de "se guardó un catálogo vacío" (el
      // admin borró todo a propósito: se respeta, no se re-siembra).
      if (typeof window === "undefined") return productsSeed as Product[];
      const raw = window.localStorage.getItem(KEYS.products);
      if (raw === null) return productsSeed as Product[];
      try {
        return JSON.parse(raw) as Product[];
      } catch {
        return productsSeed as Product[];
      }
    },
    async upsertProduct(product) {
      const products = read<Product[]>(KEYS.products, []);
      const exists = products.some((item) => item.id === product.id);
      const next = exists
        ? products.map((item) => (item.id === product.id ? product : item))
        : [product, ...products];
      write(KEYS.products, next);
      return product;
    },
    async deleteProduct(id) {
      const products = read<Product[]>(KEYS.products, []);
      write(
        KEYS.products,
        products.filter((product) => product.id !== id),
      );
    },
    async replaceCatalog(products) {
      write(KEYS.products, products);
      return products;
    },

    async listCustomers() {
      return read<Customer[]>(KEYS.customers, []);
    },
    async upsertCustomer(customer) {
      const customers = read<Customer[]>(KEYS.customers, []);
      const email = normalizeEmail(customer.email);
      const index = customers.findIndex((item) => normalizeEmail(item.email) === email);
      const normalized = { ...customer, email };
      const next =
        index === -1
          ? [normalized, ...customers]
          : customers.map((item, itemIndex) => (itemIndex === index ? { ...item, ...normalized } : item));
      write(KEYS.customers, next);
      return normalized;
    },

    async listOrders() {
      return read<Order[]>(KEYS.orders, []);
    },
    async createOrder(order) {
      const orders = read<Order[]>(KEYS.orders, []);
      write(KEYS.orders, [order, ...orders]);
      return order;
    },
    async updateOrderStatus(id, status) {
      const orders = read<Order[]>(KEYS.orders, []);
      let updated: Order | null = null;
      const next = orders.map((order) => {
        if (order.id !== id) return order;
        updated = { ...order, status };
        return updated;
      });
      write(KEYS.orders, next);
      return updated;
    },
    async updateOrderPaymentStatus(id, paymentStatus) {
      const orders = read<Order[]>(KEYS.orders, []);
      let updated: Order | null = null;
      const next = orders.map((order) => {
        if (order.id !== id) return order;
        updated = { ...order, paymentStatus };
        return updated;
      });
      write(KEYS.orders, next);
      return updated;
    },
    async reassignOrdersCustomer(fromCustomerId, toCustomerId) {
      const orders = read<Order[]>(KEYS.orders, []);
      let count = 0;
      const next = orders.map((order) => {
        if (order.customerId !== fromCustomerId) return order;
        count += 1;
        return { ...order, customerId: toCustomerId };
      });
      if (count > 0) write(KEYS.orders, next);
      return count;
    },

    async loadCart() {
      // Un único carrito global por navegador (sin dueño); ownerId queda
      // preparado para cuando exista una identidad Supabase real por sesión.
      return read<CartLine[]>(KEYS.cart, []);
    },
    async saveCart(cart) {
      write(KEYS.cart, cart);
    },

    async listAuditLog(limit = AUDIT_LOG_LIMIT) {
      return read<AuditEntry[]>(KEYS.auditLog, []).slice(0, limit);
    },
    async appendAuditEntry(entry) {
      const current = read<AuditEntry[]>(KEYS.auditLog, []);
      const next = [entry, ...current].slice(0, AUDIT_LOG_LIMIT);
      write(KEYS.auditLog, next);
    },
  };
}
