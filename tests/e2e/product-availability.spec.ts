import { expect, test } from "@playwright/test";

test("el catálogo muestra el stock real cargado desde el Sheet", async ({ page }) => {
  await page.goto("/productos?q=3403");
  const card = page.locator(".product-card").first();
  await expect(card).toContainText("Disponible");
  await expect(card.getByRole("button", { name: "Comprar" })).toBeEnabled();

  await card.locator(".product-card-link").click();
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
  await expect(page.getByText("604 unidades confirmadas")).toBeVisible();
  await expect(page.getByText(/Stock de demostración/i)).toHaveCount(0);
});

test("el administrador edita el stock cargado desde el Sheet", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/productos");

  await expect(page.getByText(/Fuente de verdad:/)).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).first().click();

  await expect(page.getByLabel("Precio")).toBeEditable();
  await expect(page.getByLabel("Stock", { exact: true })).toBeEnabled();
  await page.getByLabel("Stock", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Producto guardado correctamente.")).toBeVisible();
});
