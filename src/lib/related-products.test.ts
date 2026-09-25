import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { selectRelatedProducts } from "./related-products";

function product(id: string, category: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    slug: `producto-${id}`,
    code: id,
    name: `Producto ${id}`,
    price: 100,
    rawPrice: "100",
    category,
    brand: "Energy",
    image: `/products/${id}.webp`,
    images: [],
    stock: 3,
    lowStockThreshold: 1,
    active: true,
    featured: false,
    description: null,
    variants: [],
    source: "test",
    sourceRow: 1,
    incomplete: [],
    ...overrides,
  };
}

const CATEGORIES = ["Amoladoras", "Taladros", "Jardín", "Soldadura", "Otros", "Construcción"];
const catalog = CATEGORIES.flatMap((category, c) =>
  Array.from({ length: 6 }, (_, i) => product(`${c}${i}`, category)),
);

describe("selectRelatedProducts", () => {
  it("excluye el producto actual, no repite y trae hasta 10", () => {
    const current = catalog[0];
    const picks = selectRelatedProducts(catalog, current);
    expect(picks).toHaveLength(10);
    expect(picks.map((p) => p.id)).not.toContain(current.id);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
  });

  it("reparte por categoría: máximo dos de cada una y todas representadas", () => {
    const picks = selectRelatedProducts(catalog, catalog[7]);
    const perCategory = new Map<string, number>();
    for (const p of picks) perCategory.set(p.category, (perCategory.get(p.category) ?? 0) + 1);
    expect(Math.max(...perCategory.values())).toBeLessThanOrEqual(2);
    expect(perCategory.size).toBe(CATEGORIES.length);
  });

  it("es determinista para el mismo id y cambia con otro id", () => {
    const a = selectRelatedProducts(catalog, catalog[3]).map((p) => p.id);
    expect(selectRelatedProducts([...catalog].reverse(), catalog[3]).map((p) => p.id)).toEqual(a);
    expect(selectRelatedProducts(catalog, catalog[20]).map((p) => p.id)).not.toEqual(a);
  });

  it("prefiere destacados y luego más stock dentro de cada categoría", () => {
    const items = [
      product("a", "Jardín", { stock: 50 }),
      product("b", "Jardín", { featured: true, stock: 1 }),
      product("c", "Jardín", { stock: 9 }),
      product("x", "Otros"),
    ];
    const ids = selectRelatedProducts(items, items[3]).map((p) => p.id);
    expect(ids).toEqual(["b", "a"]);
  });

  it("descarta sin foto, inactivos, sin precio y agotados; con catálogo chico devuelve lo que hay", () => {
    const items = [
      product("cur", "Otros"),
      product("ok", "Jardín"),
      product("sin-foto", "Jardín", { image: null }),
      product("inactivo", "Soldadura", { active: false }),
      product("sin-precio", "Soldadura", { price: null }),
      product("agotado", "Taladros", { stock: 0 }),
    ];
    expect(selectRelatedProducts(items, items[0]).map((p) => p.id)).toEqual(["ok"]);
    expect(selectRelatedProducts([items[0]], items[0])).toEqual([]);
  });
});
