import { expect, test } from "@playwright/test";

test("el checkout crea una solicitud sin cobro ni envío inventado", async ({ page }) => {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Confirmá tu pedido" })).toBeVisible();
  await expect(page.getByText(/Mercado Pago|pago simulado|DEMO/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmá la entrega para continuar" })).toBeDisabled();

  await page.getByLabel("Nombre y apellido").fill("Cliente Envío E2E");
  await page.getByLabel("Email").fill("envio.e2e@example.com");
  await page.getByLabel("Teléfono").fill("3794111111");
  await page.getByLabel("Código postal").fill("3400");
  await page.getByLabel("Localidad").fill("Corrientes");
  await page.getByLabel("Domicilio").fill("San Juan 1234");
  await page.getByRole("button", { name: "Confirmar datos de envío" }).click();

  await expect(page.getByText("Datos listos para cotizar el envío")).toBeVisible();
  await expect(page.getByText("A cotizar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();

  await expect(page.getByText("Recibimos tu pedido")).toBeVisible();
  await expect(page.getByText(/Todavía no se realizó ningún cobro/)).toBeVisible();
  await expect(page.getByText(/pago.*aprobado/i)).toHaveCount(0);
});
