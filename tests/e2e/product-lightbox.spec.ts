import { expect, test, type Page } from "@playwright/test";

// En el catálogo local ningún producto tiene más de 2 imágenes: con 2 alcanza
// para probar avance, retroceso y la vuelta circular.
const MULTI = "/producto?slug=aspiradora-35-l-energy-1400w-vc35-220-3544";
const SINGLE = "/producto?slug=alambre-mig-gas-less-x-1-kg-0-8-ae8-08-1-6-3403";

async function openLightbox(page: Page) {
  const trigger = page.getByRole("button", { name: "Ampliar imagen" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Vista ampliada del producto" });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

const imageTransform = (page: Page) =>
  page.locator(".lightbox-sheet img").evaluate((img) => getComputedStyle(img).transform);

test("el visor navega con flechas del teclado, da la vuelta y devuelve el foco al cerrar", async ({ page }) => {
  await page.goto(MULTI);
  const { trigger, dialog } = await openLightbox(page);
  const counter = dialog.locator(".lightbox-counter");
  await expect(counter).toHaveText("1 / 2");
  await expect(dialog.getByRole("button", { name: "Cerrar" })).toBeFocused();
  await expect(dialog.getByRole("img")).toHaveAttribute("alt", /— imagen 1$/);

  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText("2 / 2");
  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText("1 / 2");
  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText("2 / 2");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  // La galería queda en la última imagen vista.
  await expect(page.getByRole("button", { name: /Ver imagen 2 de/ })).toHaveAttribute("aria-pressed", "true");
});

test("la lupa acerca y aleja la foto, y cambiar de imagen quita el zoom", async ({ page }) => {
  await page.goto(MULTI);
  const { dialog } = await openLightbox(page);
  const zoomIn = dialog.getByRole("button", { name: "Acercar" });
  await expect(zoomIn).toHaveAttribute("aria-pressed", "false");
  expect(await imageTransform(page)).toBe("none");

  await zoomIn.click();
  const zoomOut = dialog.getByRole("button", { name: "Alejar" });
  await expect(zoomOut).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => imageTransform(page)).not.toBe("none");

  await dialog.getByRole("button", { name: "Imagen siguiente" }).click();
  await expect(dialog.getByRole("button", { name: "Acercar" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => imageTransform(page)).toBe("none");
});

test.describe("en celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("se desliza entre fotos sin scroll horizontal", async ({ page }) => {
    await page.goto(MULTI);
    const { dialog } = await openLightbox(page);
    const counter = dialog.locator(".lightbox-counter");
    await expect(counter).toHaveText("1 / 2");

    const sheet = dialog.locator(".lightbox-sheet");
    const box = await sheet.boundingBox();
    if (!box) throw new Error("sin hoja del visor");
    const y = box.y + box.height / 2;
    const touch = { pointerType: "touch", pointerId: 1, isPrimary: true, bubbles: true };
    await sheet.dispatchEvent("pointerdown", { ...touch, clientX: box.x + box.width - 40, clientY: y });
    await sheet.dispatchEvent("pointermove", { ...touch, clientX: box.x + 100, clientY: y });
    await sheet.dispatchEvent("pointerup", { ...touch, clientX: box.x + 40, clientY: y });
    await expect(counter).toHaveText("2 / 2");

    await dialog.getByRole("button", { name: "Imagen anterior" }).click();
    await expect(counter).toHaveText("1 / 2");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
  });
});

test("un producto con una sola imagen abre el visor sin flechas ni contador", async ({ page }) => {
  await page.goto(SINGLE);
  const { dialog } = await openLightbox(page);
  await expect(dialog.getByRole("img")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Imagen siguiente" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Imagen anterior" })).toHaveCount(0);
  await expect(dialog.locator(".lightbox-counter")).toBeHidden();
});
