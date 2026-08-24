import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.BASE_URL || "http://localhost:3111";
const browser = await chromium.launch({ headless: true });
const results = [];

async function run(name, test) {
  try {
    await test();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
  }
}

try {
  await run("catálogo, búsqueda, filtros y precios", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${baseURL}/productos`);
    await page.locator(".catalog-toolbar").getByText("460", { exact: true }).waitFor();
    await page.getByPlaceholder("Producto, marca o código").fill("3403");
    await page.waitForFunction(() => document.querySelectorAll(".product-card").length === 1);
    assert.equal(await page.locator(".product-card").count(), 1);
    await page.locator(".product-card").first().getByText("Cód. 3403").waitFor();
    await page.locator(".product-card").first().getByText("$ 10.000,00").waitFor();
    await page.getByPlaceholder("Producto, marca o código").fill("");
    await page.getByLabel("Categoría").selectOption("Soldadura");
    assert.ok(Number(await page.locator(".catalog-toolbar strong").textContent()) > 0);
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await page.getByText("460", { exact: true }).first().waitFor();
    assert.equal(await page.locator(".product-card").count(), 120);
    await page.getByRole("button", { name: "Mostrar más productos" }).click();
    assert.equal(await page.locator(".product-card").count(), 240);
    await context.close();
  });

  await run("carrito persistente y checkout invitado no autentica", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${baseURL}/productos`);
    await page.getByPlaceholder("Producto, marca o código").fill("3403");
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.goto(`${baseURL}/carrito`);
    await page.reload();
    await page.getByText("ALAMBRE MIG GAS LESS X 1 KG 0.8").waitFor();
    await page.locator(".quantity").getByRole("button", { name: "+" }).click();
    assert.equal(await page.locator(".quantity span").textContent(), "2");
    await page.getByRole("link", { name: "Continuar compra" }).click();
    await page.getByLabel("Nombre y apellido").fill("Cliente Prueba");
    await page.getByLabel("Email").fill("Cliente.Prueba@Example.com");
    await page.getByLabel("Teléfono").fill("3794123456");
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Confirmar retiro" }).click();
    await page.getByText("Retiro sin costo").waitFor();
    await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
    await page.getByText("Recibimos tu pedido").waitFor();
    // El checkout invitado ya no crea sesión: la pantalla de éxito ofrece
    // ingresar o registrarse, no un acceso directo a /cuenta/pedidos.
    await page.getByRole("link", { name: "Ingresar" }).waitFor();
    await page.getByRole("link", { name: "Crear cuenta" }).waitFor();
    await page.goto(`${baseURL}/cuenta/pedidos`);
    await page.waitForURL(/\/login\?next=/);
    await context.close();
  });

  await run("registro, login requiere cuenta y protección de administración", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/registro`);
    await page.getByLabel("Nombre y apellido").fill("Usuario Registro");
    await page.getByLabel("Email").fill("registro@example.com");
    await page.getByLabel("Contraseña").fill("prueba123");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await page.getByText("Hola, Usuario Registro").waitFor();

    // Login de cliente ahora requiere una cuenta demo previamente registrada.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL(`${baseURL}/`);
    await page.goto(`${baseURL}/login`);
    await page.getByLabel("Email").fill("no-existe@example.com");
    await page.getByLabel("Contraseña").fill("cualquiera");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.getByText("Email o contraseña incorrectos.").waitFor();
    assert.equal(page.url(), `${baseURL}/login`);
    await page.getByLabel("Email").fill("REGISTRO@example.com ");
    await page.getByLabel("Contraseña").fill("prueba123");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.getByText("Hola, Usuario Registro").waitFor();

    await page.goto(`${baseURL}/admin`);
    await page.waitForURL(/\/admin\/login\?next=/);
    await page.getByLabel("Email").fill("admin@litoralmaq.com");
    await page.getByLabel("Contraseña").fill("admin123");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL(`${baseURL}/admin`);
    await page.getByText("Panel de administración").waitFor();
    await context.close();
  });

  await run("CRUD, precio, stock, visibilidad y reflejo público", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${baseURL}/admin/login`);
    await page.getByLabel("Email").fill("admin@litoralmaq.com");
    await page.getByLabel("Contraseña").fill("admin123");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL(`${baseURL}/admin`);
    await page.goto(`${baseURL}/admin/productos`);
    const search = page.getByPlaceholder("Buscar por nombre o código…");
    await search.fill("3403");
    let row = page.locator("tbody tr").filter({ hasText: "3403" });
    await row.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Precio").fill("123456");
    await page.getByLabel("Stock", { exact: true }).fill("17");
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await search.fill("3403");
    row = page.locator("tbody tr").filter({ hasText: "3403" });
    await row.getByText("$ 123.456,00").waitFor();
    await row.getByText("17", { exact: true }).waitFor();
    await row.locator(".toggle").click();
    await page.goto(`${baseURL}/productos`);
    await page.getByPlaceholder("Producto, marca o código").fill("3403");
    assert.equal(await page.locator(".product-card").count(), 0);

    await page.goto(`${baseURL}/admin/productos`);
    await page.getByPlaceholder("Buscar por nombre o código…").fill("3403");
    row = page.locator("tbody tr").filter({ hasText: "3403" });
    await row.locator(".toggle").click();
    await page.goto(`${baseURL}/productos`);
    await page.getByPlaceholder("Producto, marca o código").fill("3403");
    await page.locator(".product-card").getByText("$ 123.456,00").waitFor();

    await page.goto(`${baseURL}/admin/productos`);
    await page.getByRole("button", { name: "+ Nuevo producto" }).click();
    await page.getByLabel("Nombre").fill("PRODUCTO E2E");
    await page.getByLabel("Código").fill("E2E-001");
    await page.getByLabel("Precio").fill("98765");
    await page.getByLabel("Categoría").fill("Pruebas");
    await page.getByLabel("Marca").fill("LITORAL");
    await page.getByLabel("Stock", { exact: true }).fill("9");
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await page.goto(`${baseURL}/productos`);
    await page.getByPlaceholder("Producto, marca o código").fill("E2E-001");
    await page.getByText("PRODUCTO E2E").waitFor();

    await page.goto(`${baseURL}/admin/productos`);
    await page.getByPlaceholder("Buscar por nombre o código…").fill("E2E-001");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Eliminar" }).click();
    await page.goto(`${baseURL}/productos`);
    await page.getByPlaceholder("Producto, marca o código").fill("E2E-001");
    assert.equal(await page.locator(".product-card").count(), 0);
    await context.close();
  });

  await run("cambio de estado de pedido", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/productos`);
    await page.getByPlaceholder("Producto, marca o código").fill("3400");
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.goto(`${baseURL}/checkout`);
    await page.getByLabel("Nombre y apellido").fill("Pedido Admin");
    await page.getByLabel("Email").fill("pedido.admin@example.com");
    await page.getByLabel("Teléfono").fill("3794000000");
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Confirmar retiro" }).click();
    await page.getByText("Retiro sin costo").waitFor();
    await page.getByRole("button", { name: "Enviar solicitud de compra" }).click();
    await page.getByText("Recibimos tu pedido").waitFor();
    await page.goto(`${baseURL}/admin/login`);
    await page.getByLabel("Email").fill("admin@litoralmaq.com");
    await page.getByLabel("Contraseña").fill("admin123");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL(`${baseURL}/admin`);
    await page.goto(`${baseURL}/admin/pedidos`);
    await page.locator(".status-select").first().selectOption("enviado");
    assert.equal(await page.locator(".status-select").first().inputValue(), "enviado");
    await page.reload();
    assert.equal(await page.locator(".status-select").first().inputValue(), "enviado");
    await context.close();
  });

  await run("responsive escritorio y celular sin desborde", async () => {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      for (const path of ["/", "/productos", "/carrito", "/login"]) {
        await page.goto(`${baseURL}${path}`);
        const sizes = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        assert.ok(
          sizes.scrollWidth <= sizes.clientWidth + 2,
          `${path} desborda ${sizes.scrollWidth - sizes.clientWidth}px en ${viewport.width}px`,
        );
      }
      await context.close();
    }
  });
} finally {
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
}
