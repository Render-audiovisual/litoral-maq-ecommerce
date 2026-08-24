import { describe, expect, it } from "vitest";
import type { Product } from "./types";
import {
  availabilityLabel,
  canAddProductToCart,
  getProductAvailability,
} from "./product-availability";

const product = (stock: number, incomplete: string[] = []): Product => ({
  id: "1", slug: "producto-1", code: "1", name: "Producto", price: 100,
  rawPrice: "$ 100", category: "Otros", brand: "Marca", image: null,
  images: [], stock, lowStockThreshold: 5, active: true, featured: false,
  description: null, variants: [], source: "google-sheet", sourceRow: 2,
  incomplete,
});

describe("disponibilidad comercial", () => {
  it("no publica como real un stock todavía no verificado", () => {
    const item = product(42, ["stock"]);
    expect(getProductAvailability(item)).toBe("unknown");
    expect(availabilityLabel(item)).toBe("Consultar disponibilidad");
    expect(canAddProductToCart(item)).toBe(true);
  });

  it("distingue stock confirmado disponible y agotado", () => {
    expect(getProductAvailability(product(3))).toBe("available");
    expect(getProductAvailability(product(0))).toBe("out-of-stock");
    expect(canAddProductToCart(product(0))).toBe(false);
  });
});
