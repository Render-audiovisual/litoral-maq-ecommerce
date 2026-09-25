import { expect, test } from "@playwright/test";

test("un pedido pagado que no se empezó a preparar se marca como demorado", async ({ page }) => {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/checkout");
  await page.getByLabel("Nombre", { exact: true }).fill("Cliente");
  await page.getByLabel("Apellido", { exact: true }).fill("Demorado E2E");
  await page.getByLabel("Email").fill("demorado.e2e@example.com");
  await page.getByLabel("Teléfono").fill("3794000000");
  await page.getByLabel("DNI").fill("30123456");
  await page.getByText("Retiro en Sáenz 1587").click();
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
  await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();

  // El pedido pasa a pagado hace 3 días; se agrega una copia recién pagada
  // que no tiene que marcarse.
  await page.evaluate(() => {
    const key = "litoral-orders-v1";
    const orders = JSON.parse(localStorage.getItem(key) ?? "[]");
    const order = orders.find((item: { customerName: string }) => item.customerName.includes("Demorado E2E"));
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
    Object.assign(order, { status: "pendiente", paymentStatus: "approved", createdAt: threeDaysAgo, statusChangedAt: threeDaysAgo });
    const fresh = {
      ...order,
      id: `${order.id}-B`,
      customerName: "Cliente Al Día E2E",
      createdAt: new Date().toISOString(),
      statusChangedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify([fresh, ...orders]));
  });

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const attention = page.locator(".attention-card");
  await expect(attention.locator("li")).toHaveCount(1);
  await expect(attention).toContainText("Cliente Demorado E2E");
  await expect(attention).toContainText("Pagado sin preparar hace 3 días");

  await attention.getByRole("link", { name: "Ver todos los demorados" }).click();
  await expect(page).toHaveURL(/\/admin\/pedidos\?filtro=demorados$/);
  await expect(page.getByLabel("Circuito comercial")).toHaveValue("delayed");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const delayedRow = page.locator("tbody tr").filter({ hasText: "Cliente Demorado E2E" });
  await expect(delayedRow.locator(".delay-pill")).toHaveText("Demorado");
  await expect(delayedRow).toContainText("Pagado sin preparar hace 3 días");

  await page.getByLabel("Circuito comercial").selectOption("all");
  const freshRow = page.locator("tbody tr").filter({ hasText: "Cliente Al Día E2E" });
  await expect(freshRow).toBeVisible();
  await expect(freshRow.locator(".delay-pill")).toHaveCount(0);
});
