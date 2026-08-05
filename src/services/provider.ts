/**
 * Única fuente de verdad de qué proveedor está activo — usada tanto por
 * `services/persistence` como por `services/auth` para que nunca puedan
 * quedar desincronizados (por ejemplo: datos en Supabase pero login contra
 * el modelo demo local, o viceversa).
 *
 * Comportamiento (ver supabase/README.md §4.1 para el detalle):
 * - NEXT_PUBLIC_PERSISTENCE_PROVIDER=local     → Local, explícito (rollback).
 * - NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase  → Supabase, exige config
 *   válida. Si la config es inválida, quien llama a getPersistenceAdapter()
 *   / getAuthAdapter() debe fallar de forma visible, NUNCA caer a Local en
 *   silencio (eso generaría datos divergentes entre dispositivos).
 * - sin definir                                → Local (nunca se configuró
 *   Supabase explícitamente; no hay auto-detección implícita por presencia
 *   de variables, a propósito).
 */
export type Provider = "local" | "supabase";

/**
 * IMPORTANTE: accedé siempre a `process.env.NEXT_PUBLIC_X` como expresión
 * literal directa (nunca `process.env` completo asignado a una variable, ni
 * `process.env[nombreDinamico]`). Next.js reemplaza esas expresiones
 * literales por su valor en tiempo de build para el bundle de cliente —
 * cualquier otra forma de leerlas deja `process.env` como un objeto vacío
 * en el navegador, y el selector de proveedor quedaría siempre en "local"
 * pase lo que pase. `overrideEnv` es solo para tests (inyecta valores sin
 * pasar por `process.env` en absoluto).
 */
export function resolveRequestedProvider(overrideEnv?: Record<string, string | undefined>): Provider {
  const raw = overrideEnv?.NEXT_PUBLIC_PERSISTENCE_PROVIDER ?? process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER;
  const requested = raw?.trim().toLowerCase();
  if (requested === "supabase") return "supabase";
  return "local";
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}
