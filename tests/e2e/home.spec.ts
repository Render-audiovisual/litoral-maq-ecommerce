import { test, expect } from '@playwright/test';

test('la página principal carga correctamente', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Litoral Maq/i);
  await expect(page.getByRole('link', { name: /explorar catálogo/i })).toBeVisible();
  await expect(page.locator('.star-products-grid .product-card')).toHaveCount(4);
  await expect(page.locator('.star-products-grid .product-card').first()).toContainText(/taladro/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole('link', { name: 'Consultar por WhatsApp', exact: true })).toHaveAttribute(
    'href',
    /wa\.me\/5493794215065/,
  );
});
