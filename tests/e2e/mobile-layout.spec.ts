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

  test("los campos no activan zoom tampoco con el celular apaisado", async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/productos");
    await expect(page.locator(".filters")).toBeVisible();

    const editableFontSizes = await page
      .locator('input:not([type="checkbox"]):not([type="radio"]), select, textarea')
      .evaluateAll((elements) =>
        elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      );
    expect(editableFontSizes.length).toBeGreaterThan(0);
    expect(editableFontSizes.every((size) => size >= 16)).toBe(true);
  });

  test("el botón flotante de WhatsApp no tapa las pantallas de compra", async ({ page }) => {
    const floating = page.getByRole("link", { name: "Consultar por WhatsApp" });
    await page.goto("/productos");
    await expect(floating).toBeVisible();
    await page.goto("/carrito");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(floating).toBeHidden();
  });

  test("la cabecera y el hero mantienen una jerarquía compacta", async ({ page }) => {
    await page.goto("/");

    const header = page.locator(".site-header");
    expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(105);

    const primaryAction = page.getByRole("link", { name: "Explorar catálogo" });
    const promo = page.locator(".hero-promo-slider");
    const [actionBox, promoBox] = await Promise.all([
      primaryAction.boundingBox(),
      promo.boundingBox(),
    ]);
    expect(actionBox).not.toBeNull();
    expect(promoBox).not.toBeNull();
    expect(actionBox!.y + actionBox!.height).toBeLessThan(promoBox!.y);

    await page.evaluate(() => document.scrollingElement?.scrollTo(0, 900));
    await expect(header).toBeInViewport();
    expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(105);
  });
});
