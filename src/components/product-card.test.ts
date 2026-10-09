import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/product-card.tsx"),
  "utf8",
);
const styles = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("ProductCard interaction contract", () => {
  it("uses one card-wide product link without nesting the purchase button", () => {
    expect(source).toContain('className="product-card-link"');
    expect(source).toMatch(/aria-label={`Ver \${product\.name}`}/);
    expect(source).not.toMatch(/<Link[^>]*className="product-image"/);
    expect(source).not.toMatch(/<Link[\s\S]*?<button[\s\S]*?<\/Link>/);
    expect(styles).toMatch(/\.product-card-link\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0;/);
  });

  it("keeps Comprar as a separate stock-aware cart action", () => {
    expect(source).toContain("disabled={!canAddProductToCart(product)}");
    expect(source).toContain("addToCart(product.id)");
    expect(source).toContain('{added ? "Agregado" : "Comprar"}');
    expect(styles).toMatch(/\.product-card-body > \.button\s*{[^}]*z-index:\s*2;/);
  });
});
