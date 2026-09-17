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

test('en móvil tocar una sugerencia navega aunque el input pierda el foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const search = page.getByRole('combobox', { name: 'Buscar en el catálogo' });
  await search.fill('taladro');
  const suggestion = page.getByRole('listbox', { name: 'Sugerencias' }).getByRole('link').first();
  const href = await suggestion.getAttribute('href');

  await suggestion.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7 });
  await search.evaluate((element) => (element as HTMLInputElement).blur());
  await expect(suggestion).toBeVisible();
  await suggestion.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7 });
  await suggestion.click();

  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
});

test('en móvil el toque abre la ficha aunque el teclado se cierre justo después', async ({ page }) => {
  // En el celular el teclado se cierra DESPUÉS de levantar el dedo: el blur del
  // input llega entre el pointerup y el click. Si el cartel se desmonta ahí, el
  // toque nunca alcanza al enlace y la ficha no abre. En escritorio no pasa
  // porque el blur llega antes, mientras el dedo todavía está apoyado.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Buscar en el catálogo' }).fill('amola');

  const primera = page.getByRole('listbox', { name: 'Sugerencias' }).getByRole('option').first();
  await expect(primera).toBeVisible();
  const enlace = primera.getByRole('link');
  const slug = new URL(await enlace.getAttribute('href') ?? '', 'http://x').searchParams.get('slug');

  const sigueEnPantalla = await page.evaluate(async () => {
    const link = document.querySelector('a.suggestion') as HTMLElement | null;
    if (!link) return false;
    const r = link.getBoundingClientRect();
    const opciones = {
      bubbles: true, cancelable: true, pointerType: 'touch',
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    };
    link.dispatchEvent(new PointerEvent('pointerdown', opciones));
    link.dispatchEvent(new PointerEvent('pointerup', opciones));
    document.getElementById('site-search')?.blur();
    await new Promise((resolve) => setTimeout(resolve, 60));
    return document.body.contains(link);
  });
  expect(sigueEnPantalla).toBe(true);

  await enlace.click();
  await expect(page).toHaveURL(`/producto?slug=${slug}`);
});
