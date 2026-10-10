import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`la foto carga sin entrada decorativa (movimiento ${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const image = page.locator(".store-photo-frame img");
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty("complete", true);
    expect(await image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.locator(".store-photo-frame").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  });
}
test("la foto precede a más vendidos en celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const photo = page.locator(".store-photo-frame");
  const products = page.locator(".store-bestsellers");
  await expect(photo).toBeVisible();
  await expect(products).toBeVisible();
  const photoBox = await photo.boundingBox();
  const productsBox = await products.boundingBox();
  expect(photoBox).not.toBeNull();
  expect(productsBox).not.toBeNull();
  expect(photoBox!.y + photoBox!.height).toBeLessThan(productsBox!.y);
});
