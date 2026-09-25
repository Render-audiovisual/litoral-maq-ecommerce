import { expect, test } from "@playwright/test";

test("Configuración muestra la tarjeta Estado del sistema (modo local)", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/configuracion");
  await expect(page.getByRole("heading", { name: "Estado del sistema" })).toBeVisible();
  await expect(page.getByText("Disponible solo con la base real.")).toBeVisible();
});
