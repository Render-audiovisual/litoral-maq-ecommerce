const RECOVERY_VERIFY_PATH = "/auth/v1/verify";

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
