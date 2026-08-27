import type { Customer, Order, Product, Session } from "@/lib/types";

export interface AuthAdapter {
  signInCustomer(email: string, password: string): Promise<Session>;
  signUpCustomer(name: string, email: string, password: string, emailRedirectTo?: string): Promise<Session>;
  signInAdmin(email: string, password: string): Promise<Session>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  resendCustomerConfirmation(email: string, emailRedirectTo: string): Promise<void>;
  updateCustomerPassword(password: string): Promise<void>;
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
