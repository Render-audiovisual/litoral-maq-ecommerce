import { test, expect } from '@playwright/test';

test('una cuenta puede registrarse, cerrar sesión realmente y volver a ingresar', async ({ page }) => {
  const email = `cliente-${Date.now()}@test.com`;
  const password = 'clave-segura-123';

  await page.goto('/registro');
  await page.getByLabel('Nombre y apellido').fill('Cliente de prueba');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: /hola, cliente de prueba/i })).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/cuenta/pedidos');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /hola, cliente de prueba/i })).toBeVisible();
});
