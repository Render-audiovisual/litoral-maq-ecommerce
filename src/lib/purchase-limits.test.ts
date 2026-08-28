import { describe, expect, it } from "vitest";
import {
  clampPurchaseQuantity,
  DEFAULT_PURCHASE_LIMIT,
  getPurchaseLimit,
  validateCartPurchaseLimits,
} from "./purchase-limits";
import type { Product } from "./types";

const product = {
  id: "p1",
  name: "Taladro",
  purchaseLimit: 3,
} as Product;

describe("límites de compra", () => {
  it("usa un límite conservador cuando el catálogo anterior no trae el campo", () => {
    expect(getPurchaseLimit({})).toBe(DEFAULT_PURCHASE_LIMIT);
  });

  it("recorta cantidades manipuladas al límite comercial", () => {
    expect(clampPurchaseQuantity(product, 12)).toBe(3);
    expect(clampPurchaseQuantity(product, -1)).toBe(0);
  });

  it("rechaza el checkout si una línea supera el límite", () => {
    expect(
      validateCartPurchaseLimits([{ productId: "p1", quantity: 4 }], [product]),
    ).toMatch(/hasta 3 unidades/i);
    expect(
      validateCartPurchaseLimits([{ productId: "p1", quantity: 3 }], [product]),
    ).toBe("");
  });
});
