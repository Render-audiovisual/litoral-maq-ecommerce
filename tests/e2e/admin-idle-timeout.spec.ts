import { expect, test, type Page } from "@playwright/test";

const ACTIVITY_KEY = "litoral-admin-activity-v1";
const HOUR = 60 * 60 * 1000;

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function setActivity(page: Page, signedInAgo: number, lastActivityAgo: number) {
  await page.evaluate(
    ({ key, signedInAgo, lastActivityAgo }) => {
      const now = Date.now();
      localStorage.setItem(
        key,
        JSON.stringify({ signedInAt: now - signedInAgo, lastActivity: now - lastActivityAgo }),
      );
    },
    { key: ACTIVITY_KEY, signedInAgo, lastActivityAgo },
  );
}

test("después de 8 horas sin actividad el panel cierra la sesión y lo explica", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/pedidos");
  await setActivity(page, 9 * HOUR, 9 * HOUR);
  await page.reload();

  await expect(page).toHaveURL(/\/admin\/login\?idle=1&next=%2Fadmin%2Fpedidos/);
  await expect(page.getByText("Cerramos tu sesión por inactividad. Ingresá de nuevo.")).toBeVisible();
  // La sesión quedó cerrada de verdad: volver al panel pide ingresar.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("a las 24 horas del ingreso se cierra aunque haya actividad reciente", async ({ page }) => {
  await loginAdmin(page);
  await setActivity(page, 25 * HOUR, 60_000);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login\?idle=1/);
});

test("con actividad reciente el panel sigue abierto y un ingreso nuevo reinicia el reloj", async ({ page }) => {
  await loginAdmin(page);
  await setActivity(page, 2 * HOUR, 60_000);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  const activity = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), ACTIVITY_KEY);
  expect(activity.signedInAt).toBeLessThan(Date.now() - HOUR);
});
