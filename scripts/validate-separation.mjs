// Etapa 6 — validación automática de separación tienda/admin.
// Corre DESPUÉS de generar ambos artefactos (prepare-hostinger-dist.mjs y
// prepare-admin-dist.mjs). No construye nada — solo inspecciona lo que ya
// existe en disco y falla (exit code 1) si alguna de las reglas de
// separación no se cumple. No asume nada que no pueda verificar: cada
// chequeo lee archivos reales, nunca una lista fija de rutas "esperadas"
// sin confirmar que existan.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const storeDir = path.join(root, "hostinger-ready");
const adminDir = path.join(root, "admin-ready");

const failures = [];
const passed = [];

function fail(message) {
  failures.push(message);
}
function ok(message) {
  passed.push(message);
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(targetPath) {
  try {
    return await readFile(targetPath, "utf8");
  } catch {
    return null;
  }
}

async function collectFiles(dir, predicate, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(full, predicate, files);
    else if (predicate(full)) files.push(full);
  }
  return files;
}

async function listTopLevel(dir) {
  try {
    return await readdir(dir);
  } catch {
    return null;
  }
}

/** Extrae rutas locales referenciadas por un HTML (src=, href=, "/_next/...") */
function extractLocalAssetPaths(html) {
  const paths = new Set();
  const attrRegex = /(?:src|href)="(\/[^"]+)"/g;
  let match;
  while ((match = attrRegex.exec(html))) {
    const value = match[1];
    if (value.startsWith("//")) continue; // protocolo-relativo externo
    if (value.endsWith(".html") || value === "/") continue; // link de página, no asset
    paths.add(value.split("#")[0].split("?")[0]);
  }
  return [...paths];
}

async function checkAssetsExist(artifactDir, htmlFiles, label) {
  for (const htmlPath of htmlFiles) {
    const html = await readIfExists(htmlPath);
    if (!html) continue;
    const assets = extractLocalAssetPaths(html);
    for (const assetPath of assets) {
      const onDisk = path.join(artifactDir, assetPath);
      if (!(await exists(onDisk))) {
        fail(`[${label}] ${path.relative(root, htmlPath)} referencia "${assetPath}" pero no existe en el artefacto.`);
      }
    }
  }
}

