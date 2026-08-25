import type { Session } from "@/lib/types";
import type { AuthAdapter } from "@/services/adapters";

export type { AuthAdapter };

/**
 * Salida neutra del alta de cuenta. El mensaje NO afirma que la cuenta se
 * haya creado: se usa igual cuando el email es nuevo y cuando ya estaba
 * registrado, para que el formulario de registro no sirva como oráculo de
 * qué emails son clientes.
 */
export class EmailConfirmationRequiredError extends Error {
  constructor(public readonly email: string) {
    super(
      "Si el email está disponible, te enviamos un enlace para confirmarlo. " +
        "Si ya tenés una cuenta, ingresá con tu contraseña.",
    );
    this.name = "EmailConfirmationRequiredError";
  }
}

/**
 * Capacidad extra que solo tiene sentido con una identidad real detrás
 * (Supabase Auth vía signInAnonymously): crear o reutilizar una sesión de
 * invitado de verdad, con un uid estable, en vez del id determinístico por
 * email (`guest-<email>`) que usa el modelo local/demo. El adaptador local
 * NO la implementa — el modelo de invitado local no necesita sesión.
 */
export interface GuestCapableAuthAdapter extends AuthAdapter {
  ensureGuestSession(): Promise<Session>;
}

export function supportsGuestSessions(adapter: AuthAdapter): adapter is GuestCapableAuthAdapter {
  return typeof (adapter as Partial<GuestCapableAuthAdapter>).ensureGuestSession === "function";
}

/**
 * Capacidad extra que solo tiene sentido con una identidad real detrás: el
 * SDK de Supabase persiste su propia sesión (con refresh token) por fuera
 * de la caché que `store.tsx` guarda en `litoral-customer/admin-session-v1`.
 * Sin esto, esa caché nunca se revalida contra la sesión real — al vencer
 * el `access_token` (client.auth.getSession() ya lo habría refrescado
 * solo), el store la trataría como expirada y forzaría un login
 * innecesario. El adaptador local NO la implementa: ahí la caché del store
 * ES la única fuente de verdad, no hay nada más contra qué revalidar.
 */
export interface SessionRestorableAuthAdapter extends AuthAdapter {
  restoreSession(): Promise<Session | null>;
}

export function supportsSessionRestore(adapter: AuthAdapter): adapter is SessionRestorableAuthAdapter {
  return typeof (adapter as Partial<SessionRestorableAuthAdapter>).restoreSession === "function";
}
