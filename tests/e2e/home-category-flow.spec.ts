import { expect, test } from "@playwright/test";

test("el inicio lleva de las categorías más vendidas al catálogo filtrado", async ({ page }) => {
  await page.goto("/");

  const categoriesSection = page.locator("#categorias-mas-vendidas");
  await expect(categoriesSection.getByRole("heading", { name: "Encontrá la máquina que necesitás" })).toBeVisible();
  await expect(categoriesSection.locator(".winner-card")).toHaveCount(14);
  await expect(categoriesSection).toContainText("Taladros");
  await expect(categoriesSection).toContainText(/Desde \$\s*[\d.]+/);
  await expect(categoriesSection).not.toContainText("0 PRODUCTOS");
  await expect(categoriesSection).not.toContainText("Consultar");

  await expect(page.getByRole("heading", { name: "Más opciones para equiparte" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Comprá por categoría" })).toHaveCount(0);

  const taladrosLink = categoriesSection.locator('a[href="/productos?familia=taladros"]').first();
  await categoriesSection.locator(".category-marquee").dispatchEvent("mouseover");
  await Promise.all([
    page.waitForURL(/\/productos\?familia=taladros$/, { timeout: 20_000 }),
    taladrosLink.click(),
  ]);
  await expect(page.getByLabel("Categoría")).toHaveValue("taladros");
  await expect(page.getByLabel("Marca")).toBeVisible();
  await expect(page.getByLabel("Precio mínimo")).toBeVisible();
  await expect(page.getByLabel("Precio máximo")).toBeVisible();
  await expect(page.locator(".catalog-toolbar")).toContainText(/\d+ productos encontrados/);
  expect(await page.locator(".product-card").count()).toBeGreaterThan(5);
});
