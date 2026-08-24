import { describe, expect, it } from "vitest";
import { mergeCartLines } from "./cart";

describe("mergeCartLines", () => {
  it("conserva productos locales y remotos sin duplicar cantidades", () => {
    expect(mergeCartLines(
      [{ productId: "local", quantity: 1 }, { productId: "shared", quantity: 2 }],
      [{ productId: "remote", quantity: 3 }, { productId: "shared", quantity: 2 }],
    )).toEqual([
      { productId: "remote", quantity: 3 },
      { productId: "shared", quantity: 2 },
      { productId: "local", quantity: 1 },
    ]);
  });

  it("descarta cantidades inválidas y toma la mayor versión por producto", () => {
    expect(mergeCartLines(
      [{ productId: "p1", quantity: 4 }, { productId: "bad", quantity: 0 }],
      [{ productId: "p1", quantity: 1 }],
    )).toEqual([{ productId: "p1", quantity: 4 }]);
  });
});
