import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

export type SupabaseConfig = {
  url: string;
  /** Clave publicable (o anon key legacy) — nunca una clave secreta. */
  publishableKey: string;
};

const SECRET_KEY_PREFIXES = ["sb_secret_", "service_role"];

/**
 * Lee la configuración pública de Supabase del entorno y valida su forma.
 * Nunca lanza por ausencia total de variables (eso es "modo local", el caso
 * normal hoy) — solo devuelve un motivo claro cuando la configuración está
 * a medias o es inválida, para que quien la está armando entienda qué falta
 * sin que la app se rompa en silencio con la clave equivocada.
 *
 * Prioridad de la clave pública: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (la
 * nomenclatura vigente de Supabase, prefijo real `sb_publishable_...`) como
 * opción principal; NEXT_PUBLIC_SUPABASE_ANON_KEY queda como alias legacy
 * para proyectos que todavía no rotaron a la clave publicable.
 *
 * IMPORTANTE: cada variable se lee como `process.env.NEXT_PUBLIC_X` literal
 * (nunca `process.env` completo ni `process.env[nombreDinamico]`) para que
 * Next.js pueda inlinearla en el bundle de cliente — ver el comentario en
 * `services/provider.ts`. `overrideEnv` es solo para tests.
 */
export type SupabaseConfigResult =
  | { status: "absent" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; config: SupabaseConfig };

export function readSupabaseConfig(overrideEnv?: Record<string, string | undefined>): SupabaseConfigResult {
  const url = (overrideEnv?.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const publishableKey =
    (overrideEnv?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.trim() ||
    (overrideEnv?.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

  // Ninguna clave secreta puede llevar prefijo NEXT_PUBLIC_, sin importar
  // qué variable se haya efectivamente configurado. Cada nombre se chequea
  // por separado (literal) — ver nota de arriba sobre por qué no se itera
  // con acceso dinámico.
  const leakedServiceRoleKey =
    overrideEnv?.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  const leakedSecretKey = overrideEnv?.NEXT_PUBLIC_SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY;
  const leakedSecret = overrideEnv?.NEXT_PUBLIC_SUPABASE_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_SECRET;
  if (leakedServiceRoleKey) {
    return {
      status: "invalid",
      reason: "Se encontró NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: la service_role nunca va en una variable NEXT_PUBLIC_.",
    };
  }
  if (leakedSecretKey) {
    return {
      status: "invalid",
      reason: "Se encontró NEXT_PUBLIC_SUPABASE_SECRET_KEY: ninguna clave secreta puede llevar el prefijo NEXT_PUBLIC_.",
    };
  }
  if (leakedSecret) {
    return {
      status: "invalid",
      reason: "Se encontró NEXT_PUBLIC_SUPABASE_SECRET: ninguna clave secreta puede llevar el prefijo NEXT_PUBLIC_.",
    };
  }

  if (!url && !publishableKey) return { status: "absent" };

  if (!url) return { status: "invalid", reason: "Falta NEXT_PUBLIC_SUPABASE_URL." };
  if (!publishableKey) {
    return {
      status: "invalid",
      reason: "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o, como alias legacy, NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    };
  }
  if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url)) {
    return { status: "invalid", reason: `NEXT_PUBLIC_SUPABASE_URL no parece una URL de Supabase válida: "${url}".` };
  }
  const lowerKey = publishableKey.toLowerCase();
  if (SECRET_KEY_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
    return {
      status: "invalid",
      reason:
        "La clave configurada tiene forma de clave secreta (service_role / sb_secret_...), no de clave publicable. " +
        "Nunca uses una clave secreta en variables NEXT_PUBLIC_.",
    };
  }
  if (publishableKey.length < 20) {
    return { status: "invalid", reason: "La clave publicable parece incompleta o inválida." };
  }

  return { status: "ok", config: { url, publishableKey } };
}

/**
 * Fábrica del cliente tipado. Centraliza la única llamada a `createClient`
 * de todo el proyecto — el adaptador Supabase y cualquier código futuro que
 * necesite Supabase directo debe importar de acá, nunca instanciar su
 * propio cliente.
 */
export function createTypedSupabaseClient(config: SupabaseConfig): TypedSupabaseClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let sharedClient: TypedSupabaseClient | null = null;
let sharedConfigKey = "";

/**
 * Auth y persistencia deben usar exactamente la misma instancia. Dos
 * clientes con la misma storage key pueden leer el mismo localStorage, pero
 * no comparten de forma fiable el estado en memoria inmediatamente después
 * de un signIn/signOut; eso hacía que pedidos y carrito aparecieran recién
 * al recargar.
 */
export function getTypedSupabaseClient(config: SupabaseConfig): TypedSupabaseClient {
  const configKey = `${config.url}::${config.publishableKey}`;
  if (!sharedClient || sharedConfigKey !== configKey) {
    sharedClient = createTypedSupabaseClient(config);
    sharedConfigKey = configKey;
  }
  return sharedClient;
}
