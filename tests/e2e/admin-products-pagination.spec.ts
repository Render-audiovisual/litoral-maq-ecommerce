import { expect, test } from "@playwright/test";

test("la lista de productos del panel se pagina de a 50", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/productos");

  await page.getByRole("button", { name: /^Todos/ }).click();
  const rows = page.locator(".products-table tbody tr");
  await expect(rows).toHaveCount(50);
  await expect(page.getByText(/Mostrando 1–50 de \d+/).first()).toBeVisible();

  const pager = page.getByRole("navigation", { name: "Paginación" });
  await expect(pager.getByRole("button", { name: "Anterior" })).toBeDisabled();
  await expect(pager.getByRole("button", { name: "Página 1", exact: true })).toHaveAttribute("aria-current", "page");
  const firstOfPage1 = await rows.first().innerText();

  await pager.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText(/Mostrando 51–100 de \d+/).first()).toBeVisible();
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).not.toHaveText(firstOfPage1);
  await expect(pager.getByRole("button", { name: "Anterior" })).toBeEnabled();
  await expect(pager.getByRole("button", { name: "Página 2", exact: true })).toHaveAttribute("aria-current", "page");

  await page.getByRole("searchbox", { name: "Buscar productos" }).fill("a");
  await expect(page.getByText(/Mostrando 1–\d+ de \d+/).first()).toBeVisible();
});
