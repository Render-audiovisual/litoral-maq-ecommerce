import { expect, test } from "@playwright/test";

test("el inicio lleva de las categorías más vendidas al catálogo filtrado", async ({ page }) => {
  await page.goto("/");

  const categoriesSection = page.locator("#categorias-mas-vendidas");
  await expect(categoriesSection.getByRole("heading", { name: "Novedades que más salen" })).toBeVisible();
  await expect(categoriesSection.locator(".winner-card")).toHaveCount(6);
  await expect(categoriesSection).toContainText("Taladros");
  await expect(categoriesSection).toContainText("Desde $ 35.000");

  await expect(page.getByRole("heading", { name: "Más opciones para equiparte" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Comprá por categoría" })).toHaveCount(0);

  await Promise.all([
    page.waitForURL(/\/productos\?familia=taladros$/, { timeout: 20_000 }),
    categoriesSection.locator('a[href="/productos?familia=taladros"]').click(),
  ]);
  await expect(page.getByLabel("Categoría")).toHaveValue("taladros");
  await expect(page.getByLabel("Marca")).toBeVisible();
  await expect(page.getByLabel("Precio mínimo")).toBeVisible();
  await expect(page.getByLabel("Precio máximo")).toBeVisible();
  await expect(page.locator(".catalog-toolbar")).toContainText("5 productos encontrados");
});
