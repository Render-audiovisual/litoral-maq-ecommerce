const RECOVERY_VERIFY_PATH = "/auth/v1/verify";
const RECOVERY_FRAGMENT_PREFIX = "#confirmation_url=";

/**
 * Valida el enlace real de Supabase antes de mostrar el segundo paso.
 * El email apunta primero a una página de Litoral para que los analizadores
 * automáticos de correo no consuman el token de un solo uso.
 */
export function safeRecoveryConfirmationUrl(
  rawUrl: string | null,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!rawUrl || !supabaseUrl) return null;

  try {
    const candidate = new URL(rawUrl);
    const expected = new URL(supabaseUrl);
    const token = candidate.searchParams.get("token") ?? candidate.searchParams.get("token_hash");

    if (
      candidate.protocol !== "https:" ||
      candidate.origin !== expected.origin ||
      candidate.pathname !== RECOVERY_VERIFY_PATH ||
      candidate.searchParams.get("type") !== "recovery" ||
      !token
    ) {
      return null;
    }

    return candidate.toString();
  } catch {
    return null;
  }
}

/**
 * Extrae el enlace real desde el fragmento del navegador. El fragmento no se
 * envía a Hostinger ni aparece en sus logs, y permite conservar sin ambigüedad
 * todos los `&` que ya trae la URL de verificación de Supabase.
 */
export function recoveryConfirmationUrlFromHash(
  hash: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!hash.startsWith(RECOVERY_FRAGMENT_PREFIX)) return null;
  return safeRecoveryConfirmationUrl(hash.slice(RECOVERY_FRAGMENT_PREFIX.length), supabaseUrl);
}
