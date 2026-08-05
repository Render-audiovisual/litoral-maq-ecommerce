import productsSeed from "@/data/products.json";
import type { Order, Product } from "@/lib/types";
import type { ImageStorageAdapter, PaymentAdapter, SheetSyncAdapter, ShippingAdapter } from "./adapters";

const wait = (duration = 350) => new Promise((resolve) => setTimeout(resolve, duration));

// El AuthAdapter (local y Supabase) vive en `services/auth/` — ver
// `services/auth/index.ts` (`getAuthAdapter()`). Este archivo conserva solo
// los mocks que no tienen todavía un adaptador real (pago, envío, imágenes,
// sincronización de catálogo).

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
