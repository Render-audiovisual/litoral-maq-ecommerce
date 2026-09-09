import { expect, test } from "@playwright/test";

test("el carrusel del hero se arrastra con el mouse y conserva el envión", async ({ page }) => {
  await page.goto("/");
  const slider = page.locator(".hero-promo-slider");
  const firstCard = slider.locator(".hero-promo-card").first();
  await expect(slider).toBeVisible();

  const sliderBox = await slider.boundingBox();
  if (!sliderBox) throw new Error("No se pudo medir el carrusel");
  const cardX = async () => (await firstCard.boundingBox())?.x ?? 0;

  const y = sliderBox.y + sliderBox.height * 0.5;
  // Hacia la derecha: el automático corre las tarjetas a la izquierda, así que
  // todo movimiento a la derecha viene del gesto y no del giro de fondo.
  await page.mouse.move(sliderBox.x + sliderBox.width * 0.25, y);
  await page.mouse.down();
  const grabbedAt = await cardX();
  for (const step of [30, 60, 100, 145, 195]) {
    await page.mouse.move(sliderBox.x + sliderBox.width * 0.25 + step, y);
  }
  const draggedTo = await cardX();
  expect(draggedTo).toBeGreaterThan(grabbedAt + 60);

  await page.mouse.up();
  await page.waitForTimeout(140);
  expect(await cardX()).toBeGreaterThan(draggedTo + 5);

  // El envión se agota solo y vuelve al automático, que va al otro lado.
  await page.waitForTimeout(1800);
  const settled = await cardX();
  await page.waitForTimeout(450);
  expect(await cardX()).toBeLessThan(settled - 3);
});

test("el carrusel táctil conserva inercia y vuelve al movimiento automático", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const slider = page.locator(".hero-promo-slider");
  const firstCard = slider.locator(".hero-promo-card").first();
  await expect(slider).toBeVisible();

  const sliderBox = await slider.boundingBox();
  if (!sliderBox) throw new Error("No se pudo medir el carrusel táctil");
  const startX = sliderBox.x + sliderBox.width * 0.78;
  const y = sliderBox.y + sliderBox.height * 0.5;

  await slider.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    clientX: startX,
    clientY: y,
  });
  await page.waitForTimeout(35);
  await slider.dispatchEvent("pointermove", {
    pointerId: 7,
    pointerType: "touch",
    clientX: startX - 150,
    clientY: y,
  });
  const releasedAt = (await firstCard.boundingBox())?.x ?? 0;
  await slider.dispatchEvent("pointerup", {
    pointerId: 7,
    pointerType: "touch",
    clientX: startX - 150,
    clientY: y,
  });

  await page.waitForTimeout(350);
  const afterInertia = (await firstCard.boundingBox())?.x ?? 0;
  expect(afterInertia).toBeLessThan(releasedAt - 8);

  await page.waitForTimeout(1700);
  const later = (await firstCard.boundingBox())?.x ?? 0;
  expect(later).not.toBe(afterInertia);
});
