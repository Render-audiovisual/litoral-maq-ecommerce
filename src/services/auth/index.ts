import { createTypedSupabaseClient, readSupabaseConfig } from "@/services/persistence/supabase/client";
import { ProviderConfigError, resolveRequestedProvider } from "@/services/provider";
import { localAuthAdapter } from "./local-auth-adapter";
import { createSupabaseAuthAdapter } from "./supabase-auth-adapter";
import type { AuthAdapter } from "./types";

let cached: AuthAdapter | null = null;

/**
 * Selector de proveedor de autenticación — misma política que
 * `services/persistence/index.ts` (ver `services/provider.ts`), para que
 * nunca queden desincronizados. Igual que allí: configuración de Supabase
 * inválida con el proveedor pedido explícitamente **lanza**, no cae a Local
 * en silencio.
 */
export function getAuthAdapter(): AuthAdapter {
  if (cached) return cached;

  const provider = resolveRequestedProvider();
  if (provider === "local") {
    cached = localAuthAdapter;
    return cached;
  }

  const configResult = readSupabaseConfig();
  if (configResult.status !== "ok") {
    const reason =
      configResult.status === "invalid"
        ? configResult.reason
        : "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
    throw new ProviderConfigError(
      `NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase pero la configuración es inválida: ${reason} ` +
        "No se usa el adaptador de autenticación local automáticamente — eso generaría sesiones inconsistentes " +
        "entre dispositivos. Corregí las variables, o seteá NEXT_PUBLIC_PERSISTENCE_PROVIDER=local para un rollback explícito.",
    );
  }

  const client = createTypedSupabaseClient(configResult.config);
  cached = createSupabaseAuthAdapter(client);
  return cached;
}

/** Solo para tests: limpia el adaptador cacheado entre casos. */
export function resetAuthAdapterCache() {
  cached = null;
}

export type { AuthAdapter, GuestCapableAuthAdapter, SessionRestorableAuthAdapter } from "./types";
export { supportsGuestSessions, supportsSessionRestore } from "./types";
