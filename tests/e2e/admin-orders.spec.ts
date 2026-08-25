import { expect, test } from "@playwright/test";

test("un pedido conserva sus productos y se gestiona desde el panel", async ({ page }) => {
  await page.goto("/productos?q=3400");
  const card = page.locator(".product-card").first();
  const productName = (await card.locator(".product-name").innerText()).trim();
  await card.getByRole("button", { name: "Agregar al carrito" }).click();

  await page.goto("/checkout");
  await page.getByLabel("Nombre y apellido").fill("Cliente Pedido E2E");
  await page.getByLabel("Email").fill("pedido.e2e@example.com");
  await page.getByLabel("Teléfono").fill("3794000000");
  await page.getByText("Retiro en sucursal").click();
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await expect(page.getByText(/Retiro gratis en Sáenz 1587/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
  // getByText coincide también con el anunciador de rutas de Next
  // (#__next-route-announcer__), que repite el título de la página. El rol
  // explícito apunta solo al encabezado real.
  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/pedidos");

  const row = page.locator("tbody tr").filter({ hasText: "Cliente Pedido E2E" });
  await expect(page).toHaveTitle(/^\(1\) Pedidos pendientes/);
  await expect(page.getByLabel("1 pedidos pendientes")).toBeVisible();
  await expect(page.locator('.admin-sidebar a[href="/admin/pedidos"] .nav-notification-badge')).toHaveText("1");
  await expect(row).toContainText("1 unidades");
  await expect(row.locator(".status-select")).toHaveValue("pendiente");
  await expect(row).toContainText("Entrega Gratis");
  await row.getByRole("button", { name: "Ver detalle" }).click();
  const modal = page.locator(".order-detail-modal");
  await expect(modal).toContainText(productName);
  await expect(modal).toContainText("Cód. 3400");
  await expect(modal).toContainText("3794000000");
  await expect(modal).toContainText("Pago a coordinar");

  await modal.getByLabel(/Estado de .* en detalle/).selectOption("preparando");
  await expect(page.getByText(/actualizado a Preparando/)).toBeVisible();
  await expect(page.getByLabel("0 pedidos pendientes")).toBeVisible();
  await page.reload();
  await expect(page.locator("tbody tr").filter({ hasText: "Cliente Pedido E2E" }).locator(".status-select")).toHaveValue("preparando");
});
