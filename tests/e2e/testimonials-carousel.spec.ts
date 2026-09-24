import { expect, type Page, test } from "@playwright/test";

const belt = ".testimonial-belt";
const track = ".testimonial-track";
const card = ".testimonial-card";

async function trackX(page: Page) {
  return page.locator(track).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
}

/** Escala de la tarjeta más cerca del centro de la cinta y de la que está un paso al costado. */
async function centerAndSideScale(page: Page) {
  return page.evaluate(({ beltSel, cardSel }) => {
    const beltBox = document.querySelector<HTMLElement>(beltSel)!.getBoundingClientRect();
    const middle = beltBox.left + beltBox.width / 2;
    const cards = [...document.querySelectorAll<HTMLElement>(cardSel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { distance: Math.abs(r.left + r.width / 2 - middle), scale: new DOMMatrixReadOnly(getComputedStyle(el).transform).a };
    }).sort((a, b) => a.distance - b.distance);
    return { center: cards[0].scale, side: cards[2].scale };
  }, { beltSel: belt, cardSel: card });
}

async function openSection(page: Page) {
  await page.goto("/");
  await page.locator(".testimonials-section").scrollIntoViewIfNeeded();
  await expect(page.locator(belt)).toBeVisible();
  // Fuera del camino: la cinta se frena con el mouse encima.
  await page.mouse.move(0, 0);
}

test("la cinta avanza sola y sin cortes: el juego de tarjetas va duplicado", async ({ page }) => {
  await openSection(page);
  const originales = await page.locator(`${card}:not([aria-hidden="true"])`).count();
  expect(await page.locator(card).count()).toBe(originales * 2);

  const antes = await trackX(page);
  await page.waitForTimeout(1200);
  expect(await trackX(page)).not.toBe(antes);
});

test("la tarjeta del centro se ve más grande que las de los costados, sin transparencias", async ({ page }) => {
  await openSection(page);
  await page.waitForTimeout(400);
  const { center, side } = await centerAndSideScale(page);
  expect(center).toBeGreaterThan(1.05);
  expect(side).toBeLessThan(0.95);
  expect(center / side).toBeGreaterThan(1.2);

  const efectos = await page.locator(card).evaluateAll((els) =>
    els.map((el) => ({ opacity: getComputedStyle(el).opacity, filter: getComputedStyle(el).filter })),
  );
  expect(efectos.every((e) => e.opacity === "1" && e.filter === "none")).toBe(true);
});

test("con el mouse encima se frena y se puede arrastrar", async ({ page }) => {
  await openSection(page);
  await page.locator(belt).hover();
  await page.waitForTimeout(200);
  const quieta = await trackX(page);
  await page.waitForTimeout(1200);
  expect(await trackX(page)).toBe(quieta);

  const box = await page.locator(belt).boundingBox();
  if (!box) throw new Error("No se pudo medir la cinta");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, y, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 - 160, y, { steps: 4 });
  await page.mouse.up();
  expect(Math.abs((await trackX(page)) - quieta)).toBeGreaterThan(60);
});

test("un video se reproduce desde su tarjeta y mientras suena la cinta no avanza", async ({ page }) => {
  await openSection(page);
  const play = page.locator(".testimonial-play").first();
  await play.evaluate((button: HTMLButtonElement) => button.click());
  const video = page.locator(`${card}:not([aria-hidden="true"]) video`).first();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.controls)).toBe(true);

  const durante = await trackX(page);
  await page.waitForTimeout(1200);
  expect(await trackX(page)).toBe(durante);

  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await page.waitForTimeout(800);
  expect(await trackX(page)).not.toBe(durante);
});

test("las copias no entran al orden de tabulación", async ({ page }) => {
  await openSection(page);
  const enfocables = await page.locator(`${card}[aria-hidden="true"] button, ${card}[aria-hidden="true"] video`)
    .evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex >= 0).length);
  expect(enfocables).toBe(0);
});

for (const width of [390, 1280]) {
  test(`la cinta no genera scroll horizontal a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openSection(page);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde).toBeLessThanOrEqual(0);
  });
}
