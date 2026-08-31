import { expect, test } from "@playwright/test";

test("el administrador sincroniza por el backend sin conectar el navegador a Google", async ({ page }) => {
  let googleWasCalled = false;
  await page.route("https://docs.google.com/**", async (route) => {
    googleWasCalled = true;
    await route.abort();
  });
  await page.route("**/api/admin/sync-products", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toMatch(/^Bearer demo-admin-/);
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        total: 508,
        created: 2,
        updated: 4,
        unchanged: 502,
        removed: 1,
        source: "Google Sheet · Lista de precios - LitoralMaq",
        lastSyncedAt: "2026-08-31T14:00:00.000Z",
        warnings: [],
      }),
    });
  });

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/productos");

  await page.getByRole("button", { name: "Actualizar desde Sheet" }).click();
  await expect(
    page.getByText(
      /Google Sheet sincronizado: 508 productos · 2 nuevos · 4 actualizados · 502 sin cambios · 1 retirados\./,
    ),
  ).toBeVisible();
  expect(googleWasCalled).toBe(false);
});
