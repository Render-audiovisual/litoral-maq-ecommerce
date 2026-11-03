import { describe, expect, it } from "vitest";
import { productPatch } from "./supabase-adapter";

describe("productPatch con los campos de precio fijado y ocultamiento automático", () => {
  it("mapea priceLocked y autoHidden a sus columnas", () => {
    expect(productPatch({ price: 10, priceLocked: true, autoHidden: false })).toEqual({
      price: 10,
      price_locked: true,
      auto_hidden: false,
    });
  });

  it("no toca esas columnas si no cambiaron", () => {
    expect(productPatch({ featured: true })).toEqual({ featured: true });
  });
});
