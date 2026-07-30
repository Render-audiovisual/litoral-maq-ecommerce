import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextExport = path.join(root, "dist");
const hostingerOutput = path.join(root, "hostinger-ready");

await rm(hostingerOutput, { recursive: true, force: true });
await mkdir(hostingerOutput, { recursive: true });
await cp(nextExport, hostingerOutput, { recursive: true });

const htaccess = `Options -MultiViews
RewriteEngine On

# Entrega archivos y carpetas existentes sin reescribirlos.
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Next exporta las rutas como archivos .html. Esto permite abrir /admin,
# /productos y las fichas sin mostrar la extensión.
RewriteCond %{DOCUMENT_ROOT}/$1.html -f
RewriteRule ^(.+?)/?$ $1.html [L]

# Inicio del sitio.
RewriteRule ^$ index.html [L]
`;

await writeFile(path.join(hostingerOutput, ".htaccess"), htaccess);

console.log("Hostinger artifact prepared in hostinger-ready/.");
console.log("Upload the CONTENTS of hostinger-ready/ to public_html/.");
