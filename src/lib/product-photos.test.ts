import { describe, expect, it } from "vitest";
import { isPhotoUrl, productPhoto, withProductPhoto } from "./product-photos";
import type { Product } from "./types";

describe("product photos", () => {
  it("separates empty images and uses the gallery fallback", () => {
    expect(productPhoto({ image: "  ", images: [] })).toBeNull();
    expect(productPhoto({ image: null, images: ["", "/products/test.webp"] })).toBe("/products/test.webp");
    expect(productPhoto({ image: "/products/main.webp", images: ["/products/other.webp"] })).toBe("/products/main.webp");
  });
  it("only accepts secure image links and catalog paths", () => {
    expect(isPhotoUrl("https://example.com/photo.jpg")).toBe(true);
    expect(isPhotoUrl("/products/catalog/photo.webp")).toBe(true);
    for (const url of ["javascript:alert(1)", "http://example.com/a.jpg", "//evil.test/a", "https://user:pass@example.com/a", "data:image/png;base64,abc", ""]) expect(isPhotoUrl(url)).toBe(false);
  });
  it("keeps all commercial data and existing gallery photos", () => {
    const product = { id: "test", name: "Taladro", price: 3000, stock: 7, image: "/products/old.webp", images: ["/products/old.webp", "/products/detail.webp"], incomplete: ["image", "stock"] } as Product;
    const updated = withProductPhoto(product, "https://example.com/new.webp");
    expect(updated.price).toBe(product.price);
    expect(updated.stock).toBe(product.stock);
    expect(updated.images).toEqual(["https://example.com/new.webp", ...product.images]);
    expect(updated.incomplete).toEqual(["stock"]);
    expect(product.image).toBe("/products/old.webp");
  });
});
