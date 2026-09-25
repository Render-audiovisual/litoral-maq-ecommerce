import { expect, test } from "@playwright/test";

const SLUG = "escalera-multifuncion-4-x-4-obra-ema804-3687";

test("la ficha sugiere otros productos en una cinta que no se frena con el mouse", async ({ page }) => {
  await page.goto(`/producto?slug=${SLUG}`);
  const section = page.locator(".pdp-related");
  await expect(section.getByRole("heading", { name: "También te puede interesar" })).toBeVisible();

  // Tarjetas reales: las copias del bucle quedan fuera del árbol accesible.
  const realCards = section.locator(".pdp-related-item:not([aria-hidden]) .product-card");
  expect(await realCards.count()).toBeGreaterThanOrEqual(6);
  const hrefs = await realCards.locator("a.product-name").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs).not.toContain(`/producto?slug=${SLUG}`);
  expect(
    await section.locator(".pdp-related-item[aria-hidden]").evaluateAll((items) =>
      items.every((item) => item.hasAttribute("inert")),
    ),
  ).toBe(true);

  const rail = section.locator(".pdp-related-rail");
  await rail.scrollIntoViewIfNeeded();
  const position = () => rail.evaluate((el) => el.scrollLeft);
  const start = await position();
  await expect.poll(position).not.toBe(start);

  await realCards.nth(1).hover({ force: true });
  const hovered = await position();
  await expect.poll(position).not.toBe(hovered);
});

for (const width of [390, 1280]) {
  test(`sin desborde horizontal a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/producto?slug=${SLUG}`);
    await expect(page.locator(".pdp-related-item").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("un clic en una sugerencia abre ese producto", async ({ page }) => {
  await page.goto(`/producto?slug=${SLUG}`);
  await page.locator(".pdp-related").scrollIntoViewIfNeeded();
  // La tercera tarjeta: queda entera a la vista aunque la cinta avance sola.
  const link = page.locator(".pdp-related-item:not([aria-hidden]) a.product-name").nth(2);
  const name = (await link.textContent())?.trim() ?? "";
  // La cinta nunca está quieta: `force` evita esperar a que el enlace se
  // estabilice, pero el clic sigue siendo un clic real del mouse.
  await link.click({ force: true });
  await expect(page).toHaveURL(/\/producto\?slug=/);
  await expect(page).not.toHaveURL(new RegExp(SLUG));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});
