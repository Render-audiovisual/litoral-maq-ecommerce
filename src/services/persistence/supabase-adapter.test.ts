import { describe, expect, it } from "vitest";
import type { Order, Product } from "@/lib/types";
import { createSupabasePersistenceAdapter } from "./supabase-adapter";
import type { TypedSupabaseClient } from "./supabase/client";

type FakeResponse = { data: unknown; error: unknown };

/**
 * Doble mínimo del query builder de postgrest-js: soporta la cadena de
 * métodos que usa `supabase-adapter.ts` y es "thenable" en cualquier punto
 * de la cadena, igual que el cliente real. Registra cada llamada para poder
 * verificar tabla, método y payload sin tocar la red.
 */
class FakeQueryBuilder {
  calls: { method: string; args: unknown[] }[] = [];
  constructor(
    public table: string,
    private response: FakeResponse,
  ) {}
  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.record("select", args);
  }
  order(...args: unknown[]) {
    return this.record("order", args);
  }
  eq(...args: unknown[]) {
    return this.record("eq", args);
  }
  in(...args: unknown[]) {
    return this.record("in", args);
  }
  limit(...args: unknown[]) {
    return this.record("limit", args);
  }
  upsert(...args: unknown[]) {
    return this.record("upsert", args);
  }
  insert(...args: unknown[]) {
    return this.record("insert", args);
  }
  update(...args: unknown[]) {
    return this.record("update", args);
  }
  delete(...args: unknown[]) {
    return this.record("delete", args);
  }
  single() {
    return this.record("single", []);
  }
  maybeSingle() {
    return this.record("maybeSingle", []);
  }
  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

