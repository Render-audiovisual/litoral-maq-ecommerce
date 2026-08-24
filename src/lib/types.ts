export type Role = "admin" | "customer";

export type Product = {
  id: string;
  slug: string;
  code: string | null;
  name: string;
  price: number | null;
  rawPrice: string | null;
  category: string;
  brand: string;
  image: string | null;
  images: string[];
  stock: number;
  lowStockThreshold: number;
  active: boolean;
  featured: boolean;
  description: string | null;
  variants: string[];
  source: string;
  sourceRow: number;
  incomplete: string[];
};

export type CartLine = {
  productId: string;
  quantity: number;
};

/** Foto comercial del artículo al momento de confirmar el pedido. Los
 * campos opcionales mantienen compatibilidad con pedidos anteriores. */
export type OrderLine = CartLine & {
  productName?: string;
  productCode?: string | null;
  unitPrice?: number | null;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  /** Solo relevante con el adaptador Supabase: identidad anónima real
   * (signInAnonymously), no todavía convertida en cuenta permanente. */
  isAnonymous?: boolean;
};

export type OrderStatus =
  | "pendiente"
  | "pago_simulado"
  | "preparando"
  | "enviado"
  | "entregado"
  | "cancelado";

export type Order = {
  id: string;
  customerId: string;
  customerName: string;
  email: string;
  lines: OrderLine[];
  total: number;
  shipping: number;
  deliveryMethod: "envio" | "retiro";
  address?: string;
  status: OrderStatus;
  createdAt: string;
  paymentReference: string;
};

export type Session = {
  user: Customer;
  token: string;
  expiresAt: number;
};

export type AuditEntry = {
  id: string;
  at: string;
  adminId: string;
  adminEmail: string;
  action: string;
  detail: string;
};

/**
 * Registro demo de credenciales de cliente, separado de las sesiones.
 * DEMO ONLY: `providers.password.value` es texto plano manipulable desde el
 * navegador — nunca se traslada a producción. Al conectar Supabase Auth,
 * esta forma deja de existir; el adaptador Supabase no la persiste.
 */
export type Account = {
  id: string;
  name: string;
  email: string;
  role: "customer";
  providers: {
    password?: { value: string };
    google?: { providerId: string };
  };
  createdAt: string;
};
