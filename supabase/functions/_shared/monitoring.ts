// Logs estructurados de error: una línea JSON por fallo, fácil de filtrar en
// Supabase → Edge Functions → Logs (buscar "level":"error"). Portado a mano
// del PR #61. Nunca se loguean secretos; los emails y números largos (DNI,
// teléfonos, ids de pago) que aparezcan en un mensaje se tapan.

export function redactText(value: string, max = 300): string {
  return value
    .replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+/g, "[email]")
    .replace(/\d{7,}/g, "[número]")
    .slice(0, max);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" ? message : "Error desconocido";
}

export function logEdgeError(
  scope: string,
  error: unknown,
  extra: Record<string, unknown> = {},
) {
  console.error(JSON.stringify({
    ...extra,
    level: "error",
    scope,
    at: new Date().toISOString(),
    error: redactText(errorMessage(error)),
  }));
}
