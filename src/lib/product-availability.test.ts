import { describe, expect, it } from "vitest";
import type { Product } from "./types";
import {
  availabilityLabel,
  canAddProductToCart,
  getProductAvailability,
} from "./product-availability";

const product = (stock: number, incomplete: string[] = [], active = true): Product => ({
  id: "1", slug: "producto-1", code: "1", name: "Producto", price: 100,
  rawPrice: "$ 100", category: "Otros", brand: "Marca", image: null,
  images: [], stock, lowStockThreshold: 5, active, featured: false,
  description: null, variants: [], source: "google-sheet", sourceRow: 2,
  incomplete,
});

describe("disponibilidad comercial", () => {
  it("un producto publicado (presente en el Sheet, imagen y descripción verificadas) sin cantidad real es disponibilidad gestionada por Sheet, no 'a confirmar'", () => {
    const item = product(0, ["stock"], true);
    expect(getProductAvailability(item)).toBe("sheet-managed");
    expect(availabilityLabel(item)).toBe("Disponible");
    expect(canAddProductToCart(item)).toBe(true);
  });

  it("un producto oculto pero presente en el Sheet conserva disponibilidad gestionada", () => {
    const item = product(0, ["stock"], false);
    expect(getProductAvailability(item)).toBe("sheet-managed");
    expect(availabilityLabel(item)).toBe("Disponible");
    expect(canAddProductToCart(item)).toBe(false);
  });

  it("un producto ausente del Sheet sigue siendo desconocido y no puede agregarse", () => {
    const item = product(0, ["stock", "sheet-absent"], false);
    expect(getProductAvailability(item)).toBe("unknown");
    expect(availabilityLabel(item)).toBe("Consultar disponibilidad");
    expect(canAddProductToCart(item)).toBe(false);
  });

  it("un producto manual activo sin stock confirmado no se confunde con disponibilidad del Sheet", () => {
    const item = { ...product(0, ["stock"], true), source: "admin" };
    expect(getProductAvailability(item)).toBe("unknown");
    expect(canAddProductToCart(item)).toBe(true);
  });

  it("distingue stock confirmado disponible y agotado cuando existe una cantidad real cargada", () => {
    expect(getProductAvailability(product(3))).toBe("available");
    expect(getProductAvailability(product(0))).toBe("out-of-stock");
    expect(canAddProductToCart(product(0))).toBe(false);
  });
});
