import { expect, type Page, test } from "@playwright/test";

const stage = ".testimonial-stage";
const card = ".testimonial-card";

async function widths(page: Page) {
  return page.evaluate(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)]
      .map((el) => Math.round(el.getBoundingClientRect().width))
      .sort((a, b) => b - a),
    card,
  );
}

/** Posición de la tarjeta central dentro de la lista. Sin flechas ni contador,
 *  esta es la forma de saber si el carrusel se movió. */
async function activeIndex(page: Page) {
  return page.evaluate(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)].findIndex((el) => el.classList.contains("is-active")),
    card,
  );
}

async function openSection(page: Page) {
  await page.goto("/");
  await expect(page.locator(stage)).toBeVisible();
  await page.locator(".testimonials-section").scrollIntoViewIfNeeded();
  await expect(page.locator(`${card}.is-active`)).toBeVisible();
}

test("una tarjeta manda y el resto se escalona hacia los costados", async ({ page }) => {
  await openSection(page);
  await page.waitForTimeout(600);

  // Las laterales vienen de a pares (una a cada lado), así que se comparan
  // los tamaños distintos, no la lista cruda.
  const escalones = [...new Set(await widths(page))];
  // La central manda, pero las vecinas siguen siendo grandes y legibles:
  // el material es vertical y de poco se vuelve ilegible.
  expect(escalones[0] / escalones[1]).toBeGreaterThan(1.25);
  expect(escalones[0] / escalones[1]).toBeLessThan(1.8);
  // Y de ahí hacia afuera bajan de a poco, sin un corte brusco.
  expect(escalones[1] / escalones[2]).toBeGreaterThan(1.08);
  expect(escalones[1] / escalones[2]).toBeLessThan(1.35);

  // Todas comparten el eje vertical: es una cinta, no una escalera.
  const ejes = await page.evaluate(
    (sel) => new Set([...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.y + r.height / 2);
    })).size,
    card,
  );
  expect(ejes).toBe(1);
});

test("todas las tarjetas se ven nítidas, sin desenfoque ni transparencia", async ({ page }) => {
  await openSection(page);
  const efectos = await page.evaluate(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
      const s = getComputedStyle(el);
      return { opacity: s.opacity, filter: s.filter };
    }),
    card,
  );
  expect(efectos.every((e) => e.opacity === "1")).toBe(true);
  expect(efectos.every((e) => e.filter === "none")).toBe(true);
});

test("avanza sola, frena con el puntero encima y se puede arrastrar", async ({ page }) => {
  await openSection(page);

  const inicial = await activeIndex(page);
  await page.waitForTimeout(5200);
  expect(await activeIndex(page)).not.toBe(inicial);

  // Con el mouse encima queda quieta para poder mirar el testimonio.
  await page.locator(stage).hover();
  const quieta = await activeIndex(page);
  await page.waitForTimeout(5200);
  expect(await activeIndex(page)).toBe(quieta);

  // El arrastre reparte el protagonismo entre dos tarjetas y al soltar
  // vuelve a haber una sola central.
  const box = await page.locator(stage).boundingBox();
  if (!box) throw new Error("No se pudo medir el carrusel");
  const y = box.y + box.height / 2;
  // Medio paso: el objetivo es quedar entre dos tarjetas. Se calcula desde el
  // ancho real de la central para que valga en cualquier pantalla.
  const medioPaso = Math.round((await widths(page))[0] * 0.45);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - medioPaso * 0.5, y);
  await page.mouse.move(box.x + box.width / 2 - medioPaso, y);
  const durante = await widths(page);
  expect(durante[0] / durante[1]).toBeLessThan(1.2);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const final = await widths(page);
  expect(final[0] / final[1]).toBeGreaterThan(1.25);
  expect(await activeIndex(page)).not.toBe(quieta);
});

test("tocar una tarjeta lateral la trae al centro", async ({ page }) => {
  await openSection(page);
  await page.locator(stage).hover(); // frena el automático para que la prueba sea estable
  const antes = await activeIndex(page);

  await page.locator(".testimonial-reach").first().click({ force: true });
  await page.waitForTimeout(900);
  expect(await activeIndex(page)).not.toBe(antes);
});

test("el video se mira en la tarjeta central, con controles y sin que el carrusel siga girando", async ({ page }) => {
  await openSection(page);

  // Centrar la primera tarjeta de video.
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".testimonial-card")];
    const conVideo = cards.find((c) => c.querySelector("video"));
    conVideo?.querySelector<HTMLButtonElement>("button")?.click();
  });
  await page.waitForTimeout(1000);

  const activo = page.locator(`${card}.is-active video`);
  await expect(activo).toBeVisible();
  // Con controles y de un tamaño que se pueda mirar de verdad.
  expect(await activo.evaluate((v: HTMLVideoElement) => v.controls)).toBe(true);
  const caja = await activo.boundingBox();
  expect(caja?.width ?? 0).toBeGreaterThan(180);

  const reproduciendo = await activo.evaluate(async (v: HTMLVideoElement) => {
    try { await v.play(); } catch { return false; }
    await new Promise((res) => setTimeout(res, 600));
    return !v.paused && v.currentTime > 0;
  });
  expect(reproduciendo).toBe(true);

  // Mientras se reproduce, el carrusel no se mueve solo.
  const durante = await activeIndex(page);
  await page.waitForTimeout(5200);
  expect(await activeIndex(page)).toBe(durante);
});

test("las laterales no tienen controles de video ni roban el foco", async ({ page }) => {
  await openSection(page);
  const inactivos = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".testimonial-card:not(.is-active) video")]
      .map((v) => (v as HTMLVideoElement).controls),
  );
  expect(inactivos.every((c) => c === false)).toBe(true);
});
