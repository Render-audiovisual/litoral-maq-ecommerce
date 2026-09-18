import { expect, test } from "@playwright/test";

// Testimonios dejó de ser un marquee de scroll: ahora es el carrusel de
// escala, con su propia prueba en testimonials-carousel.spec.ts.
for (const carousel of [
  { name: "categorías", selector: ".category-marquee", card: ".winner-card" },
]) {
  test(`el carrusel móvil de ${carousel.name} avanza aunque el navegador redondee scrollLeft`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const rail = page.locator(carousel.selector);
    await expect(rail).toBeVisible();
    await rail.scrollIntoViewIfNeeded();

    // Reproduce el comportamiento de navegadores móviles que exponen
    // scrollLeft únicamente como entero. Sin una posición decimal interna,
    // el avance automático menor a 1 px por frame se pierde por completo.
    await rail.evaluate((element) => {
      let roundedScrollLeft = 0;
      Object.defineProperty(element, "scrollLeft", {
        configurable: true,
        get: () => roundedScrollLeft,
        set: (value: number) => { roundedScrollLeft = Math.trunc(value); },
      });
    });

    const start = await rail.evaluate((element) => element.scrollLeft);
    await page.waitForTimeout(500);
    expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(start + 8);
  });

  test(`el carrusel de ${carousel.name} se arrastra con el mouse y conserva el envión`, async ({ page }) => {
    await page.goto("/");
    const rail = page.locator(carousel.selector);
    await expect(rail).toBeVisible();
    await rail.scrollIntoViewIfNeeded();
    await rail.evaluate((element) => {
      element.scrollLeft = element.scrollWidth / 4;
    });

    const box = await rail.boundingBox();
    if (!box) throw new Error(`No se pudo medir el carrusel de ${carousel.name}`);
    const scrollLeft = async () => rail.evaluate((element) => element.scrollLeft);
    const loopWidth = await rail.evaluate((element) => element.scrollWidth / 2);
    const circularDelta = (from: number, to: number) => {
      let delta = to - from;
      if (delta > loopWidth / 2) delta -= loopWidth;
      if (delta < -loopWidth / 2) delta += loopWidth;
      return delta;
    };

    const y = box.y + Math.min(box.height * 0.5, 160);
    // Arrastre hacia la derecha: es la dirección contraria a la del
    // automático, así que cualquier avance negativo sólo puede venir del gesto.
    await page.mouse.move(box.x + box.width * 0.25, y);
    await page.mouse.down();
    const grabbedAt = await scrollLeft();
    for (const step of [40, 80, 120, 170, 220]) {
      await page.mouse.move(box.x + box.width * 0.25 + step, y);
    }
    const draggedTo = await scrollLeft();
    expect(circularDelta(grabbedAt, draggedTo)).toBeLessThan(-150);

    await page.mouse.up();
    await page.waitForTimeout(120);
    expect(circularDelta(draggedTo, await scrollLeft())).toBeLessThan(-10);

    // El envión se agota y vuelve solo al automático, que va al otro lado.
    // Un envión al tope tarda ~3 s en revertirse: esperamos con margen.
    await page.waitForTimeout(3200);
    const settled = await scrollLeft();
    await page.waitForTimeout(400);
    expect(circularDelta(settled, await scrollLeft())).toBeGreaterThan(5);
  });

  test(`el carrusel táctil de ${carousel.name} deja el gesto horizontal al navegador`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const rail = page.locator(carousel.selector);
    await expect(rail).toBeVisible();
    await rail.scrollIntoViewIfNeeded();

    const touchAction = await rail.evaluate((element) => getComputedStyle(element).touchAction);
    expect(touchAction).toContain("pan-x");

    await rail.evaluate((element) => { element.scrollLeft = 80; });
    const beforeGesture = await rail.evaluate((element) => element.scrollLeft);

    await rail.dispatchEvent("pointerdown", {
      pointerId: 9,
      pointerType: "touch",
      clientX: 300,
      clientY: 300,
    });
    await page.waitForTimeout(30);
    await rail.dispatchEvent("pointermove", {
      pointerId: 9,
      pointerType: "touch",
      clientX: 180,
      clientY: 300,
    });
    // Los eventos sintéticos no generan scroll nativo. Si el hook intentara
    // capturar el dedo y mover el riel manualmente, scrollLeft cambiaría acá.
    const afterSyntheticGesture = await rail.evaluate((element) => element.scrollLeft);
    expect(Math.abs(afterSyntheticGesture - beforeGesture)).toBeLessThan(4);
    await rail.dispatchEvent("pointerup", {
      pointerId: 9,
      pointerType: "touch",
      clientX: 180,
      clientY: 300,
    });

    // Al terminar el gesto, el movimiento automático retoma desde la
    // posición que haya dejado el scroll nativo del navegador.
    await page.waitForTimeout(500);
    expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforeGesture + 8);
  });
}
