import { describe, expect, it } from "vitest";
import { parseCatalogSheet } from "../../supabase/functions/_shared/catalog-sheet";

describe("validador del Sheet ejecutado en servidor", () => {
  it("acepta encabezados reales, comillas y precios argentinos", () => {
    const parsed = parseCatalogSheet(
      'CÓDIGO,ARTÍCULO,PRECIO CONTADO\n1,"Taladro, 13 mm","$ 1.250,50"\n2,Amoladora,$ 12.000',
      2,
    );
    expect(parsed.rows).toEqual([
      expect.objectContaining({ code: "1", name: "Taladro, 13 mm", price: 1250.5, sourceRow: 2 }),
      expect.objectContaining({ code: "2", name: "Amoladora", price: 12000, sourceRow: 3 }),
    ]);
  });

  it("rechaza filas inválidas y códigos duplicados antes de tocar la base", () => {
    expect(() => parseCatalogSheet("codigo,articulo,precio\n1,Uno,$100\n1,Dos,$200", 2)).toThrow(/duplicado/i);
    expect(() => parseCatalogSheet("codigo,articulo,precio\n1,,$100", 1)).toThrow(/fila/i);
  });

  it("cancela respuestas parciales", () => {
    expect(() => parseCatalogSheet("codigo,articulo,precio\n1,Uno,$100", 100)).toThrow(/solo 1 productos/i);
  });
});
