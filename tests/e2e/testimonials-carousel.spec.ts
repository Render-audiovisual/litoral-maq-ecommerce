import { expect, type Page, test } from "@playwright/test";

const belt = ".testimonial-belt";
const track = ".testimonial-track";
const card = ".testimonial-card";

async function trackX(page: Page) {
  return page.locator(track).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
}

function scaleOf(page: Page, index: number) {
  return page.locator(card).nth(index).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
}

/** Índice y centro en pantalla de la tarjeta más cerca del centro de la cinta. */
async function centerCardIndex(page: Page) {
  return page.evaluate(({ beltSel, cardSel }) => {
    const beltBox = document.querySelector<HTMLElement>(beltSel)!.getBoundingClientRect();
    const middle = beltBox.left + beltBox.width / 2;
    return [...document.querySelectorAll<HTMLElement>(cardSel)]
      .map((el, index) => {
        const r = el.getBoundingClientRect();
        return { index, x: r.left + r.width / 2, y: r.top + r.height / 3, distance: Math.abs(r.left + r.width / 2 - middle) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
  }, { beltSel: belt, cardSel: card });
}

async function openSection(page: Page) {
  await page.goto("/");
  await page.locator(".testimonials-section").scrollIntoViewIfNeeded();
  await expect(page.locator(belt)).toBeVisible();
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

test("todas las tarjetas tienen el mismo tamaño y sin transparencias", async ({ page }) => {
  await openSection(page);
  await page.waitForTimeout(400);
  const tarjetas = await page.locator(card).evaluateAll((els) =>
    els.map((el) => ({
      width: Math.round(el.getBoundingClientRect().width),
      scale: new DOMMatrixReadOnly(getComputedStyle(el).transform).a,
      opacity: getComputedStyle(el).opacity,
      filter: getComputedStyle(el).filter,
    })),
  );
  expect(new Set(tarjetas.map((t) => t.width)).size).toBe(1);
  expect(tarjetas.every((t) => t.scale === 1 && t.opacity === "1" && t.filter === "none")).toBe(true);
});

test("con el mouse encima sigue andando, la foto crece y se puede arrastrar", async ({ page }) => {
  await openSection(page);
  // La cinta nunca está quieta: se apunta por coordenadas, no con hover().
  const { index, x, y: cardY } = await centerCardIndex(page);
  await page.mouse.move(x, cardY);
  await page.waitForTimeout(250);
  expect(await scaleOf(page, index)).toBeGreaterThan(1.05);

  const conMouse = await trackX(page);
  await page.waitForTimeout(1000);
  expect(await trackX(page)).not.toBe(conMouse);

  const box = await page.locator(belt).boundingBox();
  if (!box) throw new Error("No se pudo medir la cinta");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  const alSoltar = await trackX(page);
  await page.mouse.move(box.x + box.width / 2 - 80, y, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 - 160, y, { steps: 4 });
  expect(Math.abs((await trackX(page)) - alSoltar)).toBeGreaterThan(60);
  await page.mouse.up();
});

test.describe("en pantallas táctiles", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 900 } });

  test("tocar una foto no la agranda", async ({ page }) => {
    await openSection(page);
    const { index, x, y } = await centerCardIndex(page);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(250);
    expect(await scaleOf(page, index)).toBe(1);
  });
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
