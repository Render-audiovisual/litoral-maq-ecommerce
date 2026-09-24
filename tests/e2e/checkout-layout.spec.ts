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

  // Se lee del CSS y no de `getAnimations()`: la animación dura ~0.9 s y en un runner
  // lento podría ya no estar activa (o no haber empezado). `animationName` no cambia.
  const check = (selector: string, keyframes: string) =>
    page.locator(selector).evaluate((el, name) => {
      const rule = Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .find((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule && r.name === name);
      const from = rule?.findRule("from") as CSSKeyframeRule | null | undefined;
      return { transform: from?.style.transform ?? "", animationName: getComputedStyle(el).animationName };
    }, keyframes);

  // translate3d(-Npx, 0, 0) → sale de la izquierda; translate3d(Npx, 0, 0) → sale de la derecha.
  const form = await check(".checkout-layout > .checkout-steps", "checkout-form-in");
  expect(form.animationName).toBe("checkout-form-in");
  expect(form.transform).toMatch(/^translate3d\(-\d+px/);
  const summary = await check(".checkout-layout > .order-summary", "checkout-summary-in");
  expect(summary.animationName).toBe("checkout-summary-in");
  expect(summary.transform).toMatch(/^translate3d\(\d+px/);
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

test("el checkout avisa que el pedido se reserva 24 horas", async ({ page }) => {
  await openCheckout(page);
  await expect(page.locator(".order-summary .reservation-note")).toContainText("24 horas");
  // El servidor de e2e no define NEXT_PUBLIC_MERCADO_PAGO_ENABLED: modo "Confirmación por WhatsApp".
  await expect(page.locator(".order-summary .reservation-note")).toContainText("Reservamos tu solicitud por 24 horas");
  await expect(page.locator(".order-summary .reservation-note")).toContainText("no confirmamos el pago con vos");
});

test("no cotiza el envío sin todos los datos de contacto y avisa junto al botón", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Código postal").fill("3400");
  await page.getByLabel("Localidad").fill("Corrientes");
  await page.getByLabel("Calle").fill("San Juan");
  await page.getByLabel("Número").fill("1234");
  await page.getByLabel("Nombre", { exact: true }).fill("Cliente");
  // Falta apellido, email, teléfono y DNI.
  await page.getByRole("button", { name: "Calcular opciones de envío" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Completá nombre, apellido, email, teléfono y DNI");
  await expect(page.getByText("Envío a coordinar", { exact: true })).toHaveCount(0);
  // El aviso vive dentro de la tarjeta de Entrega, no al final del formulario.
  await expect(page.locator("section.form-card").nth(1).getByRole("alert")).toBeVisible();
});

test("las opciones de entrega son tarjetas con el radio junto al texto", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await openCheckout(page);
  const envio = page.locator(".delivery-options .choice").first();
  await expect(envio).toHaveClass(/selected/);
  const radio = await envio.locator("input").boundingBox();
  const title = await envio.locator("strong").boundingBox();
  // El radio es chico (no se estira) y queda a la izquierda del título.
  expect(radio!.width).toBeLessThanOrEqual(20);
  expect(radio!.x + radio!.width).toBeLessThan(title!.x);
});

