import { describe, expect, it } from "vitest";
import type { Product } from "./types";
import { normalize, searchProducts } from "./search";

const product = (
  name: string,
  extra: Partial<Product> = {},
): Product => ({
  id: name, slug: name.toLowerCase().replace(/\s+/g, "-"), code: "1",
  name, price: 100, rawPrice: "$ 100", category: "Otros", brand: "Sin marca informada",
  image: null, images: [], stock: 8, lowStockThreshold: 5, active: true,
  featured: false, description: null, variants: [], source: "google-sheet",
  sourceRow: 2, incomplete: [], ...extra,
});

const catalog = [
  product("TALADRO PERCUTOR 13MM 810W", { brand: "BOSCH" }),
  product("TALADRO ATORNILLADOR INALÁMBRICO 12V", { brand: "DEWALT" }),
  product("AMOLADORA ANGULAR 4.5 PULGADAS", { brand: "BOSCH" }),
  product("KIT ACOPLE RAPIDO P AIRE", { code: "3840" }),
  // Su categoría contiene "Taladros" aunque el producto no sea uno: sirve
  // para comprobar que el nombre pesa más que la categoría.
  product("DESTORNILLADOR PHILLIPS", { category: "Taladros y atornilladores" }),
];

describe("buscador del catálogo", () => {
  it("sugiere con la palabra a medio escribir", () => {
    const names = searchProducts(catalog, "tala").map((item) => item.name);
    expect(names.slice(0, 2).every((name) => name.startsWith("TALADRO"))).toBe(true);
  });

  it("ignora los acentos en los dos sentidos", () => {
    expect(normalize("INALÁMBRICO")).toBe("inalambrico");
    expect(searchProducts(catalog, "inalambrico")).toHaveLength(1);
    expect(searchProducts(catalog, "INALÁMBRICO")).toHaveLength(1);
  });

  it("exige todas las palabras, no la frase entera", () => {
    // "BOSCH" está al final del nombre, no pegado a "TALADRO".
    expect(searchProducts(catalog, "taladro bosch")).toHaveLength(1);
    expect(searchProducts(catalog, "taladro makita")).toHaveLength(0);
  });

  it("encuentra por código y por marca", () => {
    expect(searchProducts(catalog, "3840")).toHaveLength(1);
    expect(searchProducts(catalog, "bosch")).toHaveLength(2);
  });

  it("prioriza lo que arranca con lo escrito", () => {
    const results = searchProducts(catalog, "acople");
    // "ACOPLE" está en el medio del nombre, igual tiene que aparecer.
    expect(results[0].name).toBe("KIT ACOPLE RAPIDO P AIRE");
  });

  it("perdona una letra de más, de menos o cambiada", () => {
    // Tres: los dos taladros y el destornillador de la categoría "Taladros".
    expect(searchProducts(catalog, "taldro")).toHaveLength(3);   // falta una letra
    expect(searchProducts(catalog, "taladrro")).toHaveLength(3); // sobra una letra
    expect(searchProducts(catalog, "amoladore")).toHaveLength(1); // letra cambiada
    expect(searchProducts(catalog, "amolda")).toHaveLength(1);   // dos letras invertidas
  });

  it("con typo, el nombre pesa más que la categoría", () => {
    // "taldro" alcanza al destornillador por su categoría, pero los taladros
    // de verdad tienen que ir primero.
    const names = searchProducts(catalog, "taldro").map((item) => item.name);
    expect(names.slice(0, 2).every((name) => name.startsWith("TALADRO"))).toBe(true);
    expect(names.at(-1)).toBe("DESTORNILLADOR PHILLIPS");
  });

  it("no inventa resultados cuando de verdad no hay nada", () => {
    expect(searchProducts(catalog, "zzzqqq")).toHaveLength(0);
    expect(searchProducts(catalog, "heladera")).toHaveLength(0);
  });

  it("el typo no ensucia lo que ya coincide literalmente", () => {
    // "amola" coincide de verdad: la pasada aproximada ni siquiera corre y
    // no aparecen taladros parecidos.
    const names = searchProducts(catalog, "amola").map((item) => item.name);
    expect(names).toEqual(["AMOLADORA ANGULAR 4.5 PULGADAS"]);
  });

  it("respeta el límite y devuelve todo con consulta vacía", () => {
    expect(searchProducts(catalog, "a", 2)).toHaveLength(2);
    expect(searchProducts(catalog, "   ")).toHaveLength(catalog.length);
  });
});
