// Etapa 6 — artefacto de TIENDA para Hostinger (dominio principal).
// Corre después de `next build` (que exporta a `dist/`, ver next.config.ts).
// Copia todo `dist/` a `hostinger-ready/` y después ELIMINA las rutas
// exclusivas de administración (nunca al revés: partir del export completo
// y recortar es lo que garantiza que ninguna ruta nueva de tienda quede
// afuera por error de una lista incompleta).
//
// Qué se considera "admin" acá (ver dist/ real, Etapa 6):
//   - admin.html / admin.txt        (ruta "/admin", nivel raíz)
//   - admin/**                      (todas las subrutas: login, productos,
//                                    pedidos, categorias, clientes, config)
// Todo lo demás (_next/**, brand/**, products/**, íconos, 404, rutas de
// tienda) se conserva — incluye los chunks JS compartidos de Next.js, que
// no se pueden separar sin partir el proyecto en dos apps (ver HOSTING.md
// "Qué separación demuestra esto y qué no").
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextExport = path.join(root, "dist");
const output = path.join(root, "hostinger-ready");

const ADMIN_ONLY_NAMES = new Set(["admin", "admin.html", "admin.txt"]);

async function assertDistExists() {
  try {
    await stat(nextExport);
  } catch {
    console.error(`No existe ${nextExport}. Corré "next build" antes de este script.`);
    process.exitCode = 1;
    throw new Error("dist/ ausente");
  }
}

async function removeAdminRoutes(dir) {
  const removed = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (ADMIN_ONLY_NAMES.has(entry)) {
      await rm(path.join(dir, entry), { recursive: true, force: true });
      removed.push(entry);
    }
  }
  return removed;
}

const STORE_HTACCESS = `Options -MultiViews
RewriteEngine On

# Bloquea cualquier intento de acceder a rutas de administración desde el
# dominio de tienda — el artefacto de tienda no las contiene, pero esta
# regla además evita que Apache intente resolverlas de otra forma.
RewriteRule ^admin(/.*)?$ - [F,L]

# Entrega archivos y carpetas existentes sin reescribirlos.
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Next exporta las rutas como archivos .html. Esto permite abrir /productos
# y las fichas individuales sin mostrar la extensión.
RewriteCond %{DOCUMENT_ROOT}/$1.html -f
RewriteRule ^(.+?)/?$ $1.html [L]

# Inicio del sitio.
RewriteRule ^$ index.html [L]

ErrorDocument 404 /404.html
`;

async function main() {
  await assertDistExists();

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(nextExport, output, { recursive: true });

  const removed = await removeAdminRoutes(output);

  await writeFile(path.join(output, ".htaccess"), STORE_HTACCESS);

  console.log("Artefacto de TIENDA preparado en hostinger-ready/.");
  console.log(`Rutas de administración removidas del artefacto: ${removed.join(", ") || "(ninguna encontrada)"}`);
  console.log("Subir el CONTENIDO de hostinger-ready/ a public_html del dominio principal.");
}

await main();
