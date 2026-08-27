import { expect, test } from "@playwright/test";

test("el administrador sincroniza y persiste el catálogo del Google Sheet", async ({ page }) => {
  const rows = ["codigo,articulo,preciocon"];
  for (let index = 1; index <= 101; index += 1) {
    rows.push(`SYNC-${index},Producto sincronizado ${index},${index}000`);
  }
  await page.route("https://docs.google.com/spreadsheets/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/csv; charset=utf-8",
      body: rows.join("\n"),
    });
  });

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/productos");

  await page.getByRole("button", { name: "Actualizar desde Sheet" }).click();
  await expect(page.getByText(/Google Sheet sincronizado: 596 productos · 101 nuevos · 0 actualizados · 495 retirados/)).toBeVisible();
  await expect(page.getByText(/596 productos · 596 provenientes del Google Sheet/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/596 productos · 596 provenientes del Google Sheet/)).toBeVisible();
});
