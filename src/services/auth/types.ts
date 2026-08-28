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
  ensureGuestSession(captchaToken?: string): Promise<Session>;
  /**
   * Paso 1 de 2 de la conversión de invitado a cuenta permanente, en el
   * orden que Supabase documenta hoy: primero se VINCULA el email al mismo
   * `auth.uid()` anónimo y la persona lo confirma desde su correo; recién
   * después se puede establecer la contraseña (`updateCustomerPassword`,
   * paso 2, en `/crear-clave`).
   *
   * El flujo anterior — `updateUser({ email, password })` en una sola
   * llamada — no es el documentado: fijaba una contraseña sobre un email
   * todavía no verificado.
   *
   * No devuelve sesión a propósito: al terminar este paso el usuario SIGUE
   * siendo anónimo hasta que confirme. Sus pedidos ya están bajo ese uid y
   * no se toca ninguno.
   */
  linkEmailToGuestAccount(name: string, email: string, emailRedirectTo: string): Promise<void>;
}

export function supportsGuestSessions(adapter: AuthAdapter): adapter is GuestCapableAuthAdapter {
  return typeof (adapter as Partial<GuestCapableAuthAdapter>).ensureGuestSession === "function";
}

/**
 * Login social REAL (Supabase OAuth), no simulado. Una sola operación a
 * propósito: quien llama no tiene que saber si hay una sesión anónima
 * detrás — el adaptador elige `linkIdentity` (conserva el uid del invitado
 * y con él sus pedidos) o `signInWithOAuth` (sin sesión, o con una cuenta
 * permanente). Decidirlo en la pantalla sería repetir esa lógica en cada
 * botón, y equivocarse una sola vez significa perder el historial de un
 * invitado.
 *
 * Devuelve `void` porque redirige el navegador a Google: no hay sesión que
 * retornar acá, llega en `/auth/callback`.
 */
export interface OAuthCapableAuthAdapter extends AuthAdapter {
  startGoogleSignIn(redirectTo: string): Promise<void>;
}

export function supportsOAuth(adapter: AuthAdapter): adapter is OAuthCapableAuthAdapter {
  return typeof (adapter as Partial<OAuthCapableAuthAdapter>).startGoogleSignIn === "function";
}

/**
 * La identidad de Google que se intentó vincular ya pertenece a otra
 * cuenta. No se fusiona nada ni se destruye la sesión de invitado: la
 * persona tiene que ingresar con esa cuenta.
 */
export class IdentityAlreadyLinkedError extends Error {
  constructor() {
    super(
      "Esa cuenta de Google ya está asociada a otro usuario de Litoral Maq. " +
        "Ingresá con ella para ver sus pedidos.",
    );
    this.name = "IdentityAlreadyLinkedError";
  }
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
