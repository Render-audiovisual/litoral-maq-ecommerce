import { describe, expect, it } from "vitest";
import { parseProductDescription } from "./product-description";

const EMPTY = { intro: "", specs: [], extras: [], contents: "" };

const SET_PUNTAS =
  "Set de puntas de 25 piezas GLADIATOR SPP825.\n\nDatos técnicos:\n• Cantidad de piezas: 25\n• Material: S2\n• Segmento: Profesional\n• Phillips (PH): x6\n• Pozidriv (PZ): x3\n• Recto (SL): x5\n• Hexagonal (H): x3\n• Torx (T): x7\n• Soporte universal magnético: x1\n\nContenido: 1 set de puntas de 25 piezas material S2 y 1 maletín plástico.";

describe("parseProductDescription", () => {
  it("lee una descripción por líneas (3569)", () => {
    const r = parseProductDescription(SET_PUNTAS);
    expect(r.intro).toBe("Set de puntas de 25 piezas GLADIATOR SPP825.");
    expect(r.specs).toHaveLength(9);
    expect(r.specs[0]).toEqual({ label: "Cantidad de piezas", value: "25" });
    expect(r.specs[8]).toEqual({ label: "Soporte universal magnético", value: "x1" });
    expect(r.contents).toBe("1 set de puntas de 25 piezas material S2 y 1 maletín plástico.");
    expect(r.extras).toEqual([]);
  });

  it("acepta etiquetas con punto en las viñetas y conserva comillas (3535)", () => {
    const r = parseProductDescription(
      "Llave de impacto recargable Brigada 20V NEO NEXT LI12650/20K2-4.\n\nDatos técnicos:\n• Velocidad en vacío: 0-1500 / 0-2000 / 0-2600 r/min\n• Encastre: 1/2\"\n• Torque máx. (breakaway): 950N/m\n• Peso: 2,9kg - 6,39lb\n\nContenido: 1 llave de impacto y 1 cargador.",
    );
    expect(r.specs).toContainEqual({ label: "Encastre", value: "1/2\"" });
    expect(r.specs).toContainEqual({ label: "Torque máx. (breakaway)", value: "950N/m" });
    expect(r.specs).toHaveLength(4);
    expect(r.contents).toBe("1 llave de impacto y 1 cargador.");
  });

  it("lee una descripción en oraciones (3499)", () => {
    const r = parseProductDescription(
      "Compresor Inflador Black & White Con Linterna Recargable 2Ah BWIR150. Marca: Black & White. Voltaje: 12VDC - 7,5A. Presión máxima: 150 psi / 10.3 bar - 1000kpa. Largo de Manguera: 20cm. Temperatura de trabajo: -20C - +60C. Bateria: 2Ah. Peso: 560g- 1,23Ib. Contiene. 1 Compresor inflador con linterna recargable. 1 Adaptador de valvula de neumático. 1 Adaptador para pelota.",
    );
    expect(r.intro).toBe("Compresor Inflador Black & White Con Linterna Recargable 2Ah BWIR150.");
    expect(r.specs).toHaveLength(7);
    expect(r.specs).toContainEqual({ label: "Presión máxima", value: "150 psi / 10.3 bar - 1000kpa" });
    expect(r.specs).toContainEqual({ label: "Temperatura de trabajo", value: "-20C - +60C" });
    expect(r.specs).toContainEqual({ label: "Peso", value: "560g- 1,23Ib" });
    expect(r.contents).toBe(
      "1 Compresor inflador con linterna recargable. 1 Adaptador de valvula de neumático. 1 Adaptador para pelota.",
    );
  });

  it("separa extras y no convierte en spec lo que viene tras el marcador (3653)", () => {
    const r = parseProductDescription(
      "Juego De Tubos Impacto 14 Piezas Gladiator 1/2\" JTI1014. Material: CR-MO. Cromo molibdeno. Contenido. 14 tubos: 10 / 11 / 12 / 13 / 14 / 16 / 17 / 19 / 21 / 22 / 24 / 27 / 30 / 32 mm.",
    );
    expect(r.specs).toEqual([{ label: "Material", value: "CR-MO" }]);
    expect(r.extras).toEqual(["Cromo molibdeno"]);
    expect(r.contents).toBe("14 tubos: 10 / 11 / 12 / 13 / 14 / 16 / 17 / 19 / 21 / 22 / 24 / 27 / 30 / 32 mm.");
  });

  it("no parte oraciones en decimales y respeta símbolos (3540)", () => {
    const r = parseProductDescription(
      "Lijadora de Banda NEO 1150w 76x533mm LB976/1/220. Potencia: 1150W. Tamaño de banda: 76 x 533 mm. Velocidad en vacío: n₀ = 120-380/min. Voltaje/Frecuencia: Compatible con 220V (50-60Hz) y 120V (60Hz). Largo de cable: 1.8m. Aislación: Clase II. Peso: 2,80 kg.",
    );
    expect(r.specs).toHaveLength(7);
    expect(r.specs).toContainEqual({ label: "Largo de cable", value: "1.8m" });
    expect(r.specs).toContainEqual({ label: "Velocidad en vacío", value: "n₀ = 120-380/min" });
    expect(r.contents).toBe("");
  });

  it("acepta solo la introducción", () => {
    expect(parseProductDescription("Cutter ENERGY CT7.")).toEqual({ ...EMPTY, intro: "Cutter ENERGY CT7." });
  });

  it("devuelve todo vacío sin texto", () => {
    for (const v of ["", undefined, null, "   "]) expect(parseProductDescription(v)).toEqual(EMPTY);
  });

  it("trata igual saltos de línea CRLF", () => {
    expect(parseProductDescription(SET_PUNTAS.replace(/\n/g, "\r\n"))).toEqual(parseProductDescription(SET_PUNTAS));
  });
});
