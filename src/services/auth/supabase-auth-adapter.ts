import { normalizeEmail } from "@/lib/auth";
import type { Session } from "@/lib/types";
import type { TypedSupabaseClient } from "@/services/persistence/supabase/client";
import { markPasswordRecovery } from "@/lib/password-recovery";
import { EmailConfirmationRequiredError, type GuestCapableAuthAdapter, type SessionRestorableAuthAdapter } from "./types";

const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos.";
const ADMIN_REJECTED_ERROR = "Ese email corresponde al acceso administrativo. Ingresá desde /admin/login.";
const ADMIN_GENERIC_ERROR = "Credenciales de administrador incorrectas.";
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

function sessionFromAuth(
  authSession: { access_token: string; expires_at?: number },
  userId: string,
  profile: { name: string | null; email: string | null; role: ProfileRole; is_anonymous?: boolean },
): Session {
  return {
    user: {
      id: userId,
      name: profile.name ?? "",
      email: profile.email ?? "",
      role: profile.role,
      isAnonymous: profile.is_anonymous ?? false,
    },
    token: authSession.access_token,
    expiresAt: authSession.expires_at ? authSession.expires_at * 1000 : Date.now() + 60 * 60 * 1000,
  };
}

function isEmailAlreadyRegistered(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = (error as { code?: string } | undefined)?.code;
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists")
  );
}

export function createSupabaseAuthAdapter(client: TypedSupabaseClient): GuestCapableAuthAdapter & SessionRestorableAuthAdapter {
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

    async ensureGuestSession() {
      const { data: existing } = await client.auth.getSession();
      if (existing.session) {
        const profile = await fetchProfile(client, existing.session.user.id);
        return sessionFromAuth(existing.session, existing.session.user.id, profile);
      }
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      if (!data.session) throw new Error("No se pudo crear una sesión de invitado.");
      const profile = await fetchProfile(client, data.session.user.id);
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async signInCustomer(email, password) {
      const normalizedEmail = normalizeEmail(email);
      const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error || !data.session) throw new Error(GENERIC_LOGIN_ERROR);
      const profile = await fetchProfile(client, data.session.user.id);
      if (profile.role === "admin") {
        await client.auth.signOut();
        throw new Error(ADMIN_REJECTED_ERROR);
      }
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async signUpCustomer(name, email, password, emailRedirectTo) {
      const normalizedEmail = normalizeEmail(email);
      if (name.trim().length < 2 || !normalizedEmail.includes("@") || password.length < 6) {
        throw new Error("Completá nombre, email válido y una clave de 6 caracteres.");
      }

      // Si ya hay una sesión anónima activa (vino de un carrito de
      // invitado), la convertimos en cuenta permanente EN EL MISMO uid en
      // vez de crear un usuario nuevo — así el historial de pedidos, ya
      // vinculado a ese uid, queda automáticamente asociado sin reasignar
      // nada. Ver supabase/README.md §12 para el detalle del mecanismo.
      const { data: existingSession } = await client.auth.getSession();
      if (existingSession.session?.user.is_anonymous) {
        const { data, error } = await client.auth.updateUser({
          email: normalizedEmail,
          password,
          data: { name: name.trim() },
        });
        if (error) {
          // El email ya pertenece a otra cuenta: la sesión anónima no se
          // convierte (el carrito de invitado no se une a una cuenta ajena
          // solo porque coincide el email), pero la respuesta es la misma
          // que la de un alta normal para no revelar que existe.
          if (isEmailAlreadyRegistered(error)) throw new EmailConfirmationRequiredError(normalizedEmail);
          throw error;
        }
        const userId = data.user.id;
        // Actualizar name/email en profiles explícitamente: el trigger de
        // creación no corre de nuevo en un update de auth.users.
        const { error: profileError } = await client
          .from("profiles")
          .update({ name: name.trim(), email: normalizedEmail, is_anonymous: false })
          .eq("id", userId);
        if (profileError) throw profileError;
        const { data: refreshed, error: refreshError } = await client.auth.getSession();
        if (refreshError || !refreshed.session) {
          throw refreshError ?? new Error("No se pudo obtener la sesión luego de convertir la cuenta.");
        }
        const profile = await fetchProfile(client, userId);
        return sessionFromAuth(refreshed.session, userId, {
          ...profile,
          name: name.trim(),
          email: normalizedEmail,
        });
      }

      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { name: name.trim() }, emailRedirectTo },
      });
      if (error) {
        if (isEmailAlreadyRegistered(error)) throw new EmailConfirmationRequiredError(normalizedEmail);
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

    async signInAdmin(email, password) {
      const normalizedEmail = normalizeEmail(email);
      const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error || !data.session) throw new Error(ADMIN_GENERIC_ERROR);
      const profile = await fetchProfile(client, data.session.user.id);
      if (profile.role !== "admin") {
        await client.auth.signOut();
        throw new Error(ADMIN_GENERIC_ERROR);
      }
      return sessionFromAuth(data.session, data.session.user.id, profile);
    },

    async requestPasswordReset(email, redirectTo) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail.includes("@")) throw new Error("Ingresá un email válido.");
      const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) throw error;
    },

    async resendCustomerConfirmation(email, emailRedirectTo) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail.includes("@")) throw new Error("Ingresá un email válido.");
      const { error } = await client.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo },
      });
      if (error) throw error;
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
