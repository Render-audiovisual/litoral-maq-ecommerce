import type { ImageStorageAdapter } from "./adapters";

const wait = (duration = 350) => new Promise((resolve) => setTimeout(resolve, duration));

// Auth, catálogo, pedidos y carrito ya usan adaptadores reales. Hasta que
// exista Storage, este archivo conserva únicamente la previsualización local
// de imágenes del panel; pago y envío no tienen mocks para evitar que una
// simulación vuelva a presentarse como una operación comercial válida.

export const mockImageStorageAdapter: ImageStorageAdapter = {
  async upload(file) {
    await wait();
    return { url: URL.createObjectURL(file), simulated: true };
  },
};
