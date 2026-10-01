/**
 * Nombre corto por cuenta del panel, para que el equipo vea de un vistazo
 * quién tiene la sesión abierta (varias cuentas admin comparten permisos).
 * Sumar una entrada acá cuando se cree una cuenta nueva (ver docs/ADMIN_CUENTAS.md).
 */
const ADMIN_DISPLAY_NAMES: Record<string, string> = {
  "byfranromero@hotmail.com": "Dev",
  "maqlitoral@gmail.com": "Gonza",
  "gabrielespinozaa5@gmail.com": "Gaby",
};

/** Cuenta sin nombre asignado: se usa la parte antes del @ del email. */
export function resolveAdminDisplayName(email?: string | null): string {
  const key = (email ?? "").trim().toLowerCase();
  if (!key) return "Admin";
  return ADMIN_DISPLAY_NAMES[key] ?? key.split("@")[0] ?? "Admin";
}

/** Iniciales para el avatar circular: las dos primeras letras del nombre. */
export function adminInitials(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "A";
}
