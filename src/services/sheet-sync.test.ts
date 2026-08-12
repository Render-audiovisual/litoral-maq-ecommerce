import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { parseSheetProducts } from "./sheet-sync";

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
});
