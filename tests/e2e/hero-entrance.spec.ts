import { expect, test } from "@playwright/test";

// La entrada del hero es corta y sutil; con "reducir animaciones" conserva la
// composición final, pero termina prácticamente de inmediato.
for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`el hero entra por los costados en escritorio (movimiento ${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator(".commerce-hero-copy h1").waitFor();

    const info = await page.evaluate(() => {
      const copy = document.querySelector(".commerce-hero-copy h1") as HTMLElement;
      const slider = document.querySelector(".hero-promo-slider") as HTMLElement;
      return {
        copyName: getComputedStyle(copy).animationName,
        sliderName: getComputedStyle(slider).animationName,
        copyShift: getComputedStyle(copy.parentElement as HTMLElement).getPropertyValue("--hero-copy-shift").trim(),
        sliderShift: getComputedStyle(slider).getPropertyValue("--hero-carousel-shift").trim(),
        copyDuration: Number.parseFloat(getComputedStyle(copy).animationDuration),
        sliderDuration: Number.parseFloat(getComputedStyle(slider).animationDuration),
      };
    });

    expect(info.copyName).toBe("hero-copy-in");
    expect(info.sliderName).toBe("hero-carousel-in");
    expect(info.copyShift).toBe("-22px");
    expect(info.sliderShift).toBe("28px");
    if (reducedMotion === "reduce") {
      expect(info.copyDuration).toBeLessThan(.01);
      expect(info.sliderDuration).toBeLessThan(.01);
    }
  });
}

test("en celular el recorrido de entrada del hero es corto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".commerce-hero-copy h1").waitFor();
  const shift = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".commerce-hero-copy") as HTMLElement).getPropertyValue("--hero-copy-shift").trim(),
  );
  expect(shift).toBe("-22px");
});
