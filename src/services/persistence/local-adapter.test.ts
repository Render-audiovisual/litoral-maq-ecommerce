import { beforeEach, describe, expect, it } from "vitest";
import type { Order, Product } from "@/lib/types";
import { createLocalPersistenceAdapter } from "./local-adapter";

function installLocalStorageShim() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  // @ts-expect-error shim mínimo de window para el entorno de test (sin jsdom)
  globalThis.window = { localStorage };
  return localStorage;
}

const product: Product = {
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
};

const order: Order = {
  id: "o1",
  customerId: "guest-x@test.com",
  customerName: "X",
  email: "x@test.com",
  lines: [],
  total: 100,
  shipping: 0,
  deliveryMethod: "retiro",
  status: "pendiente",
  createdAt: new Date().toISOString(),
  paymentReference: "MP-1",
};

describe("local persistence adapter", () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  it("listProducts arranca del catálogo completo cuando nunca se guardó nada", async () => {
    const adapter = createLocalPersistenceAdapter();
    const products = await adapter.listProducts();
    expect(products.length).toBe(495);
  });

  it("respeta un catálogo vacío guardado explícitamente (no re-siembra)", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.replaceCatalog([]);
    const products = await adapter.listProducts();
    expect(products).toEqual([]);
  });

  it("upsertProduct inserta y luego actualiza sin duplicar", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.replaceCatalog([]);
    await adapter.upsertProduct(product);
    await adapter.upsertProduct({ ...product, price: 999 });
    const products = await adapter.listProducts();
    expect(products).toHaveLength(1);
    expect(products[0].price).toBe(999);
  });

  it("deleteProduct elimina por id", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.replaceCatalog([product]);
    await adapter.deleteProduct("p1");
    expect(await adapter.listProducts()).toEqual([]);
  });

  it("createOrder y updateOrderStatus", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.createOrder(order);
    const updated = await adapter.updateOrderStatus("o1", "enviado");
    expect(updated?.status).toBe("enviado");
    const orders = await adapter.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("enviado");
  });

  it("updateOrderStatus sobre un id inexistente no rompe y devuelve null", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.createOrder(order);
    const updated = await adapter.updateOrderStatus("no-existe", "enviado");
    expect(updated).toBeNull();
  });

  it("reassignOrdersCustomer reasigna solo los pedidos del id de origen", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.createOrder(order);
    await adapter.createOrder({ ...order, id: "o2", customerId: "guest-otro@test.com" });
    const count = await adapter.reassignOrdersCustomer("guest-x@test.com", "customer-x@test.com");
    expect(count).toBe(1);
    const orders = await adapter.listOrders();
    expect(orders.find((o) => o.id === "o1")?.customerId).toBe("customer-x@test.com");
    expect(orders.find((o) => o.id === "o2")?.customerId).toBe("guest-otro@test.com");
  });

  it("upsertCustomer deduplica por email normalizado y conserva el teléfono existente", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.upsertCustomer({ id: "guest-x", name: "X", email: "x@test.com", phone: "123", role: "customer" });
    await adapter.upsertCustomer({ id: "customer-x", name: "X registrada", email: " X@Test.com ", role: "customer" });
    const customers = await adapter.listCustomers();
    expect(customers).toHaveLength(1);
    expect(customers[0].phone).toBe("123");
    expect(customers[0].name).toBe("X registrada");
  });

  it("appendAuditEntry acota al tope y lista con la más reciente primero", async () => {
    const adapter = createLocalPersistenceAdapter();
    for (let i = 0; i < 205; i += 1) {
      await adapter.appendAuditEntry({
        id: `audit-${i}`,
        at: new Date().toISOString(),
        adminId: "admin-1",
        adminEmail: "admin@litoralmaq.com",
        action: "producto.guardar",
        detail: `entrada-${i}`,
      });
    }
    const log = await adapter.listAuditLog();
    expect(log).toHaveLength(200);
    expect(log[0].id).toBe("audit-204");
  });

  it("saveCart / loadCart persisten el carrito", async () => {
    const adapter = createLocalPersistenceAdapter();
    await adapter.saveCart([{ productId: "p1", quantity: 3 }]);
    expect(await adapter.loadCart()).toEqual([{ productId: "p1", quantity: 3 }]);
  });
});
