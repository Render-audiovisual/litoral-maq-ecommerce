import { normalizeEmail } from "@/lib/auth";
import type { Session } from "@/lib/types";
import type { TypedSupabaseClient } from "@/services/persistence/supabase/client";
import { markPasswordRecovery } from "@/lib/password-recovery";
import {
  EmailConfirmationRequiredError,
  IdentityAlreadyLinkedError,
  type GuestCapableAuthAdapter,
  type OAuthCapableAuthAdapter,
  type SessionRestorableAuthAdapter,
} from "./types";

const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos.";
const ADMIN_REJECTED_ERROR = "Ese email corresponde al acceso administrativo. Ingresá desde /admin/login.";
const ADMIN_GENERIC_ERROR = "Credenciales de administrador incorrectas.";
const CAPTCHA_REJECTED_ERROR =
  "La verificación de seguridad venció o no se completó. Marcá la casilla de nuevo y reintentá.";
const GUEST_CONVERSION_ERROR =
  "Estás comprando como invitado: para crear tu cuenta primero vinculamos y confirmamos tu email.";
/**
 * Antes acá había un EMAIL_TAKEN_ERROR ("Ya existe una cuenta con ese
 * email"). Supabase evita a propósito confirmar si un email está
 * registrado — devuelve un alta "exitosa" con `identities` vacío — y ese
 * mensaje deshacía la protección: bastaba probar emails en el formulario
 * de registro para saber cuáles son clientes. Ahora todas las salidas del
 * alta son indistinguibles entre sí (ver `auth-enumeration.test.ts`).
 */

type ProfileRole = "admin" | "customer";

async function fetchProfile(client: TypedSupabaseClient, userId: string, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (data) return data;
    // El trigger handle_new_user corre en la misma transacción que el
    // signup — esto es una red de seguridad, no el camino esperado.
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw new Error("No se pudo leer el perfil recién creado. Reintentá en unos segundos.");
}

/**
 * `is_anonymous` sale del usuario de Auth, no del perfil. Son la misma
 * verdad, pero `auth.users` la tiene primero: la fila de `profiles` la
 * recibe por trigger (migración 0009) y, en el instante justo después de
 * confirmar un email, todavía puede estar un tick atrás. Para decidir "esto
 * es una cuenta permanente" manda Auth.
 */
function sessionFromAuth(
  authSession: { access_token: string; expires_at?: number; user?: { is_anonymous?: boolean } },
  userId: string,
  profile: { name: string | null; email: string | null; role: ProfileRole; is_anonymous?: boolean },
): Session {
  return {
    user: {
      id: userId,
      name: profile.name ?? "",
      email: profile.email ?? "",
      role: profile.role,
      isAnonymous: authSession.user?.is_anonymous ?? profile.is_anonymous ?? false,
    },
    token: authSession.access_token,
    expiresAt: authSession.expires_at ? authSession.expires_at * 1000 : Date.now() + 60 * 60 * 1000,
  };
}

function errorCode(error: unknown): string {
  return String((error as { code?: string } | undefined)?.code ?? "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

function isEmailAlreadyRegistered(error: unknown): boolean {
  const message = errorMessage(error);
  const code = errorCode(error);
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists")
  );
}

/** Captcha ausente, vencido o ya usado. GoTrue lo devuelve como 400. */
export function isCaptchaError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    errorCode(error) === "captcha_failed" ||
    message.includes("captcha") ||
    message.includes("verification process failed")
  );
}

/** La identidad social ya pertenece a otro usuario de Supabase. */
export function isIdentityAlreadyLinked(error: unknown): boolean {
  const message = errorMessage(error);
  return errorCode(error) === "identity_already_exists" || message.includes("identity is already linked");
}

function rethrowAuthFailure(error: unknown, fallback: string): never {
  if (isCaptchaError(error)) throw new Error(CAPTCHA_REJECTED_ERROR);
  throw new Error(fallback);
}

