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

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
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
  lines: CartLine[];
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
};
