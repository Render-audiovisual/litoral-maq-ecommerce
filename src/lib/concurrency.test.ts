import { describe, expect, it } from "vitest";
import {
  changedProductFields,
  orderConflictMessage,
  rebaseProductEdits,
} from "./concurrency";
import type { Product } from "./types";

const base: Product = {
  id: "p1",
  slug: "p1",
  code: "P1",
  name: "Amoladora",
  price: 100,
  rawPrice: "100",
  category: "Herramientas",
  brand: "X",
  image: null,
  images: ["a.jpg"],
  stock: 5,
  lowStockThreshold: 2,
  purchaseLimit: 3,
  active: true,
  featured: false,
  description: "Original",
  variants: [],
  source: "google-sheet",
  sourceRow: 4,
  incomplete: [],
  updatedAt: "2026-09-25T10:00:00.000Z",
};

describe("changedProductFields", () => {
  it("devuelve solo los campos que la persona cambió", () => {
    expect(
      changedProductFields(base, { ...base, featured: true, description: "Nueva" }),
    ).toEqual({ featured: true, description: "Nueva" });
  });

  it("sin cambios devuelve un objeto vacío (compara arrays por contenido)", () => {
    expect(changedProductFields(base, { ...base, images: ["a.jpg"] })).toEqual({});
  });

  it("nunca incluye id ni la versión", () => {
    expect(
      changedProductFields(base, { ...base, updatedAt: "otra", active: false }),
    ).toEqual({ active: false });
  });
});

describe("rebaseProductEdits", () => {
  it("conserva lo que cambió la otra persona y encima las ediciones sin guardar", () => {
    const fresh = { ...base, category: "Jardín", updatedAt: "2026-09-25T11:00:00.000Z" };
    const edited = { ...base, description: "Mi texto" };
    expect(rebaseProductEdits(fresh, base, edited)).toEqual({
      ...fresh,
      description: "Mi texto",
    });
  });
});

describe("orderConflictMessage", () => {
  it("nombra el estado vigente", () => {
    expect(orderConflictMessage("Preparando")).toBe(
      "El pedido ya cambió a «Preparando» (lo movió otra persona). Revisá el estado y volvé a intentar.",
    );
    expect(orderConflictMessage("Confirmado", "El pago del pedido")).toMatch(/^El pago del pedido ya cambió a «Confirmado»/);
  });
});
