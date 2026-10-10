import { expect, test } from "@playwright/test";

test("la foto reemplaza la cinta promocional sin botones ni leyenda", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".store-photo-frame img")).toBeVisible();
  await expect(page.locator(".hero-promo-slider")).toHaveCount(0);
  await expect(page.locator(".store-photo-hero a")).toHaveCount(0);
  await expect(page.locator(".store-photo-frame figcaption")).toHaveCount(0);
});
test("los productos siguen accesibles con movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".store-bestsellers-track .product-card")).toHaveCount(4);
  await expect(page.locator(".store-bestsellers-track").getByRole("button", { name: "Comprar", exact: true }).first()).toBeVisible();
});
test("en celular el riel desborda internamente pero no la página", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const track = page.locator(".store-bestsellers-track");
  await expect(track).toBeVisible();
  const sizes = await track.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth, overflow: getComputedStyle(el).overflowX }));
  expect(sizes.content).toBeGreaterThan(sizes.width);
  expect(sizes.overflow).toBe("auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
