// Etapa 6 — artefacto de ADMINISTRACIÓN para Hostinger (subdominio admin).
// Corre después de `next build` (que exporta a `dist/`, ver next.config.ts).
//
// A diferencia de prepare-hostinger-dist.mjs (que parte del export completo
// y RECORTA lo que no debe estar), acá se usa una lista de PERMITIDOS: el
// panel admin necesita muy pocas rutas y solo los assets compartidos que
// realmente usa (ver HOSTING.md "Qué separación demuestra esto y qué no"
// para el detalle verificado archivo por archivo).
//
// Rutas admin detectadas en el proyecto (src/app/admin/**, ver
// src/components/admin-shell.tsx): "/admin" (dashboard), "/admin/login",
// "/admin/productos", "/admin/pedidos", "/admin/categorias",
// "/admin/clientes", "/admin/configuracion".
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { APACHE_SECURITY_HEADERS } from "./security-headers.mjs";

const root = process.cwd();
const nextExport = path.join(root, "dist");
const output = path.join(root, "admin-ready");

// Nivel raíz de dist/ que se conserva. "admin" cubre tanto el directorio
// dist/admin/** (subrutas) como su presencia junto a admin.html/.txt (la
// ruta "/admin" en sí). El resto son assets estáticos que el panel admin
// efectivamente usa: _next (JS/CSS), brand (logo en sidebar y login),
// favicon.ico (convención del navegador) y las páginas 404/not-found de
// Next. products/ (imágenes de producto) NO se incluye: ninguna página
// admin renderiza product.image (verificado por inspección de
// src/app/admin/**/*.tsx) — solo cuenta si falta, no la muestra.
const ALLOWED_TOP_LEVEL = new Set([
  "admin",
  "admin.html",
  "admin.txt",
  "_next",
  "brand",
  "favicon.ico",
  "404.html",
  "_not-found",
  "_not-found.html",
  "_not-found.txt",
]);

async function assertDistExists() {
  try {
    await stat(nextExport);
  } catch {
    console.error(`No existe ${nextExport}. Corré "next build" antes de este script.`);
    process.exitCode = 1;
    throw new Error("dist/ ausente");
  }
}

async function keepOnlyAdminSurface(dir) {
  const removed = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (!ALLOWED_TOP_LEVEL.has(entry)) {
      await rm(path.join(dir, entry), { recursive: true, force: true });
      removed.push(entry);
    }
  }
  return removed;
}

async function materializeDirectoryIndexes(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    if (["index.html", "404.html", "_not-found.html"].includes(entry.name)) continue;

    const routeName = entry.name.slice(0, -".html".length);
    const routeDir = path.join(dir, routeName);
    try {
      if (!(await stat(routeDir)).isDirectory()) continue;
    } catch {
      continue;
    }
    await cp(path.join(dir, entry.name), path.join(routeDir, "index.html"));
  }

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "_next") {
      await materializeDirectoryIndexes(path.join(dir, entry.name));
    }
  }
}

const ADMIN_ROOT_REDIRECT = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=/admin">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="/admin">
    <title>Panel Litoral Maq</title>
    <script>window.location.replace("/admin");</script>
  </head>
  <body>
    <p>Abriendo el <a href="/admin">panel de administracion</a>...</p>
  </body>
</html>
`;

const ADMIN_HTACCESS = `Options -MultiViews
DirectorySlash Off
DirectoryIndex index.html
${APACHE_SECURITY_HEADERS}
RewriteEngine On

# La raiz del subdominio tiene que cambiar tambien la URL del navegador a
# /admin. Si solo entrega admin.html internamente, Next cree que esta en "/"
# y monta por error la cabecera, el footer y el carrito de la tienda.
RewriteRule ^$ /admin [R=302,L]

# Next exporta las rutas como archivos .html. Permite abrir /admin/productos,
# /admin/pedidos, etc. sin mostrar la extensión, y que el refresh del
# navegador siga funcionando en cualquier ruta profunda. Debe evaluarse antes
# que la carpeta homónima generada por Next para evitar redirects con barra y
# un 403 de Apache.
RewriteCond %{DOCUMENT_ROOT}/$1.html -f
RewriteRule ^(.+?)/?$ $1.html [L]

# Entrega los demás archivos y carpetas existentes sin reescribirlos.
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

ErrorDocument 404 /404.html
`;

async function main() {
  await assertDistExists();

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(nextExport, output, { recursive: true });

  const removed = await keepOnlyAdminSurface(output);

  await materializeDirectoryIndexes(output);
  // Fallback para hosts que ignoren mod_rewrite: no copiar admin.html a la
  // raíz porque eso conserva pathname="/" y vuelve a montar la tienda. Este
  // index cambia la URL real a /admin antes de cargar la aplicación.
  await writeFile(path.join(output, "index.html"), ADMIN_ROOT_REDIRECT);

  await writeFile(path.join(output, ".htaccess"), ADMIN_HTACCESS);

  console.log("Artefacto de ADMINISTRACIÓN preparado en admin-ready/.");
  console.log(`Entradas de nivel raíz removidas (${removed.length}): ${removed.join(", ")}`);
  console.log("Subir el CONTENIDO de admin-ready/ a public_html del subdominio admin.");
}

await main();
