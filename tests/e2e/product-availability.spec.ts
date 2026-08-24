import { expect, test } from "@playwright/test";

test("el catálogo no publica stock de demostración como disponibilidad real", async ({ page }) => {
  await page.goto("/productos?q=3403");
  const card = page.locator(".product-card").first();
  await expect(card).toContainText("Consultar disponibilidad");
  await expect(card.getByRole("button", { name: "Agregar al carrito" })).toBeEnabled();

  await card.locator(".product-name").click();
  await expect(page.getByText("Consultar disponibilidad", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmamos las unidades antes de cerrar la compra")).toBeVisible();
  await expect(page.getByText(/Stock de demostración/i)).toHaveCount(0);
});

test("el administrador confirma explícitamente el stock antes de publicarlo", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.goto("/admin/productos");

  await expect(page.getByText(/Fuente de verdad:/)).toBeVisible();
  await expect(page.getByText("Por confirmar").first()).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).first().click();

  await expect(page.getByLabel("Stock", { exact: true })).toBeDisabled();
  await page.getByLabel("Stock verificado por el negocio").check();
  await page.getByLabel("Stock", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Producto guardado correctamente.")).toBeVisible();
});
