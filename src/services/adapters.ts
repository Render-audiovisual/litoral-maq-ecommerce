import type { Customer, Order, Product, Session } from "@/lib/types";

export interface AuthAdapter {
  signInCustomer(email: string, password: string): Promise<Session>;
  signUpCustomer(name: string, email: string, password: string): Promise<Session>;
  signInCustomerWithGoogle(): Promise<Session>;
  signInAdmin(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
}

export interface DatabaseAdapter {
  listProducts(): Promise<Product[]>;
  saveProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  listOrders(): Promise<Order[]>;
  saveOrder(order: Order): Promise<Order>;
  listCustomers(): Promise<Customer[]>;
}

export interface PaymentAdapter {
  createPreference(order: Order): Promise<{
    id: string;
    checkoutUrl: string;
    simulated: boolean;
  }>;
}

export interface ShippingAdapter {
  quote(input: {
    postalCode: string;
    subtotal: number;
    method: "envio" | "retiro";
  }): Promise<{ amount: number; eta: string; simulated: boolean }>;
}

export interface ImageStorageAdapter {
  upload(file: File): Promise<{ url: string; simulated: boolean }>;
}

export interface SheetSyncAdapter {
  sync(currentProducts: Product[]): Promise<{
    products: Product[];
    source: string;
    created: number;
    updated: number;
    removed: number;
    warnings: string[];
  }>;
}
