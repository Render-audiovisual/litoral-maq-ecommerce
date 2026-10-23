/**
 * Auditoría de solo lectura de los sitios publicados.
 *
 * NO envía formularios, NO crea pedidos, NO inicia sesión y NO escribe nada
 * en Supabase. Solo navega, mira y reporta: errores de consola, recursos
 * caídos, enlaces rotos, desbordes horizontales, textos de prueba y mezcla
 * entre tienda y panel.
 *
 *   node scripts/audit-produccion.mjs [--out <carpeta>]
 *
 * Salida: `<carpeta>/auditoria.json` (crudo) + capturas por vista, y un
 * resumen legible por stdout. Código de salida 1 si hay hallazgos críticos.
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TIENDA = "https://litoralmaqrender.rendercorrientes.com";
const PANEL = "https://admin-litoralmaqrender.rendercorrientes.com";

const argOut = process.argv.indexOf("--out");
const OUT = argOut !== -1 ? process.argv[argOut + 1] : "auditoria-produccion";

/** Vistas a recorrer. `wait` es un selector que prueba que la vista cargó. */
const VISTAS = [
  { sitio: "tienda", nombre: "home", url: `${TIENDA}/`, wait: "main" },
  { sitio: "tienda", nombre: "catalogo", url: `${TIENDA}/productos`, wait: ".product-card" },
  { sitio: "tienda", nombre: "busqueda", url: `${TIENDA}/productos?q=motosierra`, wait: "main" },
  { sitio: "tienda", nombre: "ofertas", url: `${TIENDA}/productos?categoria=Ofertas`, wait: "main" },
  { sitio: "tienda", nombre: "carrito", url: `${TIENDA}/carrito`, wait: "main" },
  { sitio: "tienda", nombre: "checkout", url: `${TIENDA}/checkout`, wait: "main" },
  { sitio: "tienda", nombre: "login-cliente", url: `${TIENDA}/login`, wait: "form" },
  { sitio: "tienda", nombre: "registro", url: `${TIENDA}/registro`, wait: "form" },
  { sitio: "panel", nombre: "admin-entrada", url: `${PANEL}/admin.html`, wait: "main" },
  { sitio: "panel", nombre: "admin-login", url: `${PANEL}/admin/login`, wait: "form" },
];

/** Textos que no deberían aparecer en un sitio entregado. */
const TEXTO_SOSPECHOSO = [
  /lorem ipsum/i,
  /\bplaceholder\b/i,
  /\bdummy\b/i,
  /texto de ejemplo/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /producto de prueba/i,
  /E2E-\d{4}/,
  /@e2e\.litoralmaq\.test/i,
  /admin123/,
];

/** Errores de consola que son ruido conocido del navegador, no del sitio. */
const CONSOLA_IGNORABLE = [
  /Largest Contentful Paint/i,
  /Download the React DevTools/i,
  /favicon/i,
  /\[Fast Refresh\]/i,
];

const hallazgos = [];
function anotar(severidad, sitio, vista, viewport, tipo, detalle) {
  hallazgos.push({ severidad, sitio, vista, viewport, tipo, detalle });
}

