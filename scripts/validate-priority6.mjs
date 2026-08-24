import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const storeUrl = (process.env.PRIORITY6_STORE_URL || "https://litoralmaqrender.rendercorrientes.com").replace(/\/$/, "");
const adminUrl = (process.env.PRIORITY6_ADMIN_URL || "https://admin-litoralmaqrender.rendercorrientes.com").replace(/\/$/, "");
const adminEmail = process.env.PRIORITY6_ADMIN_EMAIL?.trim();
const adminPassword = process.env.PRIORITY6_ADMIN_PASSWORD;
const customersOnly = process.argv.includes("--customers-only");
const runId = Date.now();

async function createCustomerOrder(browser, suffix, query, index) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const name = `[PRUEBA P6] Cliente ${suffix}`;
  const email = `litoral-priority6-${runId}-${suffix.toLowerCase()}@example.com`;

  await page.goto(`${storeUrl}/productos?q=${query}`, { waitUntil: "domcontentloaded" });
  const card = page.locator(".product-card").nth(index);
  await card.waitFor();
  const productName = (await card.locator(".product-name").innerText()).trim();
  await card.getByRole("button", { name: "Agregar al carrito" }).click();

  await page.goto(`${storeUrl}/checkout`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Nombre y apellido").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Teléfono").fill(`379400000${suffix === "A" ? "1" : "2"}`);
  await page.getByText("Retiro en sucursal").click();
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await page.getByText(/Retiro gratis en Sáenz 1587/).waitFor();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
  await page.waitForURL(/\/checkout\/exito\?pedido=LM-/);

  const orderId = new URL(page.url()).searchParams.get("pedido");
  assert(orderId, `El cliente ${suffix} no recibió número de pedido.`);
  await page.goto(`${storeUrl}/cuenta/pedidos`, { waitUntil: "domcontentloaded" });
  await page.getByText(orderId, { exact: true }).waitFor();

  return { context, page, name, email, orderId, productName };
}

async function assertCustomerIsolation(customer, forbiddenOrderId) {
  await customer.page.reload({ waitUntil: "domcontentloaded" });
  await customer.page.getByText(customer.orderId, { exact: true }).waitFor();
  assert.equal(
    await customer.page.getByText(forbiddenOrderId, { exact: true }).count(),
    0,
    `${customer.name} pudo ver el pedido ${forbiddenOrderId} de otra identidad.`,
  );
}

async function validateAdmin(browser, customers) {
  assert(adminEmail && adminPassword, "Faltan PRIORITY6_ADMIN_EMAIL y PRIORITY6_ADMIN_PASSWORD para validar al administrador.");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${adminUrl}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Contraseña").fill(adminPassword);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(`${adminUrl}/admin`);
  await page.goto(`${adminUrl}/admin/pedidos`, { waitUntil: "domcontentloaded" });

  for (const customer of customers) {
    const row = page.locator("tbody tr").filter({ hasText: customer.orderId });
    await row.waitFor();
    await row.getByRole("button", { name: "Ver detalle" }).click();
    const modal = page.locator(".order-detail-modal");
    await modal.getByText(customer.productName, { exact: false }).waitFor();
    await modal.getByRole("button", { name: "Cerrar" }).click();
  }

  const firstRow = page.locator("tbody tr").filter({ hasText: customers[0].orderId });
  await firstRow.locator(".status-select").selectOption("preparando");
  await page.getByText(/actualizado a Preparando/).waitFor();

  await customers[0].page.reload({ waitUntil: "domcontentloaded" });
  const firstOrder = customers[0].page.locator(".order-card").filter({ hasText: customers[0].orderId });
  await firstOrder.getByText("Preparando", { exact: true }).waitFor();
  await context.close();
}

const browser = await chromium.launch({ headless: true });
const customers = [];

try {
  customers.push(await createCustomerOrder(browser, "A", "3403", 0));
  customers.push(await createCustomerOrder(browser, "B", "3400", 0));
  await assertCustomerIsolation(customers[0], customers[1].orderId);
  await assertCustomerIsolation(customers[1], customers[0].orderId);

  if (!customersOnly) await validateAdmin(browser, customers);

  console.log(JSON.stringify({
    ok: true,
    mode: customersOnly ? "customers-only" : "complete",
    storeUrl,
    adminUrl: customersOnly ? null : adminUrl,
    orders: customers.map(({ name, orderId, productName }) => ({ name, orderId, productName })),
    checks: customersOnly
      ? ["dos identidades anónimas", "dos pedidos persistidos", "carritos separados", "aislamiento bilateral por RLS"]
      : ["dos identidades anónimas", "dos pedidos persistidos", "carritos separados", "aislamiento bilateral por RLS", "visibilidad administrativa", "cambio de estado", "actualización del cliente"],
  }, null, 2));
} finally {
  await Promise.all(customers.map((customer) => customer.context.close()));
  await browser.close();
}
