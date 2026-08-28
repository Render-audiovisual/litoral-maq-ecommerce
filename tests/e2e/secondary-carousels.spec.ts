import { expect, test } from "@playwright/test";

for (const carousel of [
  { name: "categorías", selector: ".category-marquee", card: ".winner-card" },
  { name: "clientes", selector: ".testimonial-marquee", card: ".testimonial-card" },
]) {
  test(`el carrusel de ${carousel.name} sigue el mouse en ambas direcciones`, async ({ page }) => {
    await page.goto("/");
    const rail = page.locator(carousel.selector);
    const firstCard = rail.locator(carousel.card).first();
    await expect(rail).toBeVisible();
    await rail.scrollIntoViewIfNeeded();
    await rail.evaluate((element) => {
      element.scrollLeft = element.scrollWidth / 4;
    });

    const box = await rail.boundingBox();
    if (!box) throw new Error(`No se pudo medir el carrusel de ${carousel.name}`);
    const scrollLeft = async () => rail.evaluate((element) => element.scrollLeft);

    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.waitForTimeout(650);
    const rightStart = await scrollLeft();
    await page.waitForTimeout(350);
    expect(await scrollLeft()).toBeLessThan(rightStart - 5);

    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
    await page.waitForTimeout(750);
    const leftStart = await scrollLeft();
    await page.waitForTimeout(350);
    expect(await scrollLeft()).toBeGreaterThan(leftStart + 5);
  });

  test(`el carrusel táctil de ${carousel.name} conserva la inercia`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const rail = page.locator(carousel.selector);
    await expect(rail).toBeVisible();
    await rail.scrollIntoViewIfNeeded();

    const box = await rail.boundingBox();
    if (!box) throw new Error(`No se pudo medir el carrusel táctil de ${carousel.name}`);
    const startX = box.x + box.width * 0.8;
    const y = box.y + Math.min(box.height * 0.5, 160);

    await rail.dispatchEvent("pointerdown", {
      pointerId: 9,
      pointerType: "touch",
      clientX: startX,
      clientY: y,
    });
    await page.waitForTimeout(30);
    await rail.dispatchEvent("pointermove", {
      pointerId: 9,
      pointerType: "touch",
      clientX: startX - 120,
      clientY: y,
    });
    const releasedAt = await rail.evaluate((element) => element.scrollLeft);
    await rail.dispatchEvent("pointerup", {
      pointerId: 9,
      pointerType: "touch",
      clientX: startX - 120,
      clientY: y,
    });

    await page.waitForTimeout(300);
    const afterInertia = await rail.evaluate((element) => element.scrollLeft);
    expect(afterInertia).toBeGreaterThan(releasedAt + 12);
  });
}
