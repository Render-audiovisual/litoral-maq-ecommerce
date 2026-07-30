import type { Customer, Order, Product, Session } from "@/lib/types";

export interface AuthAdapter {
  signIn(email: string, password: string): Promise<Session>;
  signUp(name: string, email: string, password: string): Promise<Session>;
  signInWithGoogle(): Promise<Session>;
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
  preview(): Promise<{ products: Product[]; source: string }>;
  sync(): Promise<{ created: number; updated: number; warnings: string[] }>;
}
