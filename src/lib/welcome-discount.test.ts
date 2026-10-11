import { describe, expect, it } from "vitest";
import { welcomeDiscount } from "./welcome-discount";
describe("welcome discount", () => {
  it("discounts products only and matches the provider item sum", () => {
    const result = welcomeDiscount([{ unitPrice: 88999.89, quantity: 3 }, { unitPrice: 100, quantity: 2 }]);
    expect(result.subtotal).toBeCloseTo(result.items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), 2);
    expect(result.amount + result.subtotal).toBeCloseTo(88999.89 * 3 + 200, 2);
    expect(result.items[1].unitPrice).toBe(95);
  });
  it("rejects invalid amounts or quantities", () => {
    for (const unitPrice of [0, -1, NaN, Infinity]) expect(() => welcomeDiscount([{unitPrice, quantity:1}])).toThrow();
    expect(() => welcomeDiscount([{unitPrice:100, quantity:1.5}])).toThrow();
  });
});
