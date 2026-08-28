import { describe, expect, it } from "vitest";
import { BUSINESS, DEFENSA_CONSUMIDOR_URL } from "./business";

/**
 * `razonSocial` y `cuit` se completan a mano después de la reunión con el
 * negocio. El riesgo real no es que estén vacíos —el footer y la página legal
 * los omiten— sino que se carguen mal y quede una identidad fiscal inválida
 * publicada. Estos tests sólo validan el formato cuando hay valor.
 */
describe("BUSINESS", () => {
  it("siempre expone un canal de contacto y un domicilio", () => {
    expect(BUSINESS.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(BUSINESS.domicilio.trim().length).toBeGreaterThan(0);
  });

  it("si hay CUIT cargado, respeta el formato 00-00000000-0", () => {
    if (!BUSINESS.cuit) return;
    expect(BUSINESS.cuit).toMatch(/^\d{2}-\d{8}-\d$/);
  });

  it("si hay razón social cargada, no es un placeholder", () => {
    if (!BUSINESS.razonSocial) return;
    expect(BUSINESS.razonSocial).not.toMatch(/todo|completar|xxx/i);
  });

  it("el enlace a Defensa del Consumidor es una URL oficial", () => {
    expect(new URL(DEFENSA_CONSUMIDOR_URL).hostname).toMatch(/\.gob\.ar$/);
  });
});
