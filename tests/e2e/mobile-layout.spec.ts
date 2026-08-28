import { expect, test } from "@playwright/test";

const MOBILE_ROUTES = [
  "/",
  "/productos",
  "/carrito",
  "/checkout",
  "/login",
  "/registro",
  "/recuperar-clave",
  "/confirmar-cuenta",
  "/restablecer-clave",
  "/politica-de-privacidad",
  "/terminos-y-condiciones",
];

test.describe("layout móvil", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const route of MOBILE_ROUTES) {
    test(`${route} no genera desborde horizontal`, async ({ page }) => {
      await page.goto(route);

      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
    });
  }

  test("el acceso queda centrado y sus campos no activan zoom en iOS", async ({ page }) => {
    await page.goto("/login");

    const card = page.locator(".auth-card");
    await expect(card).toBeVisible();

    const alignment = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: window.innerWidth - rect.right,
      };
    });
    expect(Math.abs(alignment.left - alignment.right)).toBeLessThanOrEqual(1);

    const editableFontSizes = await page
      .locator('input:not([type="checkbox"]):not([type="radio"]), select, textarea')
      .evaluateAll((elements) =>
        elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      );
    expect(editableFontSizes.length).toBeGreaterThan(0);
    expect(editableFontSizes.every((size) => size >= 16)).toBe(true);
  });

  test("el buscador mantiene 16px al enfocarse", async ({ page }) => {
    await page.goto("/");

    const search = page.locator("#site-search");
    await search.focus();
    await expect(search).toBeFocused();
    expect(
      await search.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16);
  });
});
