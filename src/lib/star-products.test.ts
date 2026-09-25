import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { selectStarProducts } from "./star-products";

function product(id: string, category: string, price: number | null, overrides: Partial<Product> = {}): Product {
  return {
    id,
    slug: `producto-${id}`,
    code: id,
    name: `Producto ${id}`,
    price,
    rawPrice: String(price),
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

const preferred = [
  { id: "p1", image: "/custom/p1.webp" },
  { id: "p2", image: "/custom/p2.webp" },
  { id: "p3", image: "/custom/p3.webp" },
];
const catalog = [
  product("p1", "Amoladoras", 50000),
  product("p2", "Taladros", 60000),
  product("p3", "Jardín", 70000),
  product("a1", "Soldadura", 45000),
  product("a2", "Soldadura", 46000, { featured: true }),
  product("b1", "Construcción", 80000),
  product("c1", "Otros", 90000),
  product("c2", "Otros", 91000),
  product("d1", "Riego", 55000),
];
const ids = (list: { product: Product }[]) => list.map((item) => item.product.id);
const select = (products: Product[], options = {}) => selectStarProducts(products, { preferred, ...options });

describe("selectStarProducts", () => {
  it("prioriza los elegidos válidos, en orden y con su foto propia", () => {
    const picks = select(catalog);
    expect(ids(picks).slice(0, 3)).toEqual(["p1", "p2", "p3"]);
    expect(picks.slice(0, 3).map((item) => item.image)).toEqual(preferred.map((item) => item.image));
    expect(picks).toHaveLength(4);
  });

  it("completa hasta 4 cuando los elegidos están inactivos y usa la foto del producto", () => {
    const inactive = catalog.map((p) => (["p1", "p2", "p3"].includes(p.id) ? { ...p, active: false } : p));
    const picks = select(inactive);
    expect(picks).toHaveLength(4);
    for (const item of picks) expect(item.image).toBe(item.product.image);
    expect(new Set(picks.map((item) => item.product.category)).size).toBe(4);
  });

  it("los extremos del rango valen y lo de afuera queda excluido", () => {
    const items = [
      product("lo", "A", 39999),
      product("min", "B", 40000),
      product("max", "C", 100000),
      product("hi", "D", 100001),
      product("sin-precio", "E", null),
    ];
    expect(ids(select(items)).sort()).toEqual(["max", "min"]);
  });

  it("descarta sin foto, agotados e inactivos", () => {
    const items = [
      product("ok", "A", 50000),
      product("sin-foto", "B", 50000, { image: null }),
      product("agotado", "C", 50000, { stock: 0 }),
      product("inactivo", "D", 50000, { active: false }),
    ];
    expect(ids(select(items))).toEqual(["ok"]);
  });

  it("prefiere categorías distintas y dentro de una, el destacado", () => {
    const picks = select(catalog.filter((p) => !p.id.startsWith("p")));
    expect(new Set(picks.map((item) => item.product.category)).size).toBe(4);
    expect(ids(picks)).toContain("a2");
    expect(ids(picks)).not.toContain("a1");
  });

  it("repite categoría solo si faltan", () => {
    const items = [product("x1", "A", 50000), product("x2", "A", 51000), product("y1", "B", 52000)];
    expect(select(items).map((item) => item.product.category).sort()).toEqual(["A", "A", "B"]);
  });

  it("es estable entre llamadas y no depende del orden del catálogo", () => {
    expect(ids(select(catalog))).toEqual(ids(select(catalog)));
    expect(ids(select([...catalog].reverse()))).toEqual(ids(select(catalog)));
  });

  it("si se desactiva un elegido, otro lo reemplaza y los demás se quedan", () => {
    const before = select(catalog);
    const gone = before[1].product.id;
    const after = select(catalog.map((p) => (p.id === gone ? { ...p, active: false } : p)));
    expect(after).toHaveLength(4);
    expect(ids(after)).not.toContain(gone);
    expect(ids(after).filter((id) => ids(before).includes(id)).sort()).toEqual(
      ids(before).filter((id) => id !== gone).sort(),
    );
  });

  it("con menos de 4 candidatos devuelve los que hay", () => {
    expect(select(catalog.slice(0, 2))).toHaveLength(2);
    expect(select([])).toEqual([]);
  });
});