async function recorrer(browser, viewport) {
  const contexto = await browser.newContext(
    viewport === "movil"
      ? devices["iPhone 13"]
      : { viewport: { width: 1440, height: 900 } },
  );
  const resultados = [];

  for (const vista of VISTAS) {
    const page = await contexto.newPage();
    const consola = [];
    const fallidos = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error" && msg.type() !== "warning") return;
      const texto = msg.text();
      if (CONSOLA_IGNORABLE.some((re) => re.test(texto))) return;
      consola.push({ tipo: msg.type(), texto: texto.slice(0, 400) });
    });
    page.on("pageerror", (err) => consola.push({ tipo: "pageerror", texto: String(err.message).slice(0, 400) }));
    page.on("requestfailed", (req) => {
      const motivo = req.failure()?.errorText ?? "desconocido";
      // ERR_ABORTED no es un recurso caído: es una petición que el propio
      // navegador canceló. Next precarga las rutas enlazadas y aborta esas
      // precargas al cambiar de página o al cerrarla. Contarlas como fallas
      // llenaba el informe de ruido sobre URLs que responden 200.
      if (motivo === "net::ERR_ABORTED") return;
      fallidos.push({ url: req.url(), motivo });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) fallidos.push({ url: res.url(), motivo: `HTTP ${res.status()}` });
    });

    const registro = { ...vista, viewport, ok: false };
    try {
      const respuesta = await page.goto(vista.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      registro.status = respuesta?.status() ?? null;
      registro.urlFinal = page.url();

      if (registro.status && registro.status >= 400) {
        anotar("critico", vista.sitio, vista.nombre, viewport, "http", `${vista.url} devolvió ${registro.status}`);
      }

      try {
        await page.waitForSelector(vista.wait, { timeout: 20_000 });
        registro.ok = true;
      } catch {
        anotar("critico", vista.sitio, vista.nombre, viewport, "render", `No apareció "${vista.wait}" en ${page.url()}`);
      }

      // Desborde horizontal: el body nunca debe scrollear de costado.
      const desborde = await page.evaluate(() => {
        const doc = document.documentElement;
        return { scroll: doc.scrollWidth, cliente: doc.clientWidth };
      });
      registro.desborde = desborde;
      // Una vista que no cargó devuelve la página de error del servidor, que
      // no trae viewport meta y siempre "desborda". Medir eso sería reportar
      // un defecto de maquetación que no existe.
      if (registro.ok && desborde.scroll > desborde.cliente + 2) {
        anotar(
          "alto",
          vista.sitio,
          vista.nombre,
          viewport,
          "desborde",
          `scrollWidth ${desborde.scroll} > clientWidth ${desborde.cliente}`,
        );
      }

      // textContent, no innerText: innerText devuelve el texto ya pasado por
      // `text-transform`, así que un "Envíos a todo el país" en mayúsculas por
      // CSS daba un falso positivo de /\bTODO\b/.
      const texto = registro.ok
        ? await page.evaluate(() => document.body.textContent ?? "").catch(() => "")
        : "";
      for (const re of TEXTO_SOSPECHOSO) {
        const m = texto.match(re);
        if (m) anotar("alto", vista.sitio, vista.nombre, viewport, "texto-demo", `Coincide ${re}: "${m[0]}"`);
      }

      registro.enlaces = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => a.getAttribute("href"))
          .filter((h) => h && !h.startsWith("#") && !h.startsWith("mailto:") && !h.startsWith("tel:")),
      );

      await page.screenshot({
        path: path.join(OUT, `${viewport}-${vista.sitio}-${vista.nombre}.png`),
        fullPage: false,
      });
    } catch (error) {
      anotar("critico", vista.sitio, vista.nombre, viewport, "navegacion", String(error.message).slice(0, 300));
    }

    registro.consola = consola;
    registro.recursosFallidos = fallidos;
    for (const c of consola) {
      anotar("alto", vista.sitio, vista.nombre, viewport, "consola", `${c.tipo}: ${c.texto}`);
    }
    for (const f of fallidos) {
      anotar("alto", vista.sitio, vista.nombre, viewport, "recurso", `${f.motivo} — ${f.url}`);
    }

    resultados.push(registro);
    await page.close();
  }

  await contexto.close();
  return resultados;
}

