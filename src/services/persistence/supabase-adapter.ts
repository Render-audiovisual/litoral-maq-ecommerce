import type { CartLine, Order, Product } from "@/lib/types";
import type { TypedSupabaseClient } from "./supabase/client";
import type { Database } from "./supabase/database.types";
import type { PersistenceAdapter } from "./types";

/**
 * Implementación real contra Postgres/Supabase, siguiendo el esquema de
 * `supabase/migrations/`. Recibe un cliente ya construido (ver
 * `supabase/client.ts`) para poder testearse con un cliente falso, sin
 * tocar la red. No se activa hasta que `services/persistence/index.ts`
 * decida que hay configuración válida — hoy ese proyecto no existe, así
 * que este archivo nunca corre en producción todavía, pero queda listo
 * para conectarse sin tocar la UI ni el store.
 */

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];

function productToInsert(product: Product): Database["public"]["Tables"]["products"]["Insert"] {
  return {
    id: product.id,
    slug: product.slug,
    code: product.code ?? product.id,
    name: product.name,
    price: product.price,
    raw_price: product.rawPrice,
    category: product.category,
    brand: product.brand,
    image: product.image,
    images: product.images,
    stock: product.stock,
    low_stock_threshold: product.lowStockThreshold,
    active: product.active,
    featured: product.featured,
    description: product.description,
    variants: product.variants,
    source: product.source,
    source_row: product.sourceRow,
    incomplete: product.incomplete,
  };
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    code: row.code,
    name: row.name,
    price: row.price,
    rawPrice: row.raw_price,
    category: row.category,
    brand: row.brand,
    image: row.image,
    images: row.images ?? [],
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    active: row.active,
    featured: row.featured,
    description: row.description,
    variants: row.variants ?? [],
    source: row.source,
    sourceRow: row.source_row ?? 0,
    incomplete: row.incomplete ?? [],
  };
}

function orderToInsert(order: Order): Database["public"]["Tables"]["orders"]["Insert"] {
  return {
    id: order.id,
    customer_id: order.customerId,
    customer_name: order.customerName,
    email: order.email,
    lines: order.lines,
    total: order.total,
    shipping: order.shipping,
    delivery_method: order.deliveryMethod,
    address: order.address ?? null,
    status: order.status,
    created_at: order.createdAt,
    payment_reference: order.paymentReference,
  };
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    email: row.email,
    lines: row.lines as CartLine[],
    total: row.total,
    shipping: row.shipping,
    deliveryMethod: row.delivery_method,
    address: row.address ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    paymentReference: row.payment_reference ?? "",
  };
}

function rowToCustomer(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? undefined,
    role: row.role,
  };
}

function rowToAudit(row: AuditRow) {
  return {
    id: row.id,
    at: row.at,
    adminId: row.admin_id ?? "",
    adminEmail: row.admin_email,
    action: row.action,
    detail: row.detail,
  };
}

export function createSupabasePersistenceAdapter(client: TypedSupabaseClient): PersistenceAdapter {
  return {
    async listProducts() {
      const { data, error } = await client.from("products").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(rowToProduct);
    },
    async upsertProduct(product) {
      const { data, error } = await client
        .from("products")
        .upsert(productToInsert(product), { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return rowToProduct(data);
    },
    async deleteProduct(id) {
      const { error } = await client.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    async replaceCatalog(products) {
      const rows = products.map(productToInsert);
      const { data, error } = await client.from("products").upsert(rows, { onConflict: "id" }).select();
      if (error) throw error;
      const desiredIds = new Set(products.map((product) => product.id));
      const { data: existing, error: listError } = await client.from("products").select("id");
      if (listError) throw listError;
      const staleIds = (existing ?? []).map((row) => row.id).filter((id) => !desiredIds.has(id));
      if (staleIds.length) {
        const { error: deleteError } = await client.from("products").delete().in("id", staleIds);
        if (deleteError) throw deleteError;
      }
      return (data ?? []).map(rowToProduct);
    },

    async listCustomers() {
      const { data, error } = await client.from("profiles").select("*").eq("role", "customer");
      if (error) throw error;
      return (data ?? []).map(rowToCustomer);
    },
    async upsertCustomer(customer) {
      const { data, error } = await client
        .from("profiles")
        .update({ name: customer.name, phone: customer.phone ?? null })
        .eq("id", customer.id)
        .select()
        .single();
      if (error) throw error;
      return rowToCustomer(data);
    },

    async listOrders() {
      const { data, error } = await client.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToOrder);
    },
    async createOrder(order) {
      const { data, error } = await client.from("orders").insert(orderToInsert(order)).select().single();
      if (error) throw error;
      return rowToOrder(data);
    },
    async updateOrderStatus(id, status) {
      const { data, error } = await client.from("orders").update({ status }).eq("id", id).select().maybeSingle();
      if (error) throw error;
      return data ? rowToOrder(data) : null;
    },
    async reassignOrdersCustomer(fromCustomerId, toCustomerId) {
      const { data, error } = await client
        .from("orders")
        .update({ customer_id: toCustomerId })
        .eq("customer_id", fromCustomerId)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async loadCart(ownerId) {
      // Requiere una identidad Supabase real (auth.uid()); sin Auth
      // conectado todavía, el store nunca pasa ownerId — queda listo para
      // cuando exista sesión Supabase (real o anónima).
      if (!ownerId) return [];
      const { data, error } = await client.from("carts").select("lines").eq("owner_id", ownerId).maybeSingle();
      if (error) throw error;
      return (data?.lines as CartLine[] | undefined) ?? [];
    },
    async saveCart(cart, ownerId) {
      if (!ownerId) return;
      const { error } = await client
        .from("carts")
        .upsert({ owner_id: ownerId, lines: cart }, { onConflict: "owner_id" });
      if (error) throw error;
    },

    async listAuditLog(limit = 200) {
      const { data, error } = await client
        .from("audit_log")
        .select("*")
        .order("at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(rowToAudit);
    },
    async appendAuditEntry(entry) {
      const { error } = await client.from("audit_log").insert({
        id: entry.id,
        at: entry.at,
        admin_id: entry.adminId,
        admin_email: entry.adminEmail,
        action: entry.action,
        detail: entry.detail,
      });
      if (error) throw error;
    },
  };
}
