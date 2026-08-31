import { expect, test } from "@playwright/test";

/**
 * E2E reales contra un Supabase de staging (ver docs/staging-supabase.md).
 *
 * Solo corren cuando hay un backend declarado: sin `E2E_SUPABASE_URL`,
 * playwright.config.ts levanta la app en modo local (localStorage) y estas
 * pruebas no verificarían nada del camino real — RLS, triggers, unicidad.
 * El resto de la suite sí corre en modo local y no depende de este archivo.
 *
 * Datos: todo lo que se crea acá lleva el prefijo `E2E-` (productos) o el
 * dominio `@e2e.litoralmaq.test` (pedidos), que es exactamente lo que borra
 * `supabase/staging/seed.sql`. Cada corrida usa además un sufijo propio, así
 * que dos corridas seguidas no chocan entre sí ni pisan datos ajenos.
 */
const stagingConfigured = Boolean(process.env.E2E_SUPABASE_URL);

test.describe("@staging", () => {
  test.skip(!stagingConfigured, "Requiere E2E_SUPABASE_URL (ver docs/staging-supabase.md).");
  // Contra Supabase cada paso es una ida y vuelta de red real, y `next dev`
  // compila cada ruta la primera vez que se visita. Los 30s por defecto se
  // quedan cortos en la primera corrida sobre un stack recién levantado.
  test.describe.configure({ timeout: 120_000 });
  const CROSS_ROUTE = { timeout: 45_000 };

  const runId = `${Date.now()}`;

  async function loginAdmin(page: import("@playwright/test").Page) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("admin@litoralmaq.com");
    await page.getByLabel("Contraseña").fill("admin123");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/, CROSS_ROUTE);
  }

  test("un pedido se crea, se ve en el panel, cambia de estado y persiste tras recargar", async ({ page }) => {
    const customerName = `Cliente Staging ${runId}`;

    await page.goto("/productos?q=Motosierra");
    const card = page.locator(".product-card").first();
    await expect(card).toContainText("Motosierra de prueba E2E");
    await card.getByRole("button", { name: "Agregar al carrito" }).click();

    await page.goto("/checkout");
    await page.getByLabel("Nombre y apellido").fill(customerName);
    await page.getByLabel("Email").fill(`pedido.${runId}@e2e.litoralmaq.test`);
    await page.getByLabel("Teléfono").fill("3794000000");
    await page.getByText("Retiro en Sáenz 1587").click();
    await page.getByRole("button", { name: "Confirmar retiro" }).click();
    await expect(page.getByText(/Retiro gratis en Sáenz 1587/)).toBeVisible();
    await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
    await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible(CROSS_ROUTE);

    await loginAdmin(page);
    await page.goto("/admin/pedidos");

    const row = page.locator("tbody tr").filter({ hasText: customerName });
    await expect(row).toHaveCount(1, CROSS_ROUTE);
    await expect(row).toContainText("1 unidades");
    const statusSelect = row.locator(".status-select");
    await expect(statusSelect).toHaveValue("pendiente");

    await statusSelect.selectOption("preparando");
    await expect(page.getByText(/actualizado a Preparando/)).toBeVisible();

    // La persistencia es el punto de la prueba: recargar vuelve a leer de
    // Supabase, no del estado en memoria del cliente.
    await page.reload();
    const reloadedRow = page.locator("tbody tr").filter({ hasText: customerName });
    await expect(reloadedRow.locator(".status-select")).toHaveValue("preparando");
  });

  test("el panel crea, edita y elimina un producto, y muestra los errores del backend", async ({ page }) => {
    const code = `E2E-CRUD-${runId}`;
    const name = `Producto CRUD ${runId}`;
    await loginAdmin(page);
    await page.goto("/admin/productos");

    const modal = page.locator("form.modal");

    // 1. Error de validación del formulario: nada llega al backend.
    await page.getByRole("button", { name: "+ Nuevo producto" }).click();
    await modal.getByRole("button", { name: "Guardar producto" }).click();
    await expect(modal.locator(".error-message")).toContainText(
      "Completá nombre, código y un precio válido.",
    );

    // 2. Error del backend: el código es único en la base (índice
    //    products_code_key). Reusar el del producto sembrado tiene que
    //    terminar en un error visible y en que NO se guarde nada — el modo
    //    local no puede fallar así, esto solo se prueba contra Supabase.
    //
    //    Nota: el panel muestra su texto genérico, no el del motor. Los
    //    errores de PostgREST no son instancias de `Error`, así que el
    //    `error instanceof Error ? error.message : ...` de la pantalla cae
    //    siempre al fallback. Está documentado como riesgo pendiente en
    //    docs/staging-supabase.md; acá se verifica lo que sí es
    //    contractual: hay error a la vista y el alta no ocurrió.
    await modal.getByLabel("Nombre").fill(name);
    await modal.getByLabel("Código").fill("E2E-0001");
    await modal.getByLabel("Precio").fill("12345");
    await modal.getByRole("button", { name: "Guardar producto" }).click();
    await expect(modal.locator(".error-message")).toContainText("No se pudo guardar el producto.");

    // 3. Alta correcta, con el código libre.
    await modal.getByLabel("Código").fill(code);
    await modal.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page.locator(".success-message")).toContainText("Producto guardado correctamente.");

    // El intento fallido del paso 2 no dejó rastro: un solo producto con ese
    // nombre, el que se acaba de crear con el código válido.
    await page.getByPlaceholder("Buscar por nombre o código…").fill(name);
    await expect(page.locator("tbody tr").filter({ hasText: name })).toHaveCount(1);

    await page.getByPlaceholder("Buscar por nombre o código…").fill(code);
    const row = page.locator("tbody tr").filter({ hasText: code });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(name);

    // 4. Edición + persistencia real.
    const editedName = `${name} editado`;
    await row.getByRole("button", { name: "Editar" }).click();
    await modal.getByLabel("Nombre").fill(editedName);
    await modal.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page.locator(".success-message")).toContainText("Producto guardado correctamente.");

    await page.reload();
    await page.getByPlaceholder("Buscar por nombre o código…").fill(code);
    await expect(page.locator("tbody tr").filter({ hasText: code })).toContainText(editedName);

    // 5. Baja + persistencia real. Esto es también la limpieza de la prueba:
    //    lo que crea, lo borra.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("tbody tr").filter({ hasText: code }).getByRole("button", { name: "Eliminar" }).click();
    await expect(page.locator(".success-message")).toContainText("Producto eliminado correctamente.");

    await page.reload();
    await page.getByPlaceholder("Buscar por nombre o código…").fill(code);
    await expect(page.locator("tbody tr").filter({ hasText: code })).toHaveCount(0);
  });
});
