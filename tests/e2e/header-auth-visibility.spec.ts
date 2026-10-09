import { expect, test } from "@playwright/test";

const CUSTOMER_SESSION_KEY = "litoral-customer-session-v1";

test("Mis pedidos no aparece para visitantes ni para sesiones invitadas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: /Mis pedidos/ })).toHaveCount(0);

  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        user: {
          id: "guest-header-e2e",
          name: "",
          email: "",
          role: "customer",
          isAnonymous: true,
        },
        token: "guest-token",
        expiresAt: Date.now() + 60_000,
      }),
    );
  }, CUSTOMER_SESSION_KEY);
  await page.reload();

  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: /Mis pedidos/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ingresar", exact: true })).toBeVisible();
});

test("Mis pedidos aparece al iniciar una cuenta permanente", async ({ page }) => {
  const email = `header-${Date.now()}@test.com`;

  await page.goto("/registro");
  await page.getByLabel("Nombre y apellido").fill("Cliente Header");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("clave-segura-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/cuenta\/pedidos$/);

  const ordersLink = page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: /Mis pedidos/ });
  await expect(ordersLink).toBeVisible();
  await expect(ordersLink).toHaveAttribute("href", "/cuenta/pedidos");
  await expect(ordersLink).toHaveAttribute("aria-current", "page");
});
