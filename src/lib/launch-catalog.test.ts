import { describe, expect, it } from "vitest";
import productsSeed from "@/data/products.json";
import type { Product } from "./types";
import {
  getLaunchFamilyCards,
  getLaunchBestSellers,
  getLaunchFeaturedProducts,
  getLaunchProducts,
  isLaunchProduct,
  matchesLaunchFamily,
} from "./launch-catalog";

function product(name: string, overrides: Partial<Product> = {}): Product {
  return {
    id: name,
    slug: name,
    code: name,
    name,
    price: 100,
    rawPrice: "$ 100",
    category: "Otros",
    brand: "Energy",
    image: null,
    images: [],
    stock: 1,
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

describe("catálogo inicial", () => {
  it("encuentra una única ficha para cada uno de los 20 modelos iniciales", () => {
    const selected = getLaunchProducts(productsSeed as Product[]);
    expect(selected).toHaveLength(20);
    expect(selected.some((item) => item.name.includes("ID13/2/220"))).toBe(true);
  });

  it("separa la selección en 10 más vendidos y 10 destacados sin repetir productos", () => {
    const products = productsSeed as Product[];
    const bestSellers = getLaunchBestSellers(products);
    const featured = getLaunchFeaturedProducts(products);
    expect(bestSellers).toHaveLength(10);
    expect(featured).toHaveLength(10);
    expect(new Set([...bestSellers, ...featured].map((item) => item.id)).size).toBe(20);
    expect(bestSellers.slice(0, 5).every((item) => item.name.includes("TALADRO"))).toBe(true);
  });

  it("reconoce los modelos confirmados aunque el nombre comercial sea más largo", () => {
    expect(isLaunchProduct(product("ESCALERA MULTIFUNCION 4 X 4 OBRA - EMA804"))).toBe(true);
    expect(isLaunchProduct(product("PRODUCTO FUERA DE LA SELECCIÓN"))).toBe(false);
    expect(isLaunchProduct(product("KIT TALADRO Y AMOLADORA ENERGY 20V PA20C1"))).toBe(false);
  });

  it("excluye productos ocultos del catálogo público", () => {
    const products = [
      product("MOTOSIERRA 58 CC ENERGY - CS58"),
      product("AMOLADORA 20V 115MM ENERGY A20C1", { active: false }),
    ];
    expect(getLaunchProducts(products)).toHaveLength(1);
  });

  it("filtra por familia y calcula el menor precio de cada acceso", () => {
    const products = [
      product("TALADRO 650W - TP413/7/220K", { price: 75_000 }),
      product("TALADRO PERCUTOR 20V ENERGY P20C1", { price: 90_000 }),
    ];
    expect(matchesLaunchFamily(products[0], "taladros")).toBe(true);
    expect(matchesLaunchFamily(products[0], "hidrolavadoras")).toBe(false);
    expect(getLaunchFamilyCards(products).find((item) => item.slug === "taladros")?.priceFrom).toBe(75_000);
  });
});
