import { test, expect } from '@playwright/test';

// La búsqueda sin acentos y por varias palabras está cubierta en
// src/lib/search.test.ts: el catálogo semilla no tiene nombres acentuados.

test('el buscador sugiere productos con la palabra a medio escribir y lleva a la ficha', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('combobox', { name: 'Buscar en el catálogo' }).fill('amola');

  const suggestions = page.getByRole('listbox', { name: 'Sugerencias' });
  await expect(suggestions).toBeVisible();

  const primera = suggestions.getByRole('option').first();
  await expect(primera).toContainText(/amolad/i);
  // Cada sugerencia trae el precio para decidir sin abrir la ficha.
  await expect(primera.locator('.suggestion-price')).toContainText('$');

  const nombre = await primera.locator('.suggestion-name').innerText();
  const slug = new URL(await primera.getByRole('link').getAttribute('href') ?? '', 'http://x')
    .searchParams.get('slug');
  await primera.click();

  await expect(page).toHaveURL(new RegExp(`/producto\\?slug=${encodeURIComponent(slug!)}`));
  await expect(page.getByRole('heading', { name: nombre, exact: true })).toBeVisible();
});

test('el enlace de ver todos coincide con lo que muestra la grilla', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('combobox', { name: 'Buscar en el catálogo' }).fill('amola');

  const verTodos = page.getByRole('link', { name: /ver los \d+ resultados/i });
  await expect(verTodos).toBeVisible();
  const total = Number(/ver los (\d+) resultados/i.exec(await verTodos.innerText())![1]);
  expect(total).toBeGreaterThan(0);

  await verTodos.click();
  await expect(page).toHaveURL(/\/productos\?q=amola/);
  await expect(page.getByText(`${total} productos encontrados`)).toBeVisible();
});

test('sin coincidencias el cartel lo dice en vez de quedar vacío', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('combobox', { name: 'Buscar en el catálogo' }).fill('zzzqqq');

  await expect(page.getByText(/no encontramos/i)).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Sugerencias' })).toHaveCount(0);
});

test('en móvil muestra cuatro opciones compactas y tolera un error de tipeo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('combobox', { name: 'Buscar en el catálogo' }).fill('raladro');

  const options = page.getByRole('listbox', { name: 'Sugerencias' }).getByRole('option');
  await expect(options).toHaveCount(4);
  await expect(options.first()).toContainText(/taladro/i);
  await expect(page.locator('.suggestion-code').first()).toBeHidden();
});
