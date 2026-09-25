import { describe, expect, it } from "vitest";
import { pageWindow, paginate } from "./paginate";

const items = Array.from({ length: 528 }, (_, index) => index + 1);

describe("paginate", () => {
  it("devuelve la primera página con su rango", () => {
    const result = paginate(items, 1, 50);
    expect(result.items).toHaveLength(50);
    expect(result.items[0]).toBe(1);
    expect(result).toMatchObject({ page: 1, pageCount: 11, from: 1, to: 50, total: 528 });
  });

  it("la última página trae el resto", () => {
    const result = paginate(items, 11, 50);
    expect(result.items).toEqual(items.slice(500));
    expect(result).toMatchObject({ page: 11, from: 501, to: 528 });
  });

  it("acota páginas fuera de rango (por ejemplo, después de eliminar filas)", () => {
    expect(paginate(items, 99, 50).page).toBe(11);
    expect(paginate(items, 0, 50).page).toBe(1);
    expect(paginate(items, Number.NaN, 50).page).toBe(1);
    expect(paginate(items.slice(0, 60), 3, 50)).toMatchObject({ page: 2, from: 51, to: 60 });
  });

  it("una lista vacía tiene una sola página sin filas", () => {
    expect(paginate([], 4, 50)).toEqual({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

describe("pageWindow", () => {
  it("muestra todas las páginas cuando son pocas", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("recorta alrededor de la página actual con saltos marcados como null", () => {
    expect(pageWindow(1, 11)).toEqual([1, 2, null, 11]);
    expect(pageWindow(6, 11)).toEqual([1, null, 5, 6, 7, null, 11]);
    expect(pageWindow(11, 11)).toEqual([1, null, 10, 11]);
  });

  it("no deja un salto de una sola página", () => {
    expect(pageWindow(4, 11)).toEqual([1, 2, 3, 4, 5, null, 11]);
    expect(pageWindow(8, 11)).toEqual([1, null, 7, 8, 9, 10, 11]);
  });
});
