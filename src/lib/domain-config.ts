/**
 * Configuración de dominios para tienda y administración (Etapa 6).
 *
 * Mismo patrón que `services/provider.ts` y
 * `services/persistence/supabase/client.ts`: cada variable se lee como
 * `process.env.NEXT_PUBLIC_X` literal (nunca `process.env` completo ni
 * `process.env[nombreDinamico]`), porque Next.js solo puede inlinear esa
 * forma exacta en el bundle de cliente — cualquier otra forma deja
 * `process.env` vacío en el navegador (ver supabase/README.md §4.1, bug ya
 * encontrado y corregido en Etapa 5). `overrideEnv` es solo para tests.
 *
 * Sin las variables configuradas (caso normal en desarrollo local, donde
 * tienda y admin todavía viven en el mismo origen), las funciones devuelven
 * una ruta relativa — nunca un dominio hardcodeado. Con una variable
 * presente pero inválida, fallan de forma visible: mismo criterio que el
 * selector de proveedor de persistencia/auth, para no navegar en silencio
 * a un dominio mal configurado.
 */

export type DomainReadResult =
  | { status: "unset" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; url: string };

function normalizeDomain(raw: string | undefined, varName: string): DomainReadResult {
  const trimmed = raw?.trim();
  if (!trimmed) return { status: "unset" };

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { status: "invalid", reason: `${varName} no es una URL/dominio válido: "${trimmed}".` };
  }
  if (!parsed.hostname.includes(".")) {
    return { status: "invalid", reason: `${varName} no parece un dominio válido: "${trimmed}".` };
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return {
      status: "invalid",
      reason: `${varName} debe ser solo el dominio, sin ruta ni query: "${trimmed}".`,
    };
  }
  return { status: "ok", url: parsed.origin };
}

/** Lee y valida NEXT_PUBLIC_STORE_DOMAIN. */
export function readStoreDomain(overrideEnv?: Record<string, string | undefined>): DomainReadResult {
  const raw = overrideEnv?.NEXT_PUBLIC_STORE_DOMAIN ?? process.env.NEXT_PUBLIC_STORE_DOMAIN;
  return normalizeDomain(raw, "NEXT_PUBLIC_STORE_DOMAIN");
}

/** Lee y valida NEXT_PUBLIC_ADMIN_DOMAIN. */
export function readAdminDomain(overrideEnv?: Record<string, string | undefined>): DomainReadResult {
  const raw = overrideEnv?.NEXT_PUBLIC_ADMIN_DOMAIN ?? process.env.NEXT_PUBLIC_ADMIN_DOMAIN;
  return normalizeDomain(raw, "NEXT_PUBLIC_ADMIN_DOMAIN");
}

/**
 * Ambas variables configuradas pero apuntando al mismo dominio: es una
 * configuración contradictoria (Etapa 6 exige raíces de publicación
 * separadas), no un "no configurado".
 */
export function readDomainConfig(overrideEnv?: Record<string, string | undefined>):
  | { status: "unset-store" | "unset-admin" }
  | { status: "invalid"; reason: string }
  | { status: "same-domain"; url: string }
  | { status: "ok"; storeUrl: string; adminUrl: string } {
  const store = readStoreDomain(overrideEnv);
  const admin = readAdminDomain(overrideEnv);

  if (store.status === "invalid") return { status: "invalid", reason: store.reason };
  if (admin.status === "invalid") return { status: "invalid", reason: admin.reason };
  if (store.status === "unset") return { status: "unset-store" };
  if (admin.status === "unset") return { status: "unset-admin" };
  if (store.url === admin.url) return { status: "same-domain", url: store.url };
  return { status: "ok", storeUrl: store.url, adminUrl: admin.url };
}

function withPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * URL de la tienda. Sin NEXT_PUBLIC_STORE_DOMAIN configurada, devuelve una
 * ruta relativa (funciona igual en desarrollo local / mismo origen). Con la
 * variable presente pero inválida, lanza — nunca arma un link a un dominio
 * mal formado.
 */
export function getStoreUrl(path = "/", overrideEnv?: Record<string, string | undefined>): string {
  const normalizedPath = withPath(path);
  const result = readStoreDomain(overrideEnv);
  if (result.status === "invalid") {
    throw new Error(
      `Configuración de dominio inválida: ${result.reason} Corregí NEXT_PUBLIC_STORE_DOMAIN en el entorno de build.`,
    );
  }
  if (result.status === "unset") return normalizedPath;
  return `${result.url}${normalizedPath}`;
}

/**
 * URL del administrador. Mismo criterio que `getStoreUrl` — ruta relativa
 * si NEXT_PUBLIC_ADMIN_DOMAIN no está configurada, error visible si está
 * mal formada. No usado desde la tienda pública: la tienda nunca debe
 * enlazar a `/admin` (ver HOSTING.md).
 */
export function getAdminUrl(path = "/admin", overrideEnv?: Record<string, string | undefined>): string {
  const normalizedPath = withPath(path);
  const result = readAdminDomain(overrideEnv);
  if (result.status === "invalid") {
    throw new Error(
      `Configuración de dominio inválida: ${result.reason} Corregí NEXT_PUBLIC_ADMIN_DOMAIN en el entorno de build.`,
    );
  }
  if (result.status === "unset") return normalizedPath;
  return `${result.url}${normalizedPath}`;
}
