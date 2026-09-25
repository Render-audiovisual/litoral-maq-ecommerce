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

test('ofertas funciona como acceso directo a productos estrella', async ({ page }) => {
  await page.goto('/');

  const starProducts = page.locator('#productos-estrella');
  await expect(starProducts).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Ofertas' })).toHaveAttribute(
    'href',
    '/#productos-estrella',
  );

  await page.getByRole('link', { name: 'Ver ofertas', exact: true }).click();
  await expect(page).toHaveURL(/#productos-estrella$/);
  await expect(starProducts).toBeInViewport();
});
