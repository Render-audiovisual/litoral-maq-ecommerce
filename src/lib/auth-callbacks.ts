/**
 * Única fuente de verdad de las URLs a las que Supabase Auth devuelve al
 * usuario después de un email. Antes cada pantalla armaba la suya con
 * `window.location.origin + "/..."`, así que la lista real de callbacks
 * estaba dispersa en tres archivos y no había forma de derivar qué cargar
 * en el dashboard sin leerlos todos.
 *
 * Supabase solo redirige a URLs que estén en su allow-list; cualquier otra
 * cae silenciosamente al Site URL. Por eso la lista de abajo tiene que
 * coincidir exactamente con la del proyecto.
 */

/** Rutas de retorno, relativas al origen desde el que se pidió el email. */
export const AUTH_CALLBACK_PATHS = {
  /** Tras confirmar el email de una cuenta nueva o reenviada. */
  emailConfirmed: "/login?confirmed=1",
  /** Tras abrir el enlace de recuperación de contraseña. */
  passwordRecovery: "/restablecer-clave",
} as const;

export type AuthCallbackKind = keyof typeof AUTH_CALLBACK_PATHS;

/** Orígenes por ambiente. El de producción es el que está publicado hoy. */
export const AUTH_ORIGINS = {
  local: "http://localhost:3000",
  production: "https://litoralmaqrender.rendercorrientes.com",
} as const;

function normalizeOrigin(origin: string) {
  return origin.replace(/\/+$/, "");
}

/**
 * Arma la URL absoluta de retorno. Se usa el origen actual a propósito: el
 * mismo build se sirve en local y en producción, y el enlace tiene que
 * volver al sitio desde el que se pidió, no a uno fijo compilado.
 */
export function authCallbackUrl(kind: AuthCallbackKind, origin: string): string {
  return `${normalizeOrigin(origin)}${AUTH_CALLBACK_PATHS[kind]}`;
}

function urlsFor(origins: string[]): string[] {
  const kinds = Object.keys(AUTH_CALLBACK_PATHS) as AuthCallbackKind[];
  return origins.flatMap((origin) => kinds.map((kind) => authCallbackUrl(kind, origin)));
}

/**
 * Allow-list del proyecto Supabase de PRODUCCIÓN.
 *
 * Solo HTTPS y solo rutas exactas. `http://localhost` no va acá: autorizarlo
 * en producción permite que un enlace de confirmación o de recuperación —
 * con su token dentro — sea redirigido a una app que corra en la máquina de
 * quien reciba el mail. El desarrollo se hace contra Supabase local o
 * staging, que son proyectos distintos.
 */
export function productionRedirectUrls(): string[] {
  return urlsFor([AUTH_ORIGINS.production]);
}

/**
 * Allow-list para el proyecto de DESARROLLO/STAGING, que es otro proyecto
 * Supabase. Acá sí corresponde localhost.
 */
export function developmentRedirectUrls(stagingOrigins: string[] = []): string[] {
  return urlsFor([AUTH_ORIGINS.local, ...stagingOrigins]);
}

/** El Site URL del proyecto productivo: a dónde cae un redirect que no matchea. */
export const SITE_URL = AUTH_ORIGINS.production;
