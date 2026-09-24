import { expect, test, type Page } from "@playwright/test";

async function openCheckout(page: Page) {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Confirmá tu pedido" })).toBeVisible();
}

test("el formulario entra por la izquierda y el cuadro por la derecha, aun con reducir animaciones", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCheckout(page);

  const from = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const animation = el.getAnimations()[0];
      const frames = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      return String(frames[0]?.transform ?? "");
    });

  // translate3d(-Npx, 0, 0) → sale de la izquierda; translate3d(Npx, 0, 0) → sale de la derecha.
  expect(await from(".checkout-layout > .checkout-steps")).toMatch(/translate3d\(-\d+px/);
  expect(await from(".checkout-layout > .order-summary")).toMatch(/translate3d\(\d+px/);
});

test("al terminar la animación el cuadro no queda con transform y sigue pegado al hacer scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCheckout(page);
  const summary = page.locator(".checkout-layout > .order-summary");

  await expect.poll(() => summary.evaluate((el) => getComputedStyle(el).transform), { timeout: 3000 }).toBe("none");
  await expect(summary).toHaveCSS("position", "sticky");

  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => Math.round((await summary.boundingBox())!.y)).toBe(115);
});

test("el checkout ofrece WhatsApp con el carrito ya armado", async ({ page }) => {
  await openCheckout(page);
  const link = page.getByRole("link", { name: /Escribinos por WhatsApp/ });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href")) ?? "";
  expect(href).toContain("https://wa.me/5493794215065?text=");
  expect(decodeURIComponent(href)).toContain("Mi carrito");
});
