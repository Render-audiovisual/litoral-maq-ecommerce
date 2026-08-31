import { ProviderConfigError, resolveRequestedProvider } from "@/services/provider";
import { createLocalPersistenceAdapter } from "@/services/persistence/local-adapter";
import { createSupabasePersistenceAdapter } from "./supabase-adapter";
import { getTypedSupabaseClient, readSupabaseConfig } from "./supabase/client";
import type { PersistenceAdapter } from "./types";

let cached: PersistenceAdapter | null = null;

/**
 * Selector de proveedor (ver `services/provider.ts` para la política
 * completa). Punto clave: si se pidió Supabase explícitamente y la
 * configuración es inválida, esto **lanza** — nunca cae a Local en
 * silencio. Un fallback silencioso significaría que un dispositivo sigue
 * escribiendo en localStorage mientras otros ya escriben en Supabase,
 * generando datos divergentes sin ningún aviso. Local solo se usa como
 * rollback explícito (`NEXT_PUBLIC_PERSISTENCE_PROVIDER=local`).
 */
export function getPersistenceAdapter(): PersistenceAdapter {
  if (cached) return cached;

  const provider = resolveRequestedProvider();
  if (provider === "local") {
    cached = createLocalPersistenceAdapter();
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
        "No se usa el adaptador local automáticamente — eso generaría datos divergentes entre dispositivos. " +
        "Corregí las variables, o seteá NEXT_PUBLIC_PERSISTENCE_PROVIDER=local para un rollback explícito.",
    );
  }

  const client = getTypedSupabaseClient(configResult.config);
  cached = createSupabasePersistenceAdapter(client);
  return cached;
}

/** Solo para tests: limpia el adaptador cacheado entre casos. */
export function resetPersistenceAdapterCache() {
  cached = null;
}

export type { PersistenceAdapter } from "./types";