export function createSupabaseAuthAdapter(
  client: TypedSupabaseClient,
): GuestCapableAuthAdapter & OAuthCapableAuthAdapter & SessionRestorableAuthAdapter {
  // Señal oficial de que esta navegación viene de un enlace de
  // recuperación. Complementa la lectura del fragmento de URL, que puede
  // haber sido consumido por el SDK antes de que la pantalla monte.
  client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") markPasswordRecovery();
  });

  return {
    async restoreSession() {
      // client.auth.getSession() ya refresca el access_token internamente
      // si venció pero el refresh token sigue vivo — a diferencia de la
      // caché propia del store, que solo conoce el expires_at capturado en
      // el último login. Sin sesión real (nunca hubo, expiró del todo, o
      // fue reemplazada por otro signIn en este mismo cliente), null.
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      const profile = await fetchProfile(client, data.session.user.id);
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async ensureGuestSession(captchaToken) {
      const { data: existing } = await client.auth.getSession();
      if (existing.session) {
        const profile = await fetchProfile(client, existing.session.user.id);
        return sessionFromAuth(existing.session, existing.session.user.id, profile);
      }
      // El invitado crea un usuario REAL en auth.users, así que este
      // endpoint es abusable igual que un registro: va con captcha.
      const { data, error } = await client.auth.signInAnonymously({ options: { captchaToken } });
      if (error) {
        if (isCaptchaError(error)) throw new Error(CAPTCHA_REJECTED_ERROR);
        throw error;
      }
      if (!data.session) throw new Error("No se pudo crear una sesión de invitado.");
      const profile = await fetchProfile(client, data.session.user.id);
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async signInCustomer(email, password, captchaToken) {
      const normalizedEmail = normalizeEmail(email);
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password,
        options: { captchaToken },
      });
      if (error) rethrowAuthFailure(error, GENERIC_LOGIN_ERROR);
      if (!data.session) throw new Error(GENERIC_LOGIN_ERROR);
      const profile = await fetchProfile(client, data.session.user.id);
      if (profile.role === "admin") {
        await client.auth.signOut();
        throw new Error(ADMIN_REJECTED_ERROR);
      }
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async linkEmailToGuestAccount(name, email, emailRedirectTo) {
      const normalizedEmail = normalizeEmail(email);
      if (name.trim().length < 2 || !normalizedEmail.includes("@")) {
        throw new Error("Completá nombre y un email válido.");
      }
      const { data: existing } = await client.auth.getSession();
      if (!existing.session?.user.is_anonymous) {
        throw new Error("Esta pantalla solo convierte una sesión de invitado activa.");
      }

      // Vincula el email al MISMO uid anónimo (Supabase: "Convert an
      // anonymous user to a permanent user" → "Link an email identity").
      // La contraseña NO va acá: para poder fijarla, el email tiene que
      // estar verificado antes. Ese es el paso 2, en /crear-clave.
      const { error } = await client.auth.updateUser(
        { email: normalizedEmail, data: { name: name.trim() } },
        { emailRedirectTo },
      );
      if (!error) return;

      // El email ya pertenece a otra cuenta: la sesión anónima NO se
      // convierte y no se fusiona nada — el historial de invitado no se
      // regala a una cuenta ajena solo porque alguien tipeó su email. La
      // respuesta es igual a la de un alta normal para no revelar que
      // existe.
      if (isEmailAlreadyRegistered(error)) throw new EmailConfirmationRequiredError(normalizedEmail);
      if (isCaptchaError(error)) throw new Error(CAPTCHA_REJECTED_ERROR);
      throw error;
    },

    async signUpCustomer(name, email, password, emailRedirectTo, captchaToken) {
      const normalizedEmail = normalizeEmail(email);
      if (name.trim().length < 2 || !normalizedEmail.includes("@") || password.length < 6) {
        throw new Error("Completá nombre, email válido y una clave de 6 caracteres.");
      }

      // Defensa en profundidad: con una sesión anónima viva, un signUp
      // crearía un uid NUEVO y reemplazaría la sesión — los pedidos del
      // invitado quedarían huérfanos bajo el uid viejo, sin forma de
      // llegar a ellos. La pantalla de registro ya deriva a la conversión
      // (`linkEmailToGuestAccount`); esto corta el caso igual si alguien
      // llega por otro camino.
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user.is_anonymous) throw new Error(GUEST_CONVERSION_ERROR);

      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { name: name.trim() }, emailRedirectTo, captchaToken },
      });
      if (error) {
        if (isEmailAlreadyRegistered(error)) throw new EmailConfirmationRequiredError(normalizedEmail);
        if (isCaptchaError(error)) throw new Error(CAPTCHA_REJECTED_ERROR);
        throw error;
      }
      if (!data.user) throw new Error("No se pudo crear la cuenta.");
      // `identities` vacío = el email ya estaba registrado. Supabase lo
      // devuelve como éxito justamente para no filtrarlo; se respeta esa
      // señal y se responde igual que en un alta pendiente de confirmar.
      if (data.user.identities && data.user.identities.length === 0) {
        throw new EmailConfirmationRequiredError(normalizedEmail);
      }
      if (!data.session) {
        throw new EmailConfirmationRequiredError(normalizedEmail);
      }
      const profile = await fetchProfile(client, data.user.id);
      return sessionFromAuth(data.session, data.user.id, profile);
    },

    async startGoogleSignIn(redirectTo) {
      const { data: existing } = await client.auth.getSession();
      const options = { redirectTo };

      // Invitado anónimo → linkIdentity: la identidad de Google se agrega
      // al MISMO uid, así que sus pedidos siguen siendo suyos. Un
      // signInWithOAuth acá crearía otro usuario y el invitado perdería el
      // pedido que acaba de hacer.
      const { error } = existing.session?.user.is_anonymous
        ? await client.auth.linkIdentity({ provider: "google", options })
        : await client.auth.signInWithOAuth({ provider: "google", options });

      // El caso "esa identidad ya es de otra cuenta" normalmente vuelve por
      // el redirect (lo resuelve /auth/callback), pero linkIdentity también
      // puede rechazarlo acá mismo. En ningún caso se cierra la sesión de
      // invitado ni se mueve un pedido.
      if (error) {
        if (isIdentityAlreadyLinked(error)) throw new IdentityAlreadyLinkedError();
        throw error;
      }
    },

    async signInAdmin(email, password, captchaToken) {
      const normalizedEmail = normalizeEmail(email);
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password,
        options: { captchaToken },
      });
      if (error) rethrowAuthFailure(error, ADMIN_GENERIC_ERROR);
      if (!data.session) throw new Error(ADMIN_GENERIC_ERROR);
      const profile = await fetchProfile(client, data.session.user.id);
      if (profile.role !== "admin") {
        await client.auth.signOut();
        throw new Error(ADMIN_GENERIC_ERROR);
      }
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async requestPasswordReset(email, redirectTo, captchaToken) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail.includes("@")) throw new Error("Ingresá un email válido.");
      const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo, captchaToken });
      if (error) {
        if (isCaptchaError(error)) throw new Error(CAPTCHA_REJECTED_ERROR);
        throw error;
      }
    },

    async resendCustomerConfirmation(email, emailRedirectTo, captchaToken) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail.includes("@")) throw new Error("Ingresá un email válido.");
      const { error } = await client.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo, captchaToken },
      });
      if (error) {
        if (isCaptchaError(error)) throw new Error(CAPTCHA_REJECTED_ERROR);
        throw error;
      }
    },

    async updateCustomerPassword(password) {
      if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },

    async signOut() {
      // scope: "local" asegura limpiar tokens de Supabase del localStorage de
      // este cliente, evitando conflictos entre signOut → signIn repetidos.
      // Sin esto, Supabase Auth mantiene el refresh token y entra en conflicto
      // cuando el usuario intenta loguear nuevamente — la sesión vieja
      // interfiere con el nuevo login.
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
  };
}
