import { test, expect } from '@playwright/test';

test('el catálogo móvil es compacto, filtrable y carga de a 24 productos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/productos');

  const cards = page.locator('.catalog-grid .product-card');
  await expect(cards).toHaveCount(24);
  await expect(page.getByLabel('Buscar')).toBeVisible();
  await expect(page.getByLabel('Categoría')).toBeVisible();

  await page.getByLabel('Buscar').fill('amoladora');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(24);

  await page.getByLabel('Buscar').fill('');
  await page.getByRole('button', { name: 'Mostrar más productos' }).click();
  await expect(cards).toHaveCount(48);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
