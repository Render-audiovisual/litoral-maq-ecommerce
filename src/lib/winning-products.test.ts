import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { getWinningProducts, HERO_PRODUCT_CODE } from "./winning-products";

function product(overrides: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    id: overrides.id,
    slug: overrides.id,
    code: overrides.code ?? overrides.id,
    name: overrides.name,
    price: Object.prototype.hasOwnProperty.call(overrides, "price") ? (overrides.price ?? null) : 100,
    rawPrice: "100",
    category: overrides.category ?? "Otros",
    brand: "Energy",
    image: overrides.image ?? "/product.png",
    images: [],
    stock: overrides.stock ?? 1,
    lowStockThreshold: 1,
    active: overrides.active ?? true,
    featured: false,
    description: null,
    variants: [],
    source: "test",
    sourceRow: 1,
    incomplete: [],
  };
}

describe("productos ganadores provisorios", () => {
  it("fija el taladro principal en el primer puesto aunque tenga menos stock", () => {
    const products = [
      product({ id: "a", name: "Amoladora", stock: 90 }),
      product({ id: "taladro", code: HERO_PRODUCT_CODE, name: "Taladro 550W", stock: 20 }),
      product({ id: "s", name: "Soldadora", stock: 80 }),
    ];
    expect(getWinningProducts(products, 3).map((item) => item.id)).toEqual(["taladro", "a", "s"]);
  });

  it("excluye productos ocultos, sin stock o sin precio", () => {
    const products = [
      product({ id: "taladro", code: HERO_PRODUCT_CODE, name: "Taladro", stock: 10 }),
      product({ id: "oculto", name: "Oculto", stock: 99, active: false }),
      product({ id: "agotado", name: "Agotado", stock: 0 }),
      product({ id: "sin-precio", name: "Sin precio", stock: 80, price: null }),
    ];
    expect(getWinningProducts(products).map((item) => item.id)).toEqual(["taladro"]);
  });

  it("prioriza variedad visual en los seis lugares de la Home", () => {
    const products = [
      product({ id: "taladro", code: HERO_PRODUCT_CODE, name: "Taladro", category: "Taladros", stock: 40 }),
      product({ id: "a1", name: "Amoladora 1", category: "Amoladoras", stock: 90 }),
      product({ id: "a2", name: "Amoladora 2", category: "Amoladoras", stock: 89 }),
      product({ id: "s1", name: "Soldadora", category: "Soldadura", stock: 70 }),
      product({ id: "m1", name: "Motosierra", category: "Jardín", stock: 60 }),
    ];
    expect(getWinningProducts(products, 4).map((item) => item.id)).toEqual(["taladro", "a1", "s1", "m1"]);
  });
});