async function checkDeepRouteResolves(artifactDir, routePath, label) {
  // El .html cubre servidores que respetan el rewrite. El index físico
  // cubre Hostinger/LiteSpeed, que puede redirigir primero a la carpeta RSC.
  const htmlPath = path.join(artifactDir, `${routePath}.html`.replace(/^\//, ""));
  const directoryIndexPath = path.join(artifactDir, routePath.replace(/^\//, ""), "index.html");
  const missing = [];
  if (!(await exists(htmlPath))) missing.push(path.relative(artifactDir, htmlPath));
  if (!(await exists(directoryIndexPath))) missing.push(path.relative(artifactDir, directoryIndexPath));
  if (missing.length === 0) {
    ok(`[${label}] ${routePath} tiene HTML de rewrite e index físico para Hostinger.`);
  } else fail(`[${label}] ${routePath} no puede resolver de forma portable; faltan: ${missing.join(", ")}.`);
}

async function main() {
  if (!(await exists(storeDir))) {
    console.error(`Falta ${storeDir}. Corré "npm run build:hostinger" antes de validar.`);
    process.exitCode = 1;
    return;
  }
  if (!(await exists(adminDir))) {
    console.error(`Falta ${adminDir}. Corré "npm run build:admin" antes de validar.`);
    process.exitCode = 1;
    return;
  }

  // 1. Tienda: ausencia de rutas/enlaces admin.
  const storeTop = await listTopLevel(storeDir);
  const adminEntriesInStore = storeTop.filter((entry) => entry === "admin" || entry.startsWith("admin."));
  if (adminEntriesInStore.length) {
    fail(`[tienda] Contiene entradas de administración a nivel raíz: ${adminEntriesInStore.join(", ")}`);
  } else {
    ok("[tienda] Sin entradas 'admin' a nivel raíz (ni admin.html/admin.txt ni directorio admin/).");
  }

  const storeHtmlFiles = [];
  async function collectHtml(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_next") continue; // chunks JS, no HTML de rutas
        await collectHtml(full);
      } else if (entry.name.endsWith(".html")) {
        storeHtmlFiles.push(full);
      }
    }
  }
  await collectHtml(storeDir);

  let storeAdminLinkHits = 0;
  for (const htmlPath of storeHtmlFiles) {
    const html = await readIfExists(htmlPath);
    if (html && /\/admin(?:["'/]|\.html)/.test(html)) {
      storeAdminLinkHits += 1;
      fail(`[tienda] ${path.relative(root, htmlPath)} contiene una referencia a "/admin".`);
    }
  }
  if (storeAdminLinkHits === 0) {
    ok(`[tienda] Ningún HTML (${storeHtmlFiles.length} revisados) contiene una referencia a "/admin".`);
  }

  // 2. Admin: presencia de rutas admin, ausencia de páginas comerciales.
  const EXPECTED_ADMIN_ROUTES = [
    "admin.html",
    "admin/login.html",
    "admin/productos.html",
    "admin/pedidos.html",
    "admin/categorias.html",
    "admin/clientes.html",
    "admin/configuracion.html",
  ];
  for (const relPath of EXPECTED_ADMIN_ROUTES) {
    if (await exists(path.join(adminDir, relPath))) {
      ok(`[admin] Contiene ${relPath}.`);
    } else {
      fail(`[admin] Falta ${relPath} — se esperaba en el artefacto de administración.`);
    }
  }

  const FORBIDDEN_IN_ADMIN = ["productos.html", "productos", "carrito.html", "checkout.html", "login.html", "registro.html", "cuenta", "products"];
  const adminTop = await listTopLevel(adminDir);
  const commercialEntriesInAdmin = adminTop.filter((entry) => FORBIDDEN_IN_ADMIN.includes(entry));
  if (commercialEntriesInAdmin.length) {
    fail(`[admin] Contiene rutas/assets comerciales de tienda: ${commercialEntriesInAdmin.join(", ")}`);
  } else {
    ok("[admin] Sin rutas comerciales de tienda a nivel raíz (productos, carrito, checkout, login público, registro, cuenta, products/).");
  }

  const adminHtmlFiles = [];
  async function collectAdminHtml(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_next") continue;
        await collectAdminHtml(full);
      } else if (entry.name.endsWith(".html")) {
        adminHtmlFiles.push(full);
      }
    }
  }
  await collectAdminHtml(adminDir);

  const COMMERCIAL_MARKERS = ["Agregar al carrito", "Confirmá tu pedido", "Envíos a todo el país", "carrito.html"];
  let commercialMarkerHits = 0;
  for (const htmlPath of adminHtmlFiles) {
    const html = await readIfExists(htmlPath);
    if (!html) continue;
    for (const marker of COMMERCIAL_MARKERS) {
      if (html.includes(marker)) {
        commercialMarkerHits += 1;
        fail(`[admin] ${path.relative(root, htmlPath)} contiene el marcador comercial "${marker}".`);
      }
    }
  }
  if (commercialMarkerHits === 0) {
    ok(`[admin] Ningún HTML (${adminHtmlFiles.length} revisados) contiene marcadores de navegación comercial.`);
  }

  // 3. Existencia de todos los assets referenciados.
  await checkAssetsExist(storeDir, storeHtmlFiles.slice(0, 30), "tienda"); // muestra: 460 fichas repiten los mismos assets
  await checkAssetsExist(adminDir, adminHtmlFiles, "admin");

  // 4. Reglas .htaccess esperadas.
  const storeHtaccess = await readIfExists(path.join(storeDir, ".htaccess"));
  if (storeHtaccess?.includes("https://admin-litoralmaqrender.rendercorrientes.com/admin/$1")) {
    ok("[tienda] .htaccess redirige /admin al subdominio administrativo.");
  } else {
    fail("[tienda] .htaccess no redirige /admin al subdominio administrativo.");
  }
  if (storeHtaccess?.includes("RewriteRule ^$ index.html [L]")) {
    ok("[tienda] .htaccess define index.html como raíz.");
  } else {
    fail("[tienda] .htaccess no define la raíz del sitio.");
  }
  if (storeHtaccess?.includes("DirectorySlash Off")) {
    ok("[tienda] .htaccess evita que Apache priorice las carpetas RSC sobre los HTML de ruta.");
  } else {
    fail("[tienda] .htaccess no desactiva DirectorySlash para las rutas exportadas.");
  }

  const adminHtaccess = await readIfExists(path.join(adminDir, ".htaccess"));
  if (adminHtaccess?.includes("RewriteRule ^$ admin.html [L]")) {
    ok("[admin] .htaccess redirige la raíz del subdominio a admin.html.");
  } else {
    fail("[admin] .htaccess no redirige la raíz a admin.html.");
  }
  if (await exists(path.join(adminDir, "index.html"))) {
    ok("[admin] La raíz tiene index.html físico para hosts que ignoran DirectoryIndex.");
  } else {
    fail("[admin] Falta index.html físico en la raíz del subdominio.");
  }
  if (adminHtaccess?.includes("DirectorySlash Off")) {
    ok("[admin] .htaccess evita que Apache priorice las carpetas RSC sobre los HTML de ruta.");
  } else {
    fail("[admin] .htaccess no desactiva DirectorySlash para las rutas exportadas.");
  }

  const requiredSecurityHeaders = [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
  ];
  for (const [label, htaccess] of [["tienda", storeHtaccess], ["admin", adminHtaccess]]) {
    const missing = requiredSecurityHeaders.filter((header) => !htaccess?.includes(header));
    if (missing.length === 0) ok(`[${label}] .htaccess incluye todos los headers de seguridad requeridos.`);
    else fail(`[${label}] .htaccess no incluye: ${missing.join(", ")}.`);
  }

  const jsFiles = [
    ...(await collectFiles(path.join(storeDir, "_next"), (file) => file.endsWith(".js"))),
    ...(await collectFiles(path.join(adminDir, "_next"), (file) => file.endsWith(".js"))),
  ];
  const forbiddenProductionMarkers = ["admin123", "demo-admin-", "litoral-accounts-v1"];
  for (const marker of forbiddenProductionMarkers) {
    let found = false;
    for (const file of jsFiles) {
      if ((await readFile(file, "utf8")).includes(marker)) {
        found = true;
        fail(`[producción] El bundle contiene el marcador demo prohibido "${marker}".`);
        break;
      }
    }
    if (!found) ok(`[producción] El bundle no contiene el marcador demo "${marker}".`);
  }

  // 5. Acceso directo y refresh de rutas profundas.
  for (const route of ["/productos", "/carrito", "/checkout", "/checkout/exito", "/cuenta/pedidos"]) {
    await checkDeepRouteResolves(storeDir, route, "tienda");
  }
  for (const route of ["/admin", "/admin/login", "/admin/productos", "/admin/pedidos", "/admin/categorias", "/admin/clientes", "/admin/configuracion"]) {
    await checkDeepRouteResolves(adminDir, route, "admin");
  }

  console.log(`\nValidación de separación: ${passed.length} OK, ${failures.length} fallos.\n`);
  for (const message of passed) console.log(`  OK  ${message}`);
  if (failures.length) {
    console.log("");
    for (const message of failures) console.error(`  FAIL  ${message}`);
    process.exitCode = 1;
  }
}

await main();
