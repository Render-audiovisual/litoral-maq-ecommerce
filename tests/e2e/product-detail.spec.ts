import { expect, test } from "@playwright/test";

test("la ficha técnica siempre muestra marca, categoría y código, sin emojis de interfaz", async ({ page }) => {
  await page.goto("/producto?slug=escalera-multifuncion-4-x-4-obra-ema804-3687");
  const specs = page.getByRole("table");
  await expect(page.getByRole("heading", { name: "Ficha técnica" })).toBeVisible();
  await expect(specs.getByRole("rowheader", { name: "Marca" })).toBeVisible();
  await expect(specs.getByRole("rowheader", { name: "Categoría" })).toBeVisible();
  await expect(specs.getByRole("row", { name: /Código\s+3687/ })).toBeVisible();

  const trust = page.locator(".pdp-trust");
  await expect(trust).toContainText("Envíos a todo el país");
  await expect(trust).not.toContainText(/[🚚📍✓]/u);
  await expect(page.getByRole("button", { name: "Agregar al carrito" })).toBeEnabled();
});
