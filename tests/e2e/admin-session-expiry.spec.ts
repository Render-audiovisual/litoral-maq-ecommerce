import { expect, test } from "@playwright/test";

test("una sesión administrativa vencida mientras la pestaña queda abierta vuelve al login", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.evaluate(() => {
    const key = "litoral-admin-session-v1";
    const session = JSON.parse(localStorage.getItem(key) || "null");
    session.expiresAt = Date.now() + 250;
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.reload();

  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/, { timeout: 5_000 });
  await expect(page.getByText("Verificando acceso al panel…")).not.toBeVisible();
});
