import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Temporary closure requested by the owner during the Tiendanube migration.
// This affects ONLY hostinger-ready, never the separate admin artifact.
export const STORE_MAINTENANCE_ENABLED = true;

export const MAINTENANCE_HTML = `<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#062c44">
  <title>Estamos renovando nuestra tienda | Litoral Maq</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f5f7f8;color:#062c44}
    body{font-family:Arial,Helvetica,sans-serif;min-height:100svh;display:flex;flex-direction:column;border-top:6px solid #ff6800}
    header{padding:32px clamp(24px,6vw,88px)}header img{display:block;width:170px;height:auto}
    main{flex:1;display:grid;place-items:center;padding:40px 24px 80px}
    article{width:min(100%,780px);text-align:center}
    .symbol{width:72px;height:72px;margin:0 auto 28px;color:#ff6800;display:grid;place-items:center;background:#fff0e4;border-radius:20px}
    .eyebrow{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin:0 0 18px;color:#a84600}
    h1{font-size:clamp(36px,6vw,64px);line-height:1.06;letter-spacing:-.045em;margin:0 auto 24px;max-width:740px}
    .intro{font-size:clamp(18px,2.5vw,23px);line-height:1.5;margin:0 0 16px;color:#526777}
    .note{font-size:15px;line-height:1.65;max-width:450px;margin:0 auto;color:#526777}
    .return{display:inline-block;margin-top:32px;font-size:17px;font-weight:700;padding-top:22px;border-top:3px solid #ff6800}
    footer{text-align:center;padding:20px 24px 28px;font-size:12px;color:#637682}
    @media(max-width:480px){header{padding:24px}header img{width:145px}main{padding:28px 24px 48px}.symbol{margin-bottom:24px}h1{max-width:340px}.intro{font-size:18px}}
  </style>
</head>
<body>
  <header><img src="/brand/AZUL.png" alt="Litoral Maq" width="170"></header>
  <main><article aria-labelledby="maintenance-title">
    <div class="symbol" aria-hidden="true"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18a2.1 2.1 0 0 0 3 3l5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3 3.7-3.7Z"/></svg></div>
    <p class="eyebrow">Estamos en remodelación</p>
    <h1 id="maintenance-title">Estamos renovando nuestra tienda.</h1>
    <p class="intro">Nos estamos preparando para volver con una mejor experiencia.</p>
    <p class="note">Las compras online están pausadas temporalmente. Gracias por acompañarnos.</p>
    <p class="return">Muy pronto volvemos.</p>
  </article></main>
  <footer>Litoral Maq · Máquinas y herramientas</footer>
</body>
</html>`;

export const MAINTENANCE_REWRITES = `
# Temporary closure: cover old links, including .html and RSC navigation.
ErrorDocument 503 /maintenance.html
<IfModule mod_headers.c>
  Header always set Cache-Control "no-store, max-age=0"
  Header always set Retry-After "3600"
</IfModule>
RewriteCond %{HTTP_HOST} !^admin\\.litoralmaq\\.com(?::[0-9]+)?$ [NC]
RewriteCond %{REQUEST_URI} !^/maintenance\\.html$
RewriteCond %{REQUEST_URI} !^/brand/
RewriteCond %{REQUEST_URI} !^/\\.well-known/
RewriteRule ^ - [R=503,L]
`;

export async function applyStoreMaintenance(dir, root = true) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "_next") await applyStoreMaintenance(file, false);
    else if (entry.isFile() && entry.name.endsWith(".html")) await writeFile(file, MAINTENANCE_HTML);
  }
  if (root) await writeFile(path.join(dir, "maintenance.html"), MAINTENANCE_HTML);
}
