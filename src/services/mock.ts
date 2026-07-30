import productsSeed from "@/data/products.json";
import type { Order, Product } from "@/lib/types";
import type {
  AuthAdapter,
  ImageStorageAdapter,
  PaymentAdapter,
  SheetSyncAdapter,
  ShippingAdapter,
} from "./adapters";

const wait = (duration = 350) =>
  new Promise((resolve) => setTimeout(resolve, duration));

export const mockAuthAdapter: AuthAdapter = {
  async signIn(email, password) {
    await wait();
    if (!email.includes("@") || password.length < 4) {
      throw new Error("Revisá el email y la contraseña.");
    }
    const admin = email.toLowerCase() === "admin@litoralmaq.com";
    return {
      user: {
        id: admin ? "admin-1" : `customer-${email}`,
        name: admin ? "Administrador Litoral Maq" : email.split("@")[0],
        email,
        role: admin ? "admin" : "customer",
      },
      token: `demo-${Date.now()}`,
    };
  },
  async signUp(name, email, password) {
    await wait();
    if (name.trim().length < 2 || !email.includes("@") || password.length < 6) {
      throw new Error("Completá nombre, email válido y una clave de 6 caracteres.");
    }
    return {
      user: {
        id: `customer-${Date.now()}`,
        name: name.trim(),
        email,
        role: "customer",
      },
      token: `demo-${Date.now()}`,
    };
  },
  async signInWithGoogle() {
    await wait(500);
    return {
      user: {
        id: "google-demo",
        name: "Cliente Google Demo",
        email: "cliente.demo@gmail.com",
        role: "customer",
      },
      token: `google-demo-${Date.now()}`,
    };
  },
  async signOut() {
    await wait(100);
  },
};

export const mockPaymentAdapter: PaymentAdapter = {
  async createPreference(order: Order) {
    await wait(650);
    return {
      id: `MP-DEMO-${order.id}`,
      checkoutUrl: `/cuenta/pedidos?pedido=${order.id}`,
      simulated: true,
    };
  },
};

export const mockShippingAdapter: ShippingAdapter = {
  async quote({ postalCode, subtotal, method }) {
    await wait();
    if (method === "retiro") {
      return { amount: 0, eta: "Disponible en 24 h", simulated: true };
    }
    if (!/^\d{4}$/.test(postalCode)) {
      throw new Error("Ingresá un código postal argentino de 4 dígitos.");
    }
    return {
      amount: subtotal >= 250000 ? 0 : 12500,
      eta: "3 a 7 días hábiles",
      simulated: true,
    };
  },
};

export const mockImageStorageAdapter: ImageStorageAdapter = {
  async upload(file) {
    await wait();
    return { url: URL.createObjectURL(file), simulated: true };
  },
};

export const mockSheetSyncAdapter: SheetSyncAdapter = {
  async preview() {
    await wait();
    return {
      products: productsSeed as Product[],
      source: "Google Sheet · Lista de precios - LitoralMaq",
    };
  },
  async sync() {
    await wait(700);
    return {
      created: 0,
      updated: (productsSeed as Product[]).length,
      warnings: [
        "El Sheet no informa stock: se conserva el stock del panel.",
        "El Sheet no informa imágenes ni descripciones.",
      ],
    };
  },
};
