import { expect, test } from "@playwright/test";

test("el catálogo usa la disponibilidad del Sheet sin inventar unidades", async ({ page }) => {
  await page.goto("/productos?q=3403");
  const card = page.locator(".product-card").first();
  await expect(card).toContainText("Disponible");
  await expect(card).not.toContainText(/\d+ unidades/);
  await expect(card.getByRole("button", { name: "Agregar al carrito" })).toBeEnabled();

  await card.locator(".product-name").click();
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
  await expect(page.getByText("Stock gestionado por Litoral")).toBeVisible();
  await expect(page.getByText(/unidades confirmadas/i)).toHaveCount(0);
  await expect(page.getByText(/Stock de demostración/i)).toHaveCount(0);
});

test("el administrador confirma explícitamente el stock antes de publicarlo", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/productos");

  await expect(page.getByText(/Fuente de verdad:/)).toBeVisible();
  await expect(page.getByText("Gestionado en Sheet").first()).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).first().click();

  await expect(page.getByLabel("Stock", { exact: true })).toBeDisabled();
  await page.getByLabel("Stock verificado por el negocio").check();
  await page.getByLabel("Stock", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Producto guardado correctamente.")).toBeVisible();
});
