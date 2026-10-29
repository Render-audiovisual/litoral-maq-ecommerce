import { describe, expect, it } from "vitest";
import { parseShippingDimensionsSheet } from "../../supabase/functions/_shared/catalog-sheet";

describe("planilla de medidas de envío", () => {
  it("lee peso y medidas con coma decimal, unidades y ceros a la izquierda", () => {
    const csv = [
      "Código,Producto,Peso embalado (kg),Alto (cm),Ancho (cm),Largo (cm),Fuente",
      '03611,Taladro,"4,5",28,"11,5",36cm,Medido',
      "3656,Tubos,9.1 kg,34,9.5,45,Medido",
    ].join("\n");
    expect(parseShippingDimensionsSheet(csv)).toEqual({
      rows: [
        { code: "3611", weightKg: 4.5, heightCm: 28, widthCm: 12, lengthCm: 36 },
        { code: "3656", weightKg: 9.1, heightCm: 34, widthCm: 10, lengthCm: 45 },
      ],
      incomplete: [],
    });
  });

  it("ignora filas incompletas o con texto y no repite códigos", () => {
    const csv = [
      "codigo,peso,alto,ancho,largo",
      "1,2,10,10,",
      "2,dos,10,10,10",
      "3,0,10,10,10",
      "4,1,10,10,10",
      "4,9,90,90,90",
    ].join("\n");
    const parsed = parseShippingDimensionsSheet(csv);
    expect(parsed.rows.map((row) => row.code)).toEqual(["4"]);
    expect(parsed.incomplete).toEqual([2, 3, 4]);
  });

  it("exige las columnas mínimas", () => {
    expect(() => parseShippingDimensionsSheet("codigo,peso,alto\n1,2,3")).toThrow(/Largo/);
  });
});