function createFakeClient(responses: Partial<Record<string, FakeResponse>>) {
  const builders: FakeQueryBuilder[] = [];
  const client = {
    from(table: string) {
      const builder = new FakeQueryBuilder(table, responses[table] ?? { data: null, error: null });
      builders.push(builder);
      return builder;
    },
  };
  return { client: client as unknown as TypedSupabaseClient, builders };
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

const productRow = {
  id: "p1",
  slug: "p1",
  code: "P1",
  name: "Producto Uno",
  price: 100,
  raw_price: "100",
  category: "Otros",
  brand: "X",
  image: null,
  images: [],
  stock: 5,
  low_stock_threshold: 2,
  active: true,
  featured: false,
  description: null,
  variants: [],
  source: "seed",
  source_row: 0,
  incomplete: [],
};

describe("supabase persistence adapter", () => {
  it("listProducts consulta la tabla products y mapea snake_case a camelCase", async () => {
    const { client, builders } = createFakeClient({ products: { data: [productRow], error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    const products = await adapter.listProducts();
    expect(builders[0].table).toBe("products");
    expect(products).toEqual([product]);
  });

  it("upsertProduct usa upsert con onConflict:'id' sobre la tabla products", async () => {
    const { client, builders } = createFakeClient({ products: { data: productRow, error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    await adapter.upsertProduct(product);
    const upsertCall = builders[0].calls.find((c) => c.method === "upsert");
    expect(upsertCall?.args[0]).toMatchObject({ id: "p1", code: "P1" });
    expect(upsertCall?.args[1]).toEqual({ onConflict: "id" });
  });

  it("deleteProduct filtra por id con eq", async () => {
    const { client, builders } = createFakeClient({ products: { data: null, error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    await adapter.deleteProduct("p1");
    expect(builders[0].calls.some((c) => c.method === "delete")).toBe(true);
    expect(builders[0].calls.find((c) => c.method === "eq")?.args).toEqual(["id", "p1"]);
  });

  it("propaga el error de Postgres en vez de tragárselo", async () => {
    const { client } = createFakeClient({ products: { data: null, error: new Error("boom") } });
    const adapter = createSupabasePersistenceAdapter(client);
    await expect(adapter.deleteProduct("p1")).rejects.toThrow("boom");
  });

  it("createOrder inserta el pedido mapeado a snake_case", async () => {
    const order: Order = {
      id: "o1",
      customerId: "customer-x@test.com",
      customerName: "X",
      email: "x@test.com",
      lines: [{ productId: "p1", quantity: 2 }],
      total: 200,
      shipping: 0,
      deliveryMethod: "retiro",
      status: "pendiente",
      createdAt: new Date().toISOString(),
      paymentReference: "MP-1",
    };
    const orderRow = {
      id: "o1",
      customer_id: "customer-x@test.com",
      customer_name: "X",
      email: "x@test.com",
      lines: order.lines,
      total: 200,
      shipping: 0,
      delivery_method: "retiro",
      address: null,
      status: "pendiente",
      created_at: order.createdAt,
      payment_reference: "MP-1",
    };
    const { client, builders } = createFakeClient({ orders: { data: orderRow, error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    const created = await adapter.createOrder(order);
    expect(builders[0].table).toBe("orders");
    const insertCall = builders[0].calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ customer_id: "customer-x@test.com", delivery_method: "retiro" });
    expect(created).toEqual(order);
  });

  it("ninguna query de orders usa select(*) — el contrato de Andreani es interno y no debe viajar al navegador", async () => {
    // Regresión: con select("*"), RLS (que filtra FILAS, no columnas) le
    // entregaría andreani_contract a cualquier customer leyendo su propio
    // pedido. Además 0007 revoca la columna, así que un select("*") pasaría
    // a fallar con "permission denied". Ver ORDER_COLUMNS en el adapter.
    const { client, builders } = createFakeClient({ orders: { data: [], error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    await adapter.listOrders();
    const selectArgs = builders[0].calls.filter((c) => c.method === "select").map((c) => c.args[0]);
    expect(selectArgs.length).toBeGreaterThan(0);
    for (const columns of selectArgs) {
      expect(columns).toBeTypeOf("string");
      expect(columns).not.toBe("*");
      expect(columns).not.toContain("andreani_contract");
      expect(columns).not.toContain("andreani_claim_state");
    }
  });

  it("updateOrderStatus devuelve null cuando no hay fila (maybeSingle sin match)", async () => {
    const { client } = createFakeClient({ orders: { data: null, error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    const result = await adapter.updateOrderStatus("no-existe", "enviado");
    expect(result).toBeNull();
  });

  it("reassignOrdersCustomer filtra por customer_id de origen y cuenta filas afectadas", async () => {
    const { client, builders } = createFakeClient({
      orders: { data: [{ id: "o1" }, { id: "o2" }], error: null },
    });
    const adapter = createSupabasePersistenceAdapter(client);
    const count = await adapter.reassignOrdersCustomer("guest-x@test.com", "customer-x@test.com");
    expect(count).toBe(2);
    expect(builders[0].calls.find((c) => c.method === "eq")?.args).toEqual(["customer_id", "guest-x@test.com"]);
    expect(builders[0].calls.find((c) => c.method === "update")?.args[0]).toEqual({
      customer_id: "customer-x@test.com",
    });
  });

  it("loadCart/saveCart no llaman a la red sin ownerId (requiere identidad Supabase real)", async () => {
    const { client, builders } = createFakeClient({});
    const adapter = createSupabasePersistenceAdapter(client);
    expect(await adapter.loadCart()).toEqual([]);
    await adapter.saveCart([{ productId: "p1", quantity: 1 }]);
    expect(builders).toHaveLength(0);
  });

  it("loadCart y saveCart quedan estrictamente vinculados al ownerId de la sesión", async () => {
    const lines = [{ productId: "p1", quantity: 2 }];
    const { client, builders } = createFakeClient({ carts: { data: { lines }, error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    await expect(adapter.loadCart("usuario-a")).resolves.toEqual(lines);
    await adapter.saveCart(lines, "usuario-a");
    expect(builders[0].calls.find((c) => c.method === "eq")?.args).toEqual(["owner_id", "usuario-a"]);
    expect(builders[1].calls.find((c) => c.method === "upsert")?.args).toEqual([
      { owner_id: "usuario-a", lines }, { onConflict: "owner_id" },
    ]);
  });

  it("appendAuditEntry inserta en audit_log con las columnas esperadas", async () => {
    const { client, builders } = createFakeClient({ audit_log: { data: null, error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    await adapter.appendAuditEntry({
      id: "audit-1",
      at: new Date().toISOString(),
      adminId: "admin-1",
      adminEmail: "admin@litoralmaq.com",
      action: "producto.guardar",
      detail: "P1",
    });
    expect(builders[0].table).toBe("audit_log");
    const insertCall = builders[0].calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ admin_id: "admin-1", admin_email: "admin@litoralmaq.com" });
  });

  it("listAuditLog ordena por at descendente y respeta el límite", async () => {
    const { client, builders } = createFakeClient({ audit_log: { data: [], error: null } });
    const adapter = createSupabasePersistenceAdapter(client);
    await adapter.listAuditLog(50);
    expect(builders[0].calls.find((c) => c.method === "order")?.args).toEqual(["at", { ascending: false }]);
    expect(builders[0].calls.find((c) => c.method === "limit")?.args).toEqual([50]);
  });
});
