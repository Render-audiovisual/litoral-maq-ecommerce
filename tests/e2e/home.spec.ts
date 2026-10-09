import { test, expect } from '@playwright/test';

test('la página principal carga correctamente', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Litoral Maq/i);
  await expect(page.getByRole('link', { name: /explorar catálogo/i })).toBeVisible();
  const starProducts = page.locator('.star-products-grid .product-card');
  await expect(starProducts).toHaveCount(4);
  for (const card of await starProducts.all()) {
    await expect(card).toContainText('Disponible');
    await expect(card).not.toContainText('Consultar disponibilidad');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole('link', { name: 'Consultar por WhatsApp', exact: true })).toHaveAttribute(
    'href',
    /wa\.me\/5493794215065/,
  );
});

test('la franja superior se mueve aun cuando el navegador reduce animaciones', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const message = page.locator('.announcement > span').first();
  await expect(message).toBeVisible();

  const start = await message.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(700);
  const end = await message.evaluate((element) => getComputedStyle(element).transform);

  expect(start).not.toBe(end);
});

test('más vendidos dirige a destacados y ofertas mantiene el catálogo filtrado', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation').getByRole('link', { name: 'Más vendidos' })).toHaveAttribute(
    'href',
    '/#productos-estrella',
  );
  await page.getByRole('navigation').getByRole('link', { name: 'Más vendidos' }).click();
  await expect(page).toHaveURL(/#productos-estrella$/);
  await expect(page.locator('#productos-estrella')).toBeVisible();

  await page.locator('.hero-offers-link').click();
  await expect(page).toHaveURL(/\/productos\?categoria=Ofertas$/);
  await expect(page.getByRole('searchbox', { name: 'Buscar productos' })).toBeVisible();
  await expect(page.locator('.catalog-grid .product-card').first()).toBeVisible();
});

test('el cartel de retiro gratis lleva a la ficha del local en Google Maps', async ({ page }) => {
  await page.goto('/');
  const banner = page.locator('.commerce-hero').getByRole('link', { name: /Cómo llegar/ });
  await expect(banner).toHaveAttribute('href', 'https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8');
  await expect(banner).toHaveAttribute('target', '_blank');
  await expect(banner).toContainText('RETIRO GRATIS');
});
