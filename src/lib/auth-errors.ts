/**
 * Traducción de fallos de Supabase Auth a mensajes propios.
 *
 * Las pantallas mostraban `caught.message` tal cual, así que al pasarse del
 * rate limit el cliente veía el texto crudo de GoTrue ("For security
 * purposes, you can only request this after 47 seconds"), en inglés y
 * filtrando detalles del backend.
 *
 * Los mensajes de acá son deliberadamente neutros: nunca confirman ni
 * niegan que un email esté registrado (ver `auth-enumeration` en los tests).
 */

const RATE_LIMITED =
  "Esperá unos segundos antes de volver a pedir el email. Si ya lo pediste, revisá tu bandeja y el spam.";

const GENERIC = "No pudimos completar la operación. Probá de nuevo en un momento.";

/** ¿El error es un rate limit del proveedor de emails? */
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const status = (error as { status?: number } | null)?.status;
  return (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("for security purposes") ||
    message.includes("only request this after") ||
    message.includes("email rate limit exceeded")
  );
}

/**
 * Mensaje mostrable al usuario. `fallback` permite que una pantalla dé su
 * propio texto por defecto sin perder el manejo de rate limit.
 */
export function friendlyAuthError(error: unknown, fallback = GENERIC): string {
  if (isRateLimitError(error)) return RATE_LIMITED;
  return fallback;
}

/** Segundos de espera entre reenvíos, aplicados en la UI antes de llamar a la red. */
export const RESEND_COOLDOWN_SECONDS = 60;
