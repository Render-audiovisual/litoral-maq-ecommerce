import { expect, type Page, test } from "@playwright/test";

async function addProductAndOpenCheckout(page: Page) {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/checkout");
}

async function fillContact(page: Page, lastName: string, phone: string, email = "cliente.fixes@example.com") {
  await page.getByLabel("Nombre", { exact: true }).fill("Cliente");
  await page.getByLabel("Apellido", { exact: true }).fill(lastName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Teléfono").fill(phone);
  await page.getByLabel("DNI").fill("30123456");
}

async function openAdminOrder(page: Page, customer: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/pedidos");
  await page.getByLabel("Circuito comercial").selectOption("all");
  await page.locator("tbody tr").filter({ hasText: customer }).getByRole("button", { name: "Ver detalle" }).click();
  return page.locator(".order-detail-modal");
}

test("pedido a sucursal con cotización manual: no guarda la calle y dice sucursal", async ({ page }) => {
  await addProductAndOpenCheckout(page);
  await fillContact(page, "Sucursal E2E", "3794000000");
  // Primero completa el domicilio y después cambia a sucursal (el caso del bug).
  await page.getByLabel("Código postal").fill("3400");
  await page.getByLabel("Localidad").fill("Corrientes");
  await page.getByLabel("Calle").fill("San Juan");
  await page.getByLabel("Número").fill("1234");
  await page.getByText("A sucursal del correo").click();
  await page.getByRole("button", { name: "Calcular opciones de envío" }).click();
  await expect(page.getByText("Envío a coordinar", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "OCA" }).check();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();

  const href = (await page.getByRole("link", { name: "Continuar por WhatsApp" }).getAttribute("href")) ?? "";
  const text = new URL(href).searchParams.get("text") ?? "";
  expect(text).toContain("Envío a sucursal del correo por OCA · Sucursal del correo a coordinar · Corrientes · CP 3400 · Corrientes");
  expect(text).not.toContain("San Juan");
  expect(text).not.toContain("· W");
  expect(text).toContain("Quiero coordinar el pago y la entrega");
  expect(text).not.toContain("Gracias por recibir mi compra");

  const modal = await openAdminOrder(page, "Cliente Sucursal E2E");
  await expect(modal).toContainText("Envío a sucursal del correo");
  await expect(modal).toContainText("Sucursal del correo a coordinar · Corrientes · CP 3400");
  await expect(modal).not.toContainText("Envío a domicilio");
  await expect(modal).not.toContainText("San Juan");
});

test("el checkout pide un celular argentino y un email completo", async ({ page }) => {
  await addProductAndOpenCheckout(page);
  await page.getByText("Retiro en Sáenz 1587").click();
  const alert = page.locator("section.form-card").nth(1).getByRole("alert");

  await fillContact(page, "Telefono E2E", "abcdef");
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await expect(alert).toContainText("El teléfono tiene que ser un celular argentino con código de área");

  await page.getByLabel("Teléfono").fill("0379 15 4530578");
  await page.getByLabel("Email").fill("cliente@ejemplo");
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await expect(alert).toContainText("Completá nombre, apellido, email, teléfono y DNI");

  await page.getByLabel("Email").fill("cliente.telefono@example.com");
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await expect(page.locator("main").getByText(/Retiro gratis en Sáenz 1587/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();

  // El "15" después del código de área no termina en el número de WhatsApp.
  const modal = await openAdminOrder(page, "Cliente Telefono E2E");
  await expect(modal.getByRole("link", { name: "Contactar por WhatsApp" }))
    .toHaveAttribute("href", /^https:\/\/wa\.me\/5493794530578\?text=/);
});

test("cancelar a mano un pedido sin pago lo deja como vencido; entregado ya no ofrece recontacto", async ({ page }) => {
  await addProductAndOpenCheckout(page);
  await fillContact(page, "Cancelado E2E", "3794000000");
  await page.getByText("Retiro en Sáenz 1587").click();
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();

  const modal = await openAdminOrder(page, "Cliente Cancelado E2E");
  await modal.getByLabel(/Estado de .* en detalle/).selectOption("cancelado");
  await expect(page.getByText(/actualizado a Cancelado/)).toBeVisible();
  await expect(modal.getByLabel(/^Pago de /)).toHaveValue("cancelled");
  await expect(modal.getByRole("link", { name: "Contactar por WhatsApp" })).toBeVisible();

  await page.getByLabel("Circuito comercial").selectOption("expired");
  await expect(page.locator("tbody tr").filter({ hasText: "Cliente Cancelado E2E" })).toHaveCount(1);

  await modal.getByLabel(/Estado de .* en detalle/).selectOption("entregado");
  await expect(page.getByText(/actualizado a Retirado/)).toBeVisible();
  await expect(modal.getByRole("link", { name: "Contactar por WhatsApp" })).toHaveCount(0);
});
