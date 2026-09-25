/**
 * Cierre del panel por inactividad. Solo para el panel: la sesión de los
 * clientes no pasa por acá. La actividad se guarda en localStorage para que
 * cualquier pestaña del panel mantenga viva la sesión de las demás.
 */
export const ADMIN_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const ADMIN_MAX_SESSION_MS = 24 * 60 * 60 * 1000;
export const ADMIN_ACTIVITY_WRITE_THROTTLE_MS = 30_000;
export const ADMIN_IDLE_CHECK_INTERVAL_MS = 60_000;
export const ADMIN_ACTIVITY_KEY = "litoral-admin-activity-v1";
export const ADMIN_IDLE_MESSAGE = "Cerramos tu sesión por inactividad. Ingresá de nuevo.";

export type AdminActivity = { signedInAt: number; lastActivity: number };

export function isAdminSessionStale(
  lastActivity: number,
  signedInAt: number,
  now: number = Date.now(),
): boolean {
  return (
    now - lastActivity >= ADMIN_IDLE_TIMEOUT_MS ||
    now - signedInAt >= ADMIN_MAX_SESSION_MS
  );
}

export function readAdminActivity(): AdminActivity | null {
  try {
    const value = JSON.parse(localStorage.getItem(ADMIN_ACTIVITY_KEY) || "null");
    return typeof value?.signedInAt === "number" && typeof value?.lastActivity === "number"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function writeAdminActivity(activity: AdminActivity) {
  try {
    localStorage.setItem(ADMIN_ACTIVITY_KEY, JSON.stringify(activity));
  } catch {
    // Sin almacenamiento el control queda en la verificación del servidor.
  }
}

/** Al ingresar: arranca los dos relojes (inactividad y tope absoluto). */
export function markAdminSignedIn(now: number = Date.now()) {
  writeAdminActivity({ signedInAt: now, lastActivity: now });
}

export function clearAdminActivity() {
  try {
    localStorage.removeItem(ADMIN_ACTIVITY_KEY);
  } catch {
    // Nada que limpiar.
  }
}
