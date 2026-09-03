function configuredAdminHostname(adminDomain?: string) {
  const raw = adminDomain?.trim();
  if (!raw) return null;

  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
}

/**
 * El admin normalmente vive bajo /admin, pero Hostinger puede servir esa
 * página en la raíz del subdominio sin cambiar el pathname del navegador.
 * En ese caso el hostname es la fuente de verdad para no montar la tienda.
 */
export function isAdminSurface(
  pathname: string,
  hostname?: string,
  adminDomain = process.env.NEXT_PUBLIC_ADMIN_DOMAIN,
) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;

  const adminHostname = configuredAdminHostname(adminDomain);
  return Boolean(hostname && adminHostname && hostname === adminHostname);
}
