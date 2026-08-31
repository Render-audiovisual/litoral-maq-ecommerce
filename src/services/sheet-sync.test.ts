import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { looksLikeHtml, parseSheetProducts } from "./sheet-sync";
import { DEFAULT_PURCHASE_LIMIT } from "@/lib/purchase-limits";
import { DEFAULT_PURCHASE_LIMIT as PARSER_PURCHASE_LIMIT } from "../../supabase/functions/_shared/sheet-parser";

const existing: Product = {
  id: "1",
  slug: "producto-original-1",
  code: "1",
  name: "Producto original",
  price: 100,
  rawPrice: "$ 100,00",
  category: "Categoría manual",
  brand: "Marca manual",
  image: "/products/original.png",
  images: ["/products/original.png"],
  stock: 9,
  lowStockThreshold: 2,
  active: true,
  featured: true,
  description: "Descripción cargada en el panel",
  variants: [],
  source: "google-sheet",
  sourceRow: 2,
  incomplete: ["stock"],
};

function validCsv(extraRows = 100) {
  const rows = ['codigo,articulo,preciocon', '1,Producto actualizado,"$ 1.250,50"'];
  for (let index = 0; index < extraRows; index += 1) {
    rows.push(`${index + 2},Producto ${index + 2},"$ ${index + 2}.000,00"`);
  }
  return rows.join("\n");
}

describe("sincronización real de Google Sheets", () => {
  it("acepta los encabezados actuales y conserva los datos administrados fuera del Sheet", () => {
    const result = parseSheetProducts(validCsv(), [existing]);
    const updated = result.products.find((product) => product.code === "1");
    expect(result.products).toHaveLength(101);
    expect(result.created).toBe(100);
    expect(result.updated).toBe(1);
    expect(updated).toMatchObject({
      slug: "producto-original-1",
      name: "Producto actualizado",
      price: 1250.5,
      stock: 9,
      image: "/products/original.png",
      description: "Descripción cargada en el panel",
      category: "Categoría manual",
    });
    expect(result.products.find((product) => product.code === "2")).toMatchObject({
      active: false,
      stock: 0,
      description: null,
    });
  });

  it("conserva ocultos los productos ausentes del Sheet en vez de borrarlos", () => {
    const absent = { ...existing, id: "999", code: "999", active: true, featured: true };
    const result = parseSheetProducts(validCsv(), [existing, absent]);
    expect(result.removed).toBe(1);
    expect(result.products.find((product) => product.code === "999")).toMatchObject({
      active: false,
      featured: false,
      image: "/products/original.png",
      description: "Descripción cargada en el panel",
    });
    expect(result.products.find((product) => product.code === "999")?.incomplete).toContain("sheet-absent");
    expect(result.products.find((product) => product.code === "1")?.incomplete).not.toContain("sheet-absent");
  });

  it("acepta variantes de encabezados con mayúsculas y espacios", () => {
    const csv = validCsv().replace("codigo,articulo,preciocon", "CÓDIGO,ARTÍCULO,PRECIO CONTADO");
    expect(parseSheetProducts(csv, [existing]).products).toHaveLength(101);
  });

  it("rechaza códigos duplicados sin modificar el catálogo", () => {
    const csv = `${validCsv()}\n1,Duplicado,"$ 1.000,00"`;
    expect(() => parseSheetProducts(csv, [existing])).toThrow(/duplicado/i);
  });

  it("rechaza respuestas parciales para no borrar el catálogo por accidente", () => {
    expect(() => parseSheetProducts("codigo,articulo,preciocon\n1,Uno,$100", [existing])).toThrow(/solo 1 productos/i);
  });

  it("omite la fila mal cargada y sincroniza el resto", () => {
    const csv = `${validCsv()}\n,Sin código,"$ 900,00"\n9001,Sin precio,`;
    const result = parseSheetProducts(csv, [existing]);
    expect(result.skipped).toBe(2);
    expect(result.products).toHaveLength(101);
    expect(result.warnings.some((warning) => /omitieron 2 filas/.test(warning))).toBe(true);
  });

  it("aborta si el Sheet viene mayormente inválido en vez de vaciar el catálogo", () => {
    const rows = ["codigo,articulo,preciocon"];
    for (let index = 0; index < 120; index += 1) rows.push(`,Fila rota ${index},`);
    for (let index = 0; index < 100; index += 1) {
      rows.push(`${index + 2},Producto ${index + 2},"$ 1.000,00"`);
    }
    expect(() => parseSheetProducts(rows.join("\n"), [existing])).toThrow(/filas inválidas/i);
  });

  it("no confunde el login de Google con datos del Sheet", () => {
    expect(looksLikeHtml('<!DOCTYPE html><html><body>Iniciá sesión')).toBe(true);
    expect(looksLikeHtml("codigo,articulo,preciocon", "text/csv")).toBe(false);
    expect(looksLikeHtml("codigo,articulo", "text/html; charset=utf-8")).toBe(true);
  });

  it("mantiene el tope por pedido igual en el parser compartido y en el panel", () => {
    expect(PARSER_PURCHASE_LIMIT).toBe(DEFAULT_PURCHASE_LIMIT);
  });
});
