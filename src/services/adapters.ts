import type { Customer, Order, Product, Session } from "@/lib/types";

/**
 * `captchaToken` es el token de Cloudflare Turnstile. Va en TODOS los
 * métodos que golpean un endpoint de GoTrue protegible: al activar "Enable
 * CAPTCHA protection" en el proyecto, Supabase lo exige en signup, signin,
 * recover, resend y anonymous — no es opcional por método, es por proyecto.
 * Queda `?` porque el modo local y los entornos sin site key configurada no
 * lo usan (ver `components/use-captcha.tsx`).
 */
export interface AuthAdapter {
  signInCustomer(email: string, password: string, captchaToken?: string): Promise<Session>;
  signUpCustomer(
    name: string,
    email: string,
    password: string,
    emailRedirectTo?: string,
    captchaToken?: string,
  ): Promise<Session>;
  signInAdmin(email: string, password: string, captchaToken?: string): Promise<Session>;
  requestPasswordReset(email: string, redirectTo: string, captchaToken?: string): Promise<void>;
  resendCustomerConfirmation(email: string, emailRedirectTo: string, captchaToken?: string): Promise<void>;
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
