import type { AuditEntry, CartLine, Customer, Order, OrderStatus, PaymentStatus, Product } from "@/lib/types";
import type { SystemStatus } from "@/lib/system-status";

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
  /** Guardado parcial con control de versión: `null` si la fila ya no está en
   * `expectedUpdatedAt` (otra persona la cambió o la borró). */
  updateProduct(
    id: string,
    changes: Partial<Product>,
    expectedUpdatedAt: string | undefined,
  ): Promise<Product | null>;
  deleteProduct(id: string): Promise<void>;
  replaceCatalog(products: Product[]): Promise<Product[]>;

  // Clientes (perfil visible en el panel admin)
  listCustomers(): Promise<Customer[]>;
  upsertCustomer(customer: Customer): Promise<Customer>;

  // Pedidos
  listOrders(): Promise<Order[]>;
  createOrder(order: Order): Promise<Order>;
  // `expected*` es lo que veía la persona: si la base ya tiene otro valor,
  // no se escribe y devuelven `null`.
  updateOrderStatus(id: string, status: OrderStatus, expectedStatus: OrderStatus): Promise<Order | null>;
  updateOrderPaymentStatus(
    id: string,
    status: PaymentStatus,
    expectedStatus: PaymentStatus,
  ): Promise<Order | null>;
  reassignOrdersCustomer(fromCustomerId: string, toCustomerId: string): Promise<number>;

  // Carrito — un único blob por dueño (hoy sin dueño real: un carrito global por navegador)
  loadCart(ownerId?: string): Promise<CartLine[]>;
  saveCart(cart: CartLine[], ownerId?: string): Promise<void>;

  // Auditoría — append-only por diseño, nunca se sobrescribe en bloque
  listAuditLog(limit?: number): Promise<AuditEntry[]>;
  appendAuditEntry(entry: AuditEntry): Promise<void>;

  // Estado del sistema (tarjeta de Configuración). `null` = no disponible
  // en este proveedor (modo local).
  getSystemStatus(): Promise<SystemStatus | null>;
}
