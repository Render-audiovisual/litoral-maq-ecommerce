import { expect, test } from "@playwright/test";

/**
 * Ninguno de estos casos envía un email real ni escribe en producción: el
 * servidor de pruebas corre siempre con el adaptador local (ver el guard de
 * playwright.config.ts). Lo que se verifica acá es el comportamiento de la
 * pantalla ante cada forma de llegar a ella.
 */

test("acceso directo a restablecer-clave no permite cambiar la contraseña", async ({ page }) => {
  await page.goto("/restablecer-clave");
  await expect(page.getByRole("heading", { name: "Necesitás el enlace del email" })).toBeVisible();
  // Sin enlace no hay formulario que enviar.
  await expect(page.getByLabel("Nueva contraseña")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pedir un enlace" })).toBeVisible();
});

test("una sesión común abierta tampoco habilita el cambio", async ({ page }) => {
  const email = `sesion-${Date.now()}@test.com`;
  await page.goto("/registro");
  await page.getByLabel("Nombre y apellido").fill("Cliente Sesión");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("clave-segura-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/cuenta\/pedidos$/);

  // Con la sesión activa, navegar a mano a la pantalla no debe alcanzar.
  await page.goto("/restablecer-clave");
  await expect(page.getByRole("heading", { name: "Necesitás el enlace del email" })).toBeVisible();
  await expect(page.getByLabel("Nueva contraseña")).toHaveCount(0);
});

test("con el fragmento del enlace de recuperación sí aparece el formulario", async ({ page }) => {
  await page.goto("/restablecer-clave#access_token=demo-token&expires_in=3600&type=recovery");
  await expect(page.getByRole("heading", { name: "Elegí una nueva clave" })).toBeVisible();
  await expect(page.getByLabel("Nueva contraseña")).toBeVisible();
});

test("un fragmento de otro flujo no habilita el cambio", async ({ page }) => {
  await page.goto("/restablecer-clave#access_token=demo-token&type=signup");
  await expect(page.getByRole("heading", { name: "Necesitás el enlace del email" })).toBeVisible();
});

test("las contraseñas que no coinciden se rechazan antes de llamar al backend", async ({ page }) => {
  await page.goto("/restablecer-clave#type=recovery");
  await page.getByLabel("Nueva contraseña").fill("clave-nueva-123");
  await page.getByLabel("Repetir contraseña").fill("otra-distinta-456");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
});

test("pedir el enlace no revela si el email existe y aplica cooldown visible", async ({ page }) => {
  await page.goto("/recuperar-clave");
  await page.getByLabel("Email").fill("cualquiera@test.com");
  await page.getByRole("button", { name: "Enviar enlace" }).click();

  // Mensaje condicional, idéntico exista o no la cuenta.
  await expect(page.getByText(/Si existe una cuenta con ese email/)).toBeVisible();

  // El botón queda deshabilitado con contador visible.
  const button = page.getByRole("button", { name: /Esperá \d+s/ });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(page.getByText(/Podés pedir otro enlace en \d+ segundos/)).toBeVisible();
});

test("el reenvío de confirmación aplica el mismo cooldown y no enumera", async ({ page }) => {
  await page.goto("/confirmar-cuenta");
  await page.getByLabel("Email").fill("pendiente@test.com");
  await page.getByRole("button", { name: "Reenviar confirmación" }).click();

  await expect(page.getByText(/Si la cuenta está pendiente/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Esperá \d+s/ })).toBeDisabled();
});

test("el registro no revela que un email ya está en uso", async ({ page }) => {
  const email = `repetido-${Date.now()}@test.com`;
  for (const intento of [1, 2]) {
    await page.goto("/registro");
    await page.getByLabel("Nombre y apellido").fill(`Cliente ${intento}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill("clave-segura-123");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    if (intento === 1) {
      await page.waitForURL(/\/cuenta\/pedidos$/);
      await page.getByRole("button", { name: "Cerrar sesión" }).click();
    }
  }
  // Segundo intento con el mismo email: mensaje condicional, nunca "ya existe".
  await expect(page.getByText(/Si el email .* está disponible/)).toBeVisible();
  await expect(page.getByText(/Ya existe una cuenta/)).toHaveCount(0);
});
