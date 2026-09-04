export function normalizeAdminPath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export function isAdminLoginPath(pathname: string): boolean {
  return normalizeAdminPath(pathname) === "/admin/login";
}
