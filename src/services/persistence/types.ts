import type { AuditEntry, CartLine, Customer, Order, OrderStatus, PaymentStatus, Product } from "@/lib/types";

/**
 * Contrato único de persistencia de datos de catálogo/clientes/pedidos (no
 * de sesiones ni de credenciales demo — ver `local-accounts-store.ts` sobre
 * por qué las cuentas quedan aparte). Implementado hoy por
 * `local-adapter.ts` (localStorage, activo por defecto) y
 * `supabase-adapter.ts` (Postgres vía Supabase, listo para activarse cuando
 * exista el proyecto real). La UI y el store solo conocen esta interfaz,
 * nunca el proveedor concreto.
 */
export interface PersistenceAdapter {
  // Productos
  listProducts(): Promise<Product[]>;
  upsertProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  replaceCatalog(products: Product[]): Promise<Product[]>;

  // Clientes (perfil visible en el panel admin)
  listCustomers(): Promise<Customer[]>;
  upsertCustomer(customer: Customer): Promise<Customer>;

  // Pedidos
  listOrders(): Promise<Order[]>;
  createOrder(order: Order): Promise<Order>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null>;
  updateOrderPaymentStatus(id: string, status: PaymentStatus): Promise<Order | null>;
  reassignOrdersCustomer(fromCustomerId: string, toCustomerId: string): Promise<number>;

  // Carrito — un único blob por dueño (hoy sin dueño real: un carrito global por navegador)
  loadCart(ownerId?: string): Promise<CartLine[]>;
  saveCart(cart: CartLine[], ownerId?: string): Promise<void>;

  // Auditoría — append-only por diseño, nunca se sobrescribe en bloque
  listAuditLog(limit?: number): Promise<AuditEntry[]>;
  appendAuditEntry(entry: AuditEntry): Promise<void>;
}
