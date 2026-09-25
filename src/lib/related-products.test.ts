import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { RELATED_ROTATION_MS, selectRelatedProducts } from "./related-products";

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
  it("excluye el producto actual, no repite y trae hasta 12", () => {
    const current = catalog[0];
    const picks = selectRelatedProducts(catalog, current);
    expect(picks).toHaveLength(12);
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

  describe("renovación y precios", () => {
    const CATS = ["A", "B", "C", "D", "E", "F", "G", "H"];
    // 40 productos en 8 categorías, de $5.000 a $400.000 (cada categoría cubre todo el rango).
    const big = Array.from({ length: 40 }, (_, i) =>
      product(`p${i}`, CATS[i % 8], { price: 5000 + Math.round((i * 395000) / 39) }),
    );
    const now = 100 * RELATED_ROTATION_MS + 12345;
    const ids = (list: Product[]) => list.map((p) => p.id);

    it("trae hasta 12, sin el actual, sin repetir y con máximo dos por categoría", () => {
      const picks = selectRelatedProducts(big, big[0], undefined, now);
      expect(picks).toHaveLength(12);
      expect(ids(picks)).not.toContain("p0");
      expect(new Set(ids(picks)).size).toBe(12);
      const perCategory = new Map<string, number>();
      for (const p of picks) perCategory.set(p.category, (perCategory.get(p.category) ?? 0) + 1);
      expect(Math.max(...perCategory.values())).toBeLessThanOrEqual(2);
    });

    it("incluye productos baratos, medios y caros (tercios del precio)", () => {
      for (const current of [big[0], big[13], big[39]]) {
        const candidates = big.filter((p) => p.id !== current.id).sort((a, b) => a.price! - b.price!);
        const tierOf = (p: Product) => Math.floor((candidates.indexOf(p) * 3) / candidates.length);
        const tiers = new Set(selectRelatedProducts(big, current, 12, now).map((p) => tierOf(big.find((b) => b.id === p.id)!)));
        expect(tiers).toEqual(new Set([0, 1, 2]));
      }
    });

    it("es el mismo dentro de la ventana de 48 h y cambia al cruzarla", () => {
      const a = ids(selectRelatedProducts(big, big[5], 12, now));
      expect(ids(selectRelatedProducts(big, big[5], 12, now + 1000))).toEqual(a);
      expect(ids(selectRelatedProducts(big, big[5], 12, now + RELATED_ROTATION_MS))).not.toEqual(a);
    });

    it("nunca trae inactivos, agotados ni sin foto", () => {
      const bad = [
        product("x-inactivo", "A", { active: false }),
        product("x-agotado", "B", { stock: 0 }),
        product("x-sin-foto", "C", { image: null }),
      ];
      for (const t of [now, now + RELATED_ROTATION_MS, now + 2 * RELATED_ROTATION_MS]) {
        const picks = ids(selectRelatedProducts([...big, ...bad], big[0], 12, t));
        expect(picks.filter((id) => id.startsWith("x-"))).toEqual([]);
      }
    });

    it("catálogos chicos devuelven lo que hay", () => {
      expect(selectRelatedProducts(big.slice(0, 5), big[0], 12, now)).toHaveLength(4);
    });

    it("si se desactiva un producto sugerido, otro lo reemplaza", () => {
      const before = selectRelatedProducts(big, big[0], 12, now);
      const removed = before[4];
      const after = selectRelatedProducts(
        big.map((p) => (p.id === removed.id ? { ...p, active: false } : p)),
        big[0],
        12,
        now,
      );
      expect(after).toHaveLength(12);
      expect(ids(after)).not.toContain(removed.id);
      expect(ids(after).filter((id) => !ids(before).includes(id))).not.toEqual([]);
    });
  });
});
