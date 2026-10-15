import { expect, test } from "@playwright/test";
test("en celular Más vendidos queda manual, sin copias ni avance automático", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  const rail=page.locator(".category-marquee");
  await rail.scrollIntoViewIfNeeded();
  await expect(rail.locator('.winner-card[aria-hidden="true"]').first()).toBeHidden();
  const before=await rail.evaluate(el=>el.scrollLeft);
  await page.waitForTimeout(1800);
  expect(await rail.evaluate(el=>el.scrollLeft)).toBe(before);
});
test("el carrusel azul muestra productos y lleva a sus fichas", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#productos-estrella");
  await expect(section.getByRole("heading", { name: "Más vendidos", exact: true })).toBeVisible();
  expect(await section.locator(".winner-card").count()).toBeGreaterThanOrEqual(8);
  await expect(section.locator(".winner-card").first()).not.toContainText("Desde");
  await expect(page.locator(".store-bestsellers")).toHaveCount(0);
  const first = section.locator(".winner-card").first();
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^\/producto\?slug=/);
  await first.dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp("/producto\\?slug="));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
test("un clic normal no se captura como arrastre y abre el producto", async ({ page }) => {
  await page.goto("/");
  const link = page.locator(".winner-card").first();
  await expect(link).toBeVisible();
  await link.dispatchEvent("pointerdown", { pointerId: 17, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
  expect(await page.locator(".category-marquee").evaluate(el => el.hasPointerCapture(17))).toBe(false);
  await link.dispatchEvent("pointerup", { pointerId: 17, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
  await link.dispatchEvent("click");
  await expect(page).toHaveURL(/\/producto\?slug=/);
});
