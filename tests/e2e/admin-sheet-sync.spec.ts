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

  const initialSummary = await page
    .getByRole("main")
    .getByText(/\d+ productos · \d+ provenientes del Google Sheet/)
    .textContent();
  const initialCount = Number(initialSummary?.match(/^(\d+) productos/)?.[1]);
  expect(initialCount).toBeGreaterThan(100);
  const synchronizedCount = initialCount + 101;

  await page.getByRole("button", { name: "Actualizar desde Sheet" }).click();
  await expect(
    page.getByText(
      `Google Sheet sincronizado: ${synchronizedCount} productos · 101 nuevos · 0 actualizados · ${initialCount} retirados.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(`${synchronizedCount} productos · ${synchronizedCount} provenientes del Google Sheet`),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByText(`${synchronizedCount} productos · ${synchronizedCount} provenientes del Google Sheet`),
  ).toBeVisible();
});
