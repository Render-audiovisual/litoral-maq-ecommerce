import { test, expect } from '@playwright/test';

test('la página principal carga correctamente', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Litoral Maq/i);
  await expect(page.locator('.store-photo-actions')).toHaveCount(0);
  await expect(page.locator('.store-photo-frame img')).toBeVisible();
  await expect(page.locator('.store-photo-frame figcaption')).toHaveCount(0);
  await expect(page.locator('.hero-promo-slider')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Más vendidos', exact: true })).toBeVisible();
  const starProducts = page.locator('.store-bestsellers-track .product-card');
  await expect(starProducts).toHaveCount(4);
  for (const card of await starProducts.all()) {
    await expect(card).toContainText('Disponible');
    await expect(card).not.toContainText('Consultar disponibilidad');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
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

test('más vendidos dirige a destacados', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation').getByRole('link', { name: 'Más vendidos' })).toHaveAttribute(
    'href',
    '/#productos-estrella',
  );
  await page.getByRole('navigation').getByRole('link', { name: 'Más vendidos' }).click();
  await expect(page).toHaveURL(/#productos-estrella$/);
  await expect(page.locator('#productos-estrella')).toBeVisible();

});

test('el inicio no muestra botones bajo la foto y conserva ubicación en el pie', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.store-photo-hero a')).toHaveCount(0);
  const banner = page.getByRole('link', { name: 'Sáenz 1587, Corrientes', exact: true });
  await expect(banner).toHaveAttribute('href', 'https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8');
  await expect(banner).toHaveAttribute('target', '_blank');
});
