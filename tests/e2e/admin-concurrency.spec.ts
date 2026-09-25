import { expect, test, type Page } from "@playwright/test";

// El modo local guarda todo en el localStorage de cada navegador, así que dos
// contextos no comparten datos. "La otra persona" se simula escribiendo en el
// localStorage de la misma página entre abrir el formulario y guardar.

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@litoralmaq.com");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("guardar un producto no pisa lo que otra persona cambió mientras tanto", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/productos");
  await page.getByRole("button", { name: /^Todos/ }).click();
  await page.getByRole("searchbox", { name: "Buscar productos" }).fill("3403");
  const row = page.locator(".products-table tbody tr").first();

  // Primer guardado: deja el catálogo local persistido y con versión.
  await row.getByRole("button", { name: /^Editar/ }).click();
  const form = page.locator(".product-form");
  await form.getByLabel("Límite por compra").fill("5");
  await form.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Producto guardado correctamente.")).toBeVisible();

  // Esta persona abre el formulario y cambia "destacado"...
  await row.getByRole("button", { name: /^Editar/ }).click();
  await form.getByLabel("Producto destacado").check();

  // ...mientras otra persona guarda una descripción nueva.
  await page.evaluate(() => {
    const key = "litoral-products-v1";
    const products = JSON.parse(localStorage.getItem(key) || "[]");
    const target = products.find((item: { id: string }) => item.id === "3403");
    target.description = "Texto que cargó Gonzalo";
    target.updatedAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(products));
  });

  await form.getByRole("button", { name: "Guardar producto" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Otra persona modificó este producto mientras lo editabas. Ya cargamos su versión: revisá los cambios y volvé a guardar.",
  );
  // Se ve la versión de la otra persona sin perder lo que esta escribió.
  await expect(form.getByLabel("Descripción")).toHaveValue("Texto que cargó Gonzalo");
  await expect(form.getByLabel("Producto destacado")).toBeChecked();
  const stored = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("litoral-products-v1") || "[]").find(
        (item: { id: string }) => item.id === "3403",
      ),
    );
  expect(await stored()).toMatchObject({ description: "Texto que cargó Gonzalo", featured: false });

  // Al volver a guardar quedan los dos cambios.
  await form.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Producto guardado correctamente.")).toBeVisible();
  expect(await stored()).toMatchObject({
    description: "Texto que cargó Gonzalo",
    featured: true,
    purchaseLimit: 5,
  });
});

test("cambiar el estado de un pedido que otra persona ya movió avisa y no lo pisa", async ({ page }) => {
  await loginAdmin(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "litoral-orders-v1",
      JSON.stringify([
        {
          id: "LM-CONC-1",
          customerId: "guest-concurrencia@example.com",
          customerName: "Cliente Concurrencia",
          email: "concurrencia@example.com",
          lines: [{ productId: "3403", quantity: 1 }],
          total: 10000,
          shipping: 0,
          deliveryMethod: "retiro",
          status: "pendiente",
          createdAt: new Date().toISOString(),
          statusChangedAt: new Date().toISOString(),
          paymentReference: "REF-CONC",
          paymentStatus: "pending",
        },
      ]),
    );
  });
  await page.goto("/admin/pedidos");
  const row = page.locator("tbody tr").filter({ hasText: "Cliente Concurrencia" });
  await expect(row.locator(".status-select")).toHaveValue("pendiente");

  // Otra persona lo pasa a "preparando" desde su computadora.
  await page.evaluate(() => {
    const key = "litoral-orders-v1";
    const orders = JSON.parse(localStorage.getItem(key) || "[]");
    orders[0].status = "preparando";
    localStorage.setItem(key, JSON.stringify(orders));
  });

  await row.locator(".status-select").selectOption("listo");
  await expect(
    page.getByText(/^El pedido ya cambió a «.+» \(lo movió otra persona\)\. Revisá el estado y volvé a intentar\./),
  ).toBeVisible();
  await expect(row.locator(".status-select")).toHaveValue("preparando");
  const status = await page.evaluate(
    () => JSON.parse(localStorage.getItem("litoral-orders-v1") || "[]")[0].status,
  );
  expect(status).toBe("preparando");
});