/** Verifica que /admin.html termine en el login del panel. */
async function verificarRedireccionPanel(browser) {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();
  await page.goto(`${PANEL}/admin.html`, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const urlFinal = page.url();
  const tieneFormulario = await page.locator("form").count();
  const tieneCampoEmail = await page.getByLabel("Email").count().catch(() => 0);
  await contexto.close();

  const redirige = /\/admin\/login/.test(urlFinal);
  if (!redirige) {
    anotar("critico", "panel", "redireccion", "desktop", "redireccion", `/admin.html quedó en ${urlFinal}`);
  }
  return { urlFinal, redirige, tieneFormulario, tieneCampoEmail };
}

/**
 * Verifica que cada sitio no sirva el contenido del otro.
 *
 * La tienda NO devuelve 404 en /admin: su .htaccess redirige al subdominio
 * administrativo (ver scripts/validate-separation.mjs). Eso también es
 * separación correcta — lo que no puede pasar es que sirva el panel.
 */
async function verificarSeparacion() {
  const pruebas = [
    { nombre: "tienda no sirve el panel", url: `${TIENDA}/admin/login`, aceptaRedireccionA: PANEL },
    { nombre: "tienda no sirve admin.html", url: `${TIENDA}/admin.html`, aceptaRedireccionA: PANEL },
    { nombre: "panel no sirve el catálogo", url: `${PANEL}/productos`, aceptaRedireccionA: null },
    { nombre: "panel no sirve el checkout", url: `${PANEL}/checkout`, aceptaRedireccionA: null },
  ];
  const salida = [];
  for (const prueba of pruebas) {
    let status = null;
    let location = null;
    try {
      const res = await fetch(prueba.url, { redirect: "manual" });
      status = res.status;
      location = res.headers.get("location");
    } catch (error) {
      status = `error: ${String(error.message).slice(0, 120)}`;
    }
    const esNoEncontrado = ["404", "403"].includes(String(status));
    const esRedireccionValida =
      prueba.aceptaRedireccionA &&
      [301, 302, 307, 308].includes(Number(status)) &&
      String(location ?? "").includes(new URL(prueba.aceptaRedireccionA).hostname);
    const ok = Boolean(esNoEncontrado || esRedireccionValida);
    salida.push({ ...prueba, status, location, ok });
    if (!ok) {
      anotar(
        "alto",
        "separacion",
        prueba.nombre,
        "n/a",
        "separacion",
        `${prueba.url} devolvió ${status}${location ? ` → ${location}` : ""} (se esperaba 404 o redirección al otro sitio)`,
      );
    }
  }
  return salida;
}

/** Chequea con GET cada enlace interno único encontrado durante el recorrido. */
async function verificarEnlaces(resultados) {
  const vistos = new Map();
  for (const r of resultados) {
    for (const href of r.enlaces ?? []) {
      const base = r.sitio === "panel" ? PANEL : TIENDA;
      let absoluta;
      try {
        absoluta = new URL(href, base).toString();
      } catch {
        continue;
      }
      if (!absoluta.startsWith(TIENDA) && !absoluta.startsWith(PANEL)) continue;
      if (!vistos.has(absoluta)) vistos.set(absoluta, { url: absoluta, origen: `${r.sitio}/${r.nombre}` });
    }
  }

  const salida = [];
  for (const { url, origen } of vistos.values()) {
    let status = null;
    try {
      const res = await fetch(url, { redirect: "follow" });
      status = res.status;
    } catch (error) {
      status = `error: ${String(error.message).slice(0, 120)}`;
    }
    salida.push({ url, origen, status });
    if (status !== 200) {
      anotar("critico", "enlaces", origen, "n/a", "enlace-roto", `${url} → ${status}`);
    }
  }
  return salida;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  const desktop = await recorrer(browser, "desktop");
  const movil = await recorrer(browser, "movil");
  const redireccion = await verificarRedireccionPanel(browser);
  await browser.close();

  const separacion = await verificarSeparacion();
  const enlaces = await verificarEnlaces([...desktop, ...movil]);

  const informe = {
    generado: new Date().toISOString(),
    sitios: { tienda: TIENDA, panel: PANEL },
    vistas: { desktop, movil },
    redireccionPanel: redireccion,
    separacion,
    enlaces,
    hallazgos,
  };
  await writeFile(path.join(OUT, "auditoria.json"), JSON.stringify(informe, null, 2), "utf8");

  const criticos = hallazgos.filter((h) => h.severidad === "critico");
  const altos = hallazgos.filter((h) => h.severidad === "alto");

  console.log(`\n=== Vistas recorridas ===`);
  for (const r of [...desktop, ...movil]) {
    console.log(
      `${r.ok ? "ok  " : "FALLA"} [${r.viewport}] ${r.sitio}/${r.nombre} → HTTP ${r.status} ` +
        `${r.consola?.length ? `consola:${r.consola.length} ` : ""}` +
        `${r.recursosFallidos?.length ? `recursos:${r.recursosFallidos.length}` : ""}`,
    );
  }
  console.log(`\n=== Redirección del panel ===`);
  console.log(`/admin.html → ${redireccion.urlFinal} (redirige: ${redireccion.redirige}, formularios: ${redireccion.tieneFormulario})`);
  console.log(`\n=== Separación tienda/panel ===`);
  for (const s of separacion) console.log(`${s.ok ? "ok  " : "FALLA"} ${s.nombre}: ${s.url} → ${s.status}`);
  console.log(`\n=== Enlaces internos (${enlaces.length}) ===`);
  for (const e of enlaces.filter((x) => x.status !== 200)) console.log(`ROTO ${e.url} → ${e.status} (desde ${e.origen})`);
  console.log(`\n=== Hallazgos: ${criticos.length} críticos, ${altos.length} altos ===`);
  for (const h of [...criticos, ...altos]) {
    console.log(`[${h.severidad}] ${h.sitio}/${h.vista} (${h.viewport}) ${h.tipo}: ${h.detalle}`);
  }
  console.log(`\nInforme crudo y capturas en: ${path.resolve(OUT)}`);

  process.exit(criticos.length ? 1 : 0);
}

main();
