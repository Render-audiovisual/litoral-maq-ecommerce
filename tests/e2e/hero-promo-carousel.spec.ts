import { expect, type Page, test } from "@playwright/test";

// La cinta reinicia cada "juego" de tarjetas: al cruzar ese punto el riel
// vuelve a cero y una medición cruda lee un salto de miles de píxeles en vez
// del avance real. Todas las comparaciones de acá usan la distancia corta
// dentro del ciclo, que es lo que efectivamente se ve en pantalla.
async function trackOffset(page: Page) {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(".hero-promo-track");
    if (!track) throw new Error("No se encontró el riel del carrusel");
    return new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
  });
}

async function loopWidth(page: Page) {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(".hero-promo-track");
    if (!track) throw new Error("No se encontró el riel del carrusel");
    const half = track.children.length / 2;
    const first = track.children[0] as HTMLElement;
    const duplicate = track.children[half] as HTMLElement;
    return duplicate.offsetLeft - first.offsetLeft;
  });
}

function advance(from: number, to: number, loop: number) {
  let delta = (to - from) % loop;
  if (delta > loop / 2) delta -= loop;
  if (delta < -loop / 2) delta += loop;
  return delta;
}

/**
 * Recorrido acumulado durante un lapso. Muestrear seguido es lo que permite
 * medir tramos largos: una sola resta no distingue "avanzó medio ciclo hacia
 * un lado" de "avanzó medio ciclo hacia el otro".
 */
async function travel(page: Page, loop: number, ms: number) {
  let previous = await trackOffset(page);
  let total = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await page.waitForTimeout(100);
    const current = await trackOffset(page);
    total += advance(previous, current, loop);
    previous = current;
  }
  return total;
}

test("la cinta del hero corre sola, se arrastra con el mouse y conserva el envión", async ({ page }) => {
  await page.goto("/");
  const slider = page.locator(".hero-promo-slider");
  await expect(slider).toBeVisible();
  await expect(page.locator(".hero-promo-track .hero-promo-card").first()).toBeVisible();

  const loop = await loopWidth(page);
  expect(loop).toBeGreaterThan(0);

  // 1. Corre sola hacia la izquierda, sin que nadie la toque.
  const idleStart = await trackOffset(page);
  await page.waitForTimeout(600);
  expect(advance(idleStart, await trackOffset(page), loop)).toBeLessThan(-8);

  const box = await slider.boundingBox();
  if (!box) throw new Error("No se pudo medir el carrusel");
  const y = box.y + box.height * 0.5;

  // 2. Arrastrar hacia la derecha mueve la cinta hacia la derecha: es al revés
  // del automático, así que el avance medido sólo puede venir del gesto.
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  const grabbedAt = await trackOffset(page);
  for (const step of [30, 60, 100, 145, 195]) {
    await page.mouse.move(box.x + box.width * 0.25 + step, y);
  }
  const draggedTo = await trackOffset(page);
  expect(advance(grabbedAt, draggedTo, loop)).toBeGreaterThan(60);

  // 3. Al soltar conserva el envión unos instantes.
  await page.mouse.up();
  await page.waitForTimeout(140);
  expect(advance(draggedTo, await trackOffset(page), loop)).toBeGreaterThan(3);

  // 4. El envión se agota solo y vuelve al automático, que va al otro lado.
  await page.waitForTimeout(2300);
  const settled = await trackOffset(page);
  await page.waitForTimeout(450);
  expect(advance(settled, await trackOffset(page), loop)).toBeLessThan(-3);
});

test("la cinta responde igual al dedo y no se traga el scroll vertical", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const slider = page.locator(".hero-promo-slider");
  await expect(slider).toBeVisible();
  await expect(page.locator(".hero-promo-track .hero-promo-card").first()).toBeVisible();

  const loop = await loopWidth(page);
  const box = await slider.boundingBox();
  if (!box) throw new Error("No se pudo medir el carrusel táctil");
  const startX = box.x + box.width * 0.78;
  const y = box.y + box.height * 0.5;

  await slider.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: startX, clientY: y });
  await page.waitForTimeout(35);
  await slider.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", clientX: startX - 150, clientY: y });
  const releasedAt = await trackOffset(page);
  await slider.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: startX - 150, clientY: y });

  await page.waitForTimeout(350);
  const afterInertia = await trackOffset(page);
  expect(advance(releasedAt, afterInertia, loop)).toBeLessThan(-8);

  expect(await travel(page, loop, 1700)).toBeLessThan(0);

  // El gesto vertical sigue siendo de la página: la cinta no lo captura.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});
