import type { CartLine, Order, OrderLine, Product } from "@/lib/types";
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

function productToInsert(
  product: Product,
): Database["public"]["Tables"]["products"]["Insert"] {
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
    purchase_limit: product.purchaseLimit ?? 3,
    active: product.active,
    featured: product.featured,
    description: product.description,
    variants: product.variants,
    source: product.source,
    source_row: product.sourceRow,
    incomplete: product.incomplete,
    shipping_weight_kg: product.shippingWeightKg ?? null,
    shipping_height_cm: product.shippingHeightCm ?? null,
    shipping_width_cm: product.shippingWidthCm ?? null,
    shipping_length_cm: product.shippingLengthCm ?? null,
    shipping_enabled: product.shippingEnabled ?? false,
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
    purchaseLimit: row.purchase_limit,
    active: row.active,
    featured: row.featured,
    description: row.description,
    variants: row.variants ?? [],
    source: row.source,
    sourceRow: row.source_row ?? 0,
    incomplete: row.incomplete ?? [],
    shippingWeightKg: row.shipping_weight_kg,
    shippingHeightCm: row.shipping_height_cm,
    shippingWidthCm: row.shipping_width_cm,
    shippingLengthCm: row.shipping_length_cm,
    shippingEnabled: row.shipping_enabled,
  };
}

function orderToInsert(
  order: Order,
): Database["public"]["Tables"]["orders"]["Insert"] {
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
    payment_status: order.paymentStatus ?? "pending",
    phone: order.phone ?? null,
    postal_code: order.postalCode ?? null,
    province: order.province ?? null,
    locality: order.locality ?? null,
    street: order.street ?? null,
    street_number: order.streetNumber ?? null,
    floor: order.floor ?? null,
    apartment: order.apartment ?? null,
    address_reference: order.addressReference ?? null,
    shipping_quote_id: order.shippingQuoteId ?? null,
    shipping_provider: order.shippingProvider ?? null,
    shipping_carrier: order.shippingCarrier ?? null,
    shipping_service: order.shippingService ?? null,
    shipping_delivery_type: order.shippingDeliveryType ?? null,
    shipping_branch_id: order.shippingBranchId ?? null,
    shipping_branch_name: order.shippingBranchName ?? null,
    shipping_branch_address: order.shippingBranchAddress ?? null,
    shipping_status: order.shippingStatus ?? null,
    shipping_tracking_number: order.shippingTrackingNumber ?? null,
    shipping_label_ready: order.shippingLabelReady ?? false,
  };
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    email: row.email,
    lines: row.lines as OrderLine[],
    total: row.total,
    shipping: row.shipping,
    deliveryMethod: row.delivery_method,
    address: row.address ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    paymentReference: row.payment_reference ?? "",
    paymentStatus: row.payment_status ?? "pending",
    phone: row.phone ?? undefined,
    postalCode: row.postal_code ?? undefined,
    province: row.province ?? undefined,
    locality: row.locality ?? undefined,
    street: row.street ?? undefined,
    streetNumber: row.street_number ?? undefined,
    floor: row.floor ?? undefined,
    apartment: row.apartment ?? undefined,
    addressReference: row.address_reference ?? undefined,
    shippingQuoteId: row.shipping_quote_id ?? undefined,
    shippingProvider: row.shipping_provider ?? undefined,
    shippingCarrier: row.shipping_carrier ?? undefined,
    shippingService: row.shipping_service ?? undefined,
    shippingDeliveryType: row.shipping_delivery_type ?? undefined,
    shippingBranchId: row.shipping_branch_id ?? undefined,
    shippingBranchName: row.shipping_branch_name ?? undefined,
    shippingBranchAddress: row.shipping_branch_address ?? undefined,
    shippingStatus: row.shipping_status ?? undefined,
    shippingTrackingNumber: row.shipping_tracking_number ?? undefined,
    shippingLabelReady: row.shipping_label_ready ?? false,
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

export function createSupabasePersistenceAdapter(
  client: TypedSupabaseClient,
): PersistenceAdapter {
  return {
    async listProducts() {
      const { data, error } = await client
        .from("products")
        .select("*")
        .order("name");
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
      const { data, error } = await client
        .from("products")
        .upsert(rows, { onConflict: "id" })
        .select();
      if (error) throw error;
      const desiredIds = new Set(products.map((product) => product.id));
      const { data: existing, error: listError } = await client
        .from("products")
        .select("id");
      if (listError) throw listError;
      const staleIds = (existing ?? [])
        .map((row) => row.id)
        .filter((id) => !desiredIds.has(id));
      if (staleIds.length) {
        const { error: deleteError } = await client
          .from("products")
          .delete()
          .in("id", staleIds);
        if (deleteError) throw deleteError;
      }
      return (data ?? []).map(rowToProduct);
    },

    async listCustomers() {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("role", "customer");
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
      const { data, error } = await client
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToOrder);
    },
    async createOrder(order) {
      const { data, error } = await client
        .from("orders")
        .insert(orderToInsert(order))
        .select()
        .single();
      if (error) throw error;
      return rowToOrder(data);
    },
    async updateOrderStatus(id, status) {
      const { data, error } = await client
        .from("orders")
        .update({ status })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data ? rowToOrder(data) : null;
    },
    async updateOrderPaymentStatus(id, paymentStatus) {
      const { data, error } = await client
        .from("orders")
        .update({ payment_status: paymentStatus })
        .eq("id", id)
        .select()
        .maybeSingle();
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
      const { data, error } = await client
        .from("carts")
        .select("lines")
        .eq("owner_id", ownerId)
        .maybeSingle();
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
      // No se manda `id`: el id que genera createAuditEntry() (string
      // "audit-<timestamp>-<random>") es para la key local del adapter
      // local — audit_log.id en Postgres es uuid con gen_random_uuid() por
      // default (ver 0001_schema.sql), y mandar el string causaba
      // "invalid input syntax for type uuid" en cada insert (fire-and-forget,
      // por eso no se notaba en la UI: el log simplemente nunca se grababa).
      const { error } = await client.from("audit_log").insert({
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
