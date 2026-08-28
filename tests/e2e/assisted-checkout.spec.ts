import { expect, test } from "@playwright/test";

test("el checkout crea una solicitud sin cobro ni envío inventado", async ({ page }) => {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Confirmá tu pedido" })).toBeVisible();
  // Con límites de palabra: sin ellos, "DEMO" pegaba dentro de "cedemos" en
  // el texto legal y el test fallaba por una palabra del todo inocente.
  await expect(page.getByText(/\bMercado Pago\b|\bpago simulado\b|\bDEMO\b/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmá la entrega para continuar" })).toBeDisabled();

  await page.getByLabel("Nombre y apellido").fill("Cliente Envío E2E");
  await page.getByLabel("Email").fill("envio.e2e@example.com");
  await page.getByLabel("Teléfono").fill("3794111111");
  await page.getByLabel("Código postal").fill("3400");
  await page.getByLabel("Localidad").fill("Corrientes");
  await page.getByLabel("Calle").fill("San Juan");
  await page.getByLabel("Número").fill("1234");
  await page.getByRole("button", { name: "Calcular opciones de envío" }).click();

  await expect(page.getByText("Cotización manual", { exact: true })).toBeVisible();
  await expect(page.getByText("A confirmar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();

  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();
  await expect(page.getByText(/Todavía no se realizó ningún cobro/)).toBeVisible();
  await expect(page.getByText(/pago.*aprobado/i)).toHaveCount(0);
  const whatsapp = page.getByRole("link", { name: "Avisar por WhatsApp" });
  await expect(whatsapp).toHaveAttribute("href", /wa\.me\/5493794215065/);
  await expect(whatsapp).toHaveAttribute("href", /LM-/);
  await expect(whatsapp).toHaveAttribute("href", /env%C3%ADo%20a%20cotizar/);
});
