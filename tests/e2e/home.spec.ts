import { test, expect } from '@playwright/test';

test('la página principal carga correctamente', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Litoral Maq/i);
  await expect(page.getByRole('link', { name: /ver productos/i })).toBeVisible();
});
