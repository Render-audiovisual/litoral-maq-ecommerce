import { expect, test } from "@playwright/test";

/**
 * La compra como invitado no puede romperse nunca: es la venta.
 *
 * Estos E2E corren contra el adaptador local (ver playwright.config.ts), así
 * que verifican lo que NO depende de Supabase: que se pueda comprar sin
 * cuenta ni contraseña, que después se ofrezca crearla, y que el header no
 * muestre una cuenta que no existe. Los tramos que sí necesitan identidad
 * real —invitado anónimo que conserva su uid al convertirse, y el retorno
 * de Google— están cubiertos a nivel adaptador en
 * `src/services/auth/supabase-auth-adapter.test.ts`, y quedan pendientes de
 * una corrida contra un proyecto de staging (ver README de entrega).
 */

async function addFirstProductToCart(page: import("@playwright/test").Page) {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
}

test("se puede comprar como invitado, sin contraseña, y después se ofrece la cuenta", async ({ page }) => {
  await addFirstProductToCart(page);
  await page.goto("/checkout");

  // El checkout pide contacto, nunca una contraseña.
  await expect(page.getByLabel("Nombre y apellido")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Teléfono")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  await page.getByLabel("Nombre y apellido").fill("Invitada E2E");
  await page.getByLabel("Email").fill("invitada.e2e@example.com");
  await page.getByLabel("Teléfono").fill("3794222222");
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();

  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Creá tu cuenta para guardar y seguir este pedido" }),
  ).toBeVisible();

  // La venta ya está hecha: crear la cuenta es opcional y no bloquea nada.
  await expect(page.getByRole("link", { name: "Seguir comprando" }).first()).toBeVisible();

  // El invitado sigue siendo invitado: el header ofrece ingresar, no un
  // nombre de cuenta (ni una cadena vacía, que era el bug).
  await expect(page.getByRole("link", { name: "Ingresar", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Crear cuenta con email" }).click();
  await expect(page).toHaveURL(/\/registro\?email=invitada\.e2e%40example\.com/);
  await expect(page.getByLabel("Email")).toHaveValue("invitada.e2e@example.com");
});

test("la sesión se restaura al recargar y el logout la borra de verdad", async ({ page }) => {
  const email = `restauracion-${Date.now()}@test.com`;

  await page.goto("/registro");
  await page.getByLabel("Nombre y apellido").fill("Cliente Restaurado");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("clave-segura-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/cuenta\/pedidos$/);

  await page.reload();
  await expect(page.getByRole("heading", { name: /hola, cliente restaurado/i })).toBeVisible();

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Ingresar", exact: true })).toBeVisible();

  // Y no alcanza con volver atrás: la ruta protegida redirige al login.
  await page.goto("/cuenta/pedidos");
  await expect(page).toHaveURL(/\/login\?next=/);
});
