/**
 * Detección de "esta navegación viene de un enlace de recuperación".
 *
 * ⚠️ ESTO ES UN CONTROL DE INTERFAZ, NO UNA FRONTERA DE SEGURIDAD.
 *
 * Todo lo de este módulo corre en el navegador y es evadible desde la
 * consola: cualquiera con una sesión válida puede llamar directamente a
 * `supabase.auth.updateUser({ password })` sin pasar por esta pantalla.
 * Sirve para que el flujo de la UI sea correcto, no para impedir el cambio.
 *
 * La frontera real es de Supabase y hoy NO está puesta: con "Secure password
 * change" desactivado (el default), GoTrue acepta el cambio con cualquier
 * sesión. El propio SDK lo documenta en GoTrueClient (`updateUser`):
 *
 *   "A user is only required to reauthenticate before updating their
 *    password if Secure password change is enabled and the user hasn't
 *    recently signed in. A user is deemed recently signed in if the session
 *    was created in the last 24 hours."
 *
 * Es decir: aun activando esa opción, una sesión de menos de 24 h cambia la
 * contraseña sin reautenticar. Ver AUDITORIA_Y_PLAN.md §"Cambio de
 * contraseña" para el diseño de (b) cambio voluntario con `reauthenticate()`.
 *
 * Lo que sí queda cubierto acá es (a): la pantalla de recuperación por
 * enlace ya no acepta el cambio solo porque haya una sesión abierta.
 *
 * Se usan dos señales porque ninguna alcanza sola:
 *
 * 1. El fragmento de la URL (`#access_token=…&type=recovery`), que es como
 *    llega el enlace en el flujo implícito. Se lee lo antes posible porque
 *    supabase-js consume y limpia el hash apenas procesa la sesión.
 * 2. El evento `PASSWORD_RECOVERY` de `onAuthStateChange`, que es el
 *    mecanismo oficial y cubre el caso en que el SDK haya ganado la carrera
 *    por el hash.
 *
 * Nota sobre PKCE: este sitio es 100% estático (`output: "export"`), no
 * tiene handler de servidor donde llamar a `exchangeCodeForSession`, así que
 * el flujo implícito es el único que funciona. Migrar a PKCE exigiría un
 * endpoint real; no se hace acá.
 */

const RECOVERY_HASH = /(^|[#&])type=recovery(&|$)/;

/** Función pura: ¿este fragmento corresponde a un enlace de recuperación? */
export function isRecoveryHash(hash: string): boolean {
  return RECOVERY_HASH.test(hash.replace(/^#/, "#"));
}

/**
 * Se evalúa al importar el módulo, antes de que cualquier pantalla cree el
 * cliente de Supabase y le limpie el hash.
 */
let recoveryIntent = typeof window !== "undefined" && isRecoveryHash(window.location.hash);

const listeners = new Set<() => void>();

/** La llama el adaptador cuando Supabase emite `PASSWORD_RECOVERY`. */
export function markPasswordRecovery() {
  if (recoveryIntent) return;
  recoveryIntent = true;
  for (const listener of listeners) listener();
}

export function hasPasswordRecoveryIntent(): boolean {
  return recoveryIntent;
}

/**
 * Fuente externa para `useSyncExternalStore`: la pantalla se entera del
 * evento tardío sin necesidad de setState dentro de un efecto.
 */
export function subscribePasswordRecovery(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** En el servidor no hay fragmento de URL que leer. */
export function getServerRecoverySnapshot() {
  return false;
}

/**
 * Reevalúa el fragmento actual. El valor de arriba se calcula una sola vez,
 * al cargar el bundle: si se llega a la pantalla por una navegación interna
 * (el módulo ya evaluado con el hash vacío), esa bandera quedaría en false
 * para siempre. En el flujo real el enlace del email es una carga completa,
 * así que no se nota — pero la pantalla no tiene por qué depender de eso.
 */
export function refreshPasswordRecoveryIntent() {
  if (typeof window === "undefined") return;
  if (isRecoveryHash(window.location.hash)) markPasswordRecovery();
}

/** Solo para tests: vuelve el módulo a su estado inicial. */
export function resetPasswordRecoveryIntent(value = false) {
  recoveryIntent = value;
  listeners.clear();
}

export const RECOVERY_REQUIRED_ERROR =
  "Abrí el enlace que te enviamos por email para poder cambiar la contraseña. " +
  "Si venció o ya lo usaste, pedí uno nuevo.";
