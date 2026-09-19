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

  it("acepta variantes del encabezado de precio como 'Precio con IVA'", () => {
    const parsed = parseCatalogSheet("codigo,articulo,Precio con IVA\n1,Uno,$100", 1);
    expect(parsed.rows).toEqual([
      expect.objectContaining({ code: "1", name: "Uno", price: 100 }),
    ]);
  });

  it("rechaza códigos duplicados antes de tocar la base", () => {
    expect(() => parseCatalogSheet("codigo,articulo,precio\n1,Uno,$100\n1,Dos,$200", 2)).toThrow(/duplicado/i);
  });

  it("descarta filas incompletas sin cancelar el resto de la sincronización", () => {
    const parsed = parseCatalogSheet("codigo,articulo,precio\n1,Uno,$100\n2,,$200", 1);
    expect(parsed.rows).toEqual([expect.objectContaining({ code: "1", name: "Uno" })]);
    expect(parsed.invalidRows).toEqual([3]);
  });

  it("conserva el código de filas con precio ilegible (celda '############') para no retirarlas", () => {
    const parsed = parseCatalogSheet("codigo,articulo,precio\n1,Uno,$100\n2,Dos,############", 1);
    expect(parsed.rows).toEqual([expect.objectContaining({ code: "1", name: "Uno" })]);
    expect(parsed.unpriceable).toEqual([{ code: "2", sourceRow: 3 }]);
  });

  it("cancela respuestas parciales", () => {
    expect(() => parseCatalogSheet("codigo,articulo,precio\n1,Uno,$100", 100)).toThrow(/solo 1 productos/i);
  });
});
