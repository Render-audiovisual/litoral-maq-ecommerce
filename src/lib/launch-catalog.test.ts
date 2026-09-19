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
  it("mantiene activos y presentes en Sheet todos los productos elegidos para el carrusel de inicio", () => {
    const seed = productsSeed as Product[];
    const promoIds = ["3757", "3348", "3353", "3378", "3687", "3650", "3732"];
    const promos = promoIds.map((id) => seed.find((item) => item.id === id));
    expect(promos.every(Boolean)).toBe(true);
    expect(promos.every((item) => item?.active && !item.incomplete.includes("sheet-absent"))).toBe(true);
  });

  it("mantiene cuatro productos estrella activos con imagen y ficha verificadas", () => {
    const seed = productsSeed as Product[];
    const starIds = ["3381", "3506", "3499", "3542"];
    const stars = starIds.map((id) => seed.find((item) => item.id === id));
    expect(stars.every(Boolean)).toBe(true);
    expect(stars.every((item) => item?.active && item.image && item.description)).toBe(true);
    expect(stars.every((item) => item?.price && item.price < 100_000)).toBe(true);
    expect(new Set(stars.map((item) => item?.category)).size).toBe(4);
  });

  it("deja sin ficha los productos cuya imagen no pudo verificarse contra el catálogo del fabricante", () => {
    const seed = productsSeed as Product[];
    const item = seed.find((product) => product.id === "3379");
    expect(item).toMatchObject({ active: false, image: null, description: null });
  });

  it("repone la ficha de 3657 con la del catálogo oficial de GBS, que sí coincide con el modelo del Sheet", () => {
    const seed = productsSeed as Product[];
    const item = seed.find((product) => product.id === "3657");
    expect(item?.name).toContain("AG115/1/220");
    expect(item?.description).toContain("AG115/1/220");
    expect(item?.image).toBe("/products/catalog/3657-ag115-1-220.webp");
    expect(item?.active).toBe(false);
  });

  it("carga la ficha de 3622 (llave de impacto NEO) desde el catálogo oficial de GBS", () => {
    const seed = productsSeed as Product[];
    const item = seed.find((product) => product.id === "3622");
    expect(item?.name).toContain("LI121600/20K18");
    expect(item?.description).toContain("1600N/m");
    expect(item?.image).toBe("/products/catalog/3622-li121600-20k18.webp");
    expect(item?.images).toContain("/products/catalog/3622-li121600-20k18-ficha.webp");
    expect(item?.active).toBe(false);
  });

  it("publica únicamente fichas activas con imagen y descripción verificadas", () => {
    const seed = productsSeed as Product[];
    const selected = getLaunchProducts(seed);
    const expectedPublished = seed.filter(
      (item) => item.active && Boolean(item.image) && Boolean(item.description),
    );
    expect(selected).toHaveLength(expectedPublished.length);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((item) => item.active && item.image && item.description)).toBe(true);
    expect(selected.some((item) => item.id === "3336")).toBe(false);
  });

  it("separa la selección en 10 más vendidos y 10 destacados sin repetir productos", () => {
    const products = productsSeed as Product[];
    const bestSellers = getLaunchBestSellers(products);
    const featured = getLaunchFeaturedProducts(products);
    expect(bestSellers).toHaveLength(10);
    expect(featured).toHaveLength(10);
    expect(new Set([...bestSellers, ...featured].map((item) => item.id)).size).toBe(20);
    expect(bestSellers.every((item) => item.active && item.image && item.description)).toBe(true);
  });

  it("reconoce los modelos confirmados aunque el nombre comercial sea más largo", () => {
    expect(isLaunchProduct(product("ESCALERA MULTIFUNCION 4 X 4 OBRA - EMA804"))).toBe(true);
    expect(isLaunchProduct(product("PRODUCTO FUERA DE LA SELECCIÓN"))).toBe(false);
    expect(isLaunchProduct(product("KIT TALADRO Y AMOLADORA ENERGY 20V PA20C1"))).toBe(false);
  });

  it("excluye productos ocultos del catálogo público", () => {
    const products = [
      product("MOTOSIERRA 58 CC ENERGY - CS58", { image: "/motosierra.webp", description: "Ficha verificada" }),
      product("AMOLADORA 20V 115MM ENERGY A20C1", { active: false, image: "/amoladora.webp", description: "Ficha verificada" }),
    ];
    expect(getLaunchProducts(products)).toHaveLength(1);
  });

  it("filtra por familia y calcula el menor precio de cada acceso", () => {
    const products = [
      product("TALADRO 650W - TP413/7/220K", { price: 75_000 }),
      product("TALADRO PERCUTOR 20V ENERGY P20C1", { price: 90_000 }),
    ];
    expect(matchesLaunchFamily(products[0], "taladros")).toBe(true);
    expect(matchesLaunchFamily(products[0], "soldadoras")).toBe(false);
    expect(getLaunchFamilyCards(products).find((item) => item.slug === "taladros")?.priceFrom).toBe(75_000);
  });

  it("mantiene las ocho categorías de la home conectadas a productos publicados", () => {
    const cards = getLaunchFamilyCards(getLaunchProducts(productsSeed as Product[]));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(8);
    expect(cards.every((card) => card.productCount > 0 && card.priceFrom !== null)).toBe(true);
  });
});
