import { describe, expect, it, vi } from "vitest";
import { createSupabaseAuthAdapter } from "./supabase-auth-adapter";
import type { TypedSupabaseClient } from "@/services/persistence/supabase/client";
import { EmailConfirmationRequiredError, IdentityAlreadyLinkedError } from "./types";

type ProfileRow = {
  id: string;
  role: "admin" | "customer";
  name: string | null;
  email: string | null;
  is_anonymous: boolean;
};

class FakeProfilesBuilder {
  private id: string | null = null;
  private patch: Record<string, unknown> | null = null;
  constructor(private profiles: Map<string, ProfileRow>) {}
  select() {
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.patch = patch;
    return this;
  }
  eq(_column: string, value: string) {
    this.id = value;
    if (this.patch && this.id) {
      const existing = this.profiles.get(this.id);
      if (existing) this.profiles.set(this.id, { ...existing, ...this.patch } as ProfileRow);
    }
    return this;
  }
  async maybeSingle() {
    return { data: this.id ? (this.profiles.get(this.id) ?? null) : null, error: null };
  }
}

type FakeAuth = {
  getSession: ReturnType<typeof vi.fn>;
  signInWithPassword: ReturnType<typeof vi.fn>;
  signUp: ReturnType<typeof vi.fn>;
  signInAnonymously: ReturnType<typeof vi.fn>;
  signInWithOAuth: ReturnType<typeof vi.fn>;
  linkIdentity: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  resetPasswordForEmail: ReturnType<typeof vi.fn>;
  resend: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
};

function createFakeClient(profiles: ProfileRow[] = []) {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const auth: FakeAuth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: new Error("no mockeado") })),
    signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: new Error("no mockeado") })),
    signInAnonymously: vi.fn(async () => ({ data: { session: null }, error: new Error("no mockeado") })),
    // Las dos formas de Google: sin sesión (o con cuenta permanente) y
    // desde una sesión de invitado. Devuelven la URL a la que el navegador
    // sería redirigido — en el test nadie navega.
    signInWithOAuth: vi.fn(async () => ({
      data: { provider: "google", url: "https://accounts.google.test" },
      error: null,
    })),
    linkIdentity: vi.fn(async () => ({
      data: { provider: "google", url: "https://accounts.google.test" },
      error: null,
    })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: new Error("no mockeado") })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    resend: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    // El adaptador se suscribe al crearse para detectar PASSWORD_RECOVERY.
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
  };
  const client = {
    auth,
    from(table: string) {
      if (table !== "profiles") throw new Error(`tabla inesperada en el mock: ${table}`);
      return new FakeProfilesBuilder(profileMap);
    },
  };
  return { client: client as unknown as TypedSupabaseClient, auth, profileMap };
}

function fakeAuthSession(userId: string, isAnonymous = false) {
  return {
    access_token: `token-${userId}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, is_anonymous: isAnonymous },
  };
}

describe("supabaseAuthAdapter", () => {
  it("ensureGuestSession crea una identidad anónima real cuando no hay sesión", async () => {
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.signInAnonymously.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.ensureGuestSession();
    expect(session.user.id).toBe("anon-1");
    expect(session.user.isAnonymous).toBe(true);
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("ensureGuestSession reutiliza una sesión anónima existente sin crear otra", async () => {
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.ensureGuestSession();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signInCustomer devuelve la sesión cuando las credenciales son correctas", async () => {
    const { client, auth } = createFakeClient([
      { id: "user-1", role: "customer", name: "Juan", email: "juan@test.com", is_anonymous: false },
    ]);
    auth.signInWithPassword.mockResolvedValue({ data: { session: fakeAuthSession("user-1") }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.signInCustomer("juan@test.com", "clave123");
    expect(session.user.id).toBe("user-1");
    expect(session.user.role).toBe("customer");
  });

  it("signInCustomer rechaza credenciales inválidas con error genérico", async () => {
    const { client, auth } = createFakeClient();
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error("Invalid credentials") });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signInCustomer("juan@test.com", "mala")).rejects.toThrow(
      "Email o contraseña incorrectos.",
    );
  });

  it("signInCustomer rechaza y cierra la sesión si el perfil resulta admin", async () => {
    const { client, auth } = createFakeClient([
      { id: "admin-1", role: "admin", name: "Admin", email: "admin@litoralmaq.com", is_anonymous: false },
    ]);
    auth.signInWithPassword.mockResolvedValue({ data: { session: fakeAuthSession("admin-1") }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signInCustomer("admin@litoralmaq.com", "admin123")).rejects.toThrow(
      /acceso administrativo/,
    );
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("signInAdmin acepta solo perfiles con role='admin' y rechaza el resto", async () => {
    const { client, auth } = createFakeClient([
      { id: "user-1", role: "customer", name: "Juan", email: "juan@test.com", is_anonymous: false },
    ]);
    auth.signInWithPassword.mockResolvedValue({ data: { session: fakeAuthSession("user-1") }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signInAdmin("juan@test.com", "clave123")).rejects.toThrow(
      "Credenciales de administrador incorrectas.",
    );
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("signUpCustomer sin sesión previa crea una cuenta nueva (rol customer, vía el trigger)", async () => {
    const { client, auth, profileMap } = createFakeClient();
    profileMap.set("new-user", { id: "new-user", role: "customer", name: "Ana", email: "ana@test.com", is_anonymous: false });
    auth.signUp.mockResolvedValue({
      data: { user: { id: "new-user", identities: [{ id: "x" }] }, session: fakeAuthSession("new-user") },
      error: null,
    });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.signUpCustomer("Ana", "ana@test.com", "clave123");
    expect(session.user.id).toBe("new-user");
    expect(session.user.role).toBe("customer");
  });

  it("signUpCustomer responde igual ante un email ya registrado (identities vacío), sin revelarlo", async () => {
    const { client, auth } = createFakeClient();
    auth.signUp.mockResolvedValue({ data: { user: { id: "x", identities: [] }, session: null }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signUpCustomer("Ana", "ana@test.com", "clave123")).rejects.toThrow(
      EmailConfirmationRequiredError,
    );
  });

  it("signUpCustomer informa explícitamente cuando falta confirmar el email", async () => {
    const { client, auth } = createFakeClient();
    auth.signUp.mockResolvedValue({
      data: { user: { id: "new-user", identities: [{ id: "x" }] }, session: null }, error: null,
    });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signUpCustomer("Ana", "ana@test.com", "clave123", "https://tienda.test/login"))
      .rejects.toMatchObject({ name: "EmailConfirmationRequiredError", email: "ana@test.com" });
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: "https://tienda.test/login" }),
    }));
  });

  it("el registro público nunca pide el rol: lo fija el trigger de la base", async () => {
    const { client, auth, profileMap } = createFakeClient();
    profileMap.set("new-user", { id: "new-user", role: "customer", name: "Ana", email: "ana@test.com", is_anonymous: false });
    auth.signUp.mockResolvedValue({
      data: { user: { id: "new-user", identities: [{ id: "x" }] }, session: fakeAuthSession("new-user") },
      error: null,
    });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.signUpCustomer("Ana", "ana@test.com", "clave123");
    const [payload] = auth.signUp.mock.calls[0] as [Record<string, unknown>];
    expect(JSON.stringify(payload)).not.toMatch(/role/i);
    expect(session.user.role).toBe("customer");
  });

  it("signUpCustomer con sesión anónima activa NO da de alta un uid nuevo", async () => {
    // Un signUp con la sesión de invitado viva crearía otro usuario y
    // reemplazaría la sesión: los pedidos del invitado quedarían bajo un
    // uid inalcanzable. La conversión va por linkEmailToGuestAccount.
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signUpCustomer("Ana", "ana@test.com", "clave123")).rejects.toThrow(/invitado/i);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("conversión de invitado: vincula el email al MISMO uid y todavía no fija contraseña", async () => {
    // Secuencia documentada por Supabase: primero updateUser({ email }) y
    // verificación por correo; la contraseña recién después. Mandarla acá
    // la fijaría sobre un email que nadie confirmó.
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "anon-1" } }, error: null });
    const adapter = createSupabaseAuthAdapter(client);

    await adapter.linkEmailToGuestAccount("Ana", " ANA@Test.com ", "https://tienda.test/crear-clave");

    expect(auth.signUp).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: "ana@test.com", data: { name: "Ana" } },
      { emailRedirectTo: "https://tienda.test/crear-clave" },
    );
    const [attributes] = auth.updateUser.mock.calls[0] as [Record<string, unknown>];
    expect(attributes).not.toHaveProperty("password");
  });

  it("conversión de invitado: email ya tomado por otra cuenta se rechaza, sin fusionar por email", async () => {
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("User already registered"), { code: "email_exists" }),
    });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(
      adapter.linkEmailToGuestAccount("Ana", "ana-existente@test.com", "https://tienda.test/crear-clave"),
    ).rejects.toThrow(EmailConfirmationRequiredError);
    // Ni se cierra la sesión de invitado ni se toca ningún pedido.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("conversión de invitado: no corre sobre una cuenta que ya es permanente", async () => {
    const { client, auth } = createFakeClient([
      { id: "user-1", role: "customer", name: "Juan", email: "juan@test.com", is_anonymous: false },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("user-1", false) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(
      adapter.linkEmailToGuestAccount("Juan", "otro@test.com", "https://tienda.test/crear-clave"),
    ).rejects.toThrow(/sesión de invitado/i);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("Google sin sesión usa signInWithOAuth con el callback recibido", async () => {
    const { client, auth } = createFakeClient();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.startGoogleSignIn("https://tienda.test/auth/callback");
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://tienda.test/auth/callback" },
    });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it("Google con sesión de invitado usa linkIdentity: conserva el uid y sus pedidos", async () => {
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.startGoogleSignIn("https://tienda.test/auth/callback");
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://tienda.test/auth/callback" },
    });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("Google con cuenta permanente vuelve a signInWithOAuth", async () => {
    const { client, auth } = createFakeClient([
      { id: "user-1", role: "customer", name: "Juan", email: "juan@test.com", is_anonymous: false },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("user-1", false) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.startGoogleSignIn("https://tienda.test/auth/callback");
    expect(auth.signInWithOAuth).toHaveBeenCalledOnce();
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it("una identidad de Google que ya es de otra cuenta no transfiere nada ni cierra la sesión", async () => {
    const { client, auth } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
    auth.linkIdentity.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Identity is already linked to another user"), {
        code: "identity_already_exists",
      }),
    });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.startGoogleSignIn("https://tienda.test/auth/callback")).rejects.toThrow(
      IdentityAlreadyLinkedError,
    );
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signOut delega en el cliente", async () => {
    const { client, auth } = createFakeClient();
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("envía recuperación de contraseña y reenvío de confirmación con redirects seguros", async () => {
    const { client, auth } = createFakeClient();
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.requestPasswordReset(" ANA@Test.com ", "https://tienda.test/restablecer-clave");
    await adapter.resendCustomerConfirmation(" ANA@Test.com ", "https://tienda.test/login?confirmed=1");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "ana@test.com",
      expect.objectContaining({ redirectTo: "https://tienda.test/restablecer-clave" }),
    );
    expect(auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "signup",
        email: "ana@test.com",
        options: expect.objectContaining({ emailRedirectTo: "https://tienda.test/login?confirmed=1" }),
      }),
    );
  });

  it("actualiza la contraseña y el cierre de sesión limpia solo el cliente local", async () => {
    const { client, auth } = createFakeClient();
    auth.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await adapter.updateCustomerPassword("nueva-clave");
    await adapter.signOut();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "nueva-clave" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("restoreSession devuelve la sesión viva (con el token ya refrescado por el SDK) cuando existe", async () => {
    const { client, auth } = createFakeClient([
      { id: "user-1", role: "customer", name: "Juan", email: "juan@test.com", is_anonymous: false },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("user-1") }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.restoreSession();
    expect(session?.user.id).toBe("user-1");
    expect(session?.user.role).toBe("customer");
  });

  it("restoreSession devuelve la sesión de admin cuando el perfil vivo es admin", async () => {
    const { client, auth } = createFakeClient([
      { id: "admin-1", role: "admin", name: "Admin", email: "admin@litoralmaq.com", is_anonymous: false },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("admin-1") }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.restoreSession();
    expect(session?.user.role).toBe("admin");
  });

  it("isAnonymous sale del usuario de Auth, no de un perfil todavía sin sincronizar", async () => {
    // Justo después de confirmar el email, auth.users ya dice permanente y
    // la fila de profiles puede ir un tick atrás (la sincroniza el trigger
    // de la migración 0009). Si mandara el perfil, el header seguiría
    // diciendo "Ingresar" con la cuenta ya creada.
    const { client, auth } = createFakeClient([
      { id: "user-1", role: "customer", name: "Ana", email: "ana@test.com", is_anonymous: true },
    ]);
    auth.getSession.mockResolvedValue({ data: { session: fakeAuthSession("user-1", false) }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.restoreSession();
    expect(session?.user.isAnonymous).toBe(false);
  });

  it("restoreSession devuelve null sin sesión activa", async () => {
    const { client, auth } = createFakeClient();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.restoreSession()).resolves.toBeNull();
  });

  it("restoreSession devuelve null si el cliente reporta error", async () => {
    const { client, auth } = createFakeClient();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error("network") });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.restoreSession()).resolves.toBeNull();
  });

  describe("captcha (Cloudflare Turnstile)", () => {
    it("el token viaja a todos los endpoints protegidos de GoTrue", async () => {
      const { client, auth, profileMap } = createFakeClient([
        { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
      ]);
      profileMap.set("user-1", {
        id: "user-1", role: "customer", name: "Juan", email: "juan@test.com", is_anonymous: false,
      });
      auth.signInAnonymously.mockResolvedValue({ data: { session: fakeAuthSession("anon-1", true) }, error: null });
      auth.signInWithPassword.mockResolvedValue({ data: { session: fakeAuthSession("user-1") }, error: null });
      const adapter = createSupabaseAuthAdapter(client);

      await adapter.ensureGuestSession("tok-anon");
      await adapter.signInCustomer("juan@test.com", "clave123", "tok-login");
      await adapter.requestPasswordReset("juan@test.com", "https://tienda.test/restablecer-clave", "tok-reset");
      await adapter.resendCustomerConfirmation("juan@test.com", "https://tienda.test/login?confirmed=1", "tok-resend");

      expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "tok-anon" } });
      expect(auth.signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ options: { captchaToken: "tok-login" } }),
      );
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "juan@test.com",
        expect.objectContaining({ captchaToken: "tok-reset" }),
      );
      expect(auth.resend).toHaveBeenCalledWith(
        expect.objectContaining({ options: expect.objectContaining({ captchaToken: "tok-resend" }) }),
      );
    });

    it("el registro manda el token junto con el redirect de confirmación", async () => {
      const { client, auth } = createFakeClient();
      auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      auth.signUp.mockResolvedValue({
        data: { user: { id: "u", identities: [{ id: "x" }] }, session: null }, error: null,
      });
      const adapter = createSupabaseAuthAdapter(client);
      await expect(
        adapter.signUpCustomer("Ana", "ana@test.com", "clave123", "https://tienda.test/login?confirmed=1", "tok-signup"),
      ).rejects.toThrow(EmailConfirmationRequiredError);
      expect(auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({ options: expect.objectContaining({ captchaToken: "tok-signup" }) }),
      );
    });

    it("un captcha ausente o vencido explica qué hacer, sin el texto crudo de GoTrue", async () => {
      const { client, auth } = createFakeClient();
      const captchaFailure = Object.assign(
        new Error("captcha protection: request disallowed (invalid-input-response)"),
        { code: "captcha_failed" },
      );
      auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: captchaFailure });
      auth.signInAnonymously.mockResolvedValue({ data: { session: null }, error: captchaFailure });
      auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: captchaFailure });
      const adapter = createSupabaseAuthAdapter(client);

      await expect(adapter.signInCustomer("juan@test.com", "clave123")).rejects.toThrow(/verificación de seguridad/i);
      await expect(adapter.ensureGuestSession()).rejects.toThrow(/verificación de seguridad/i);
      await expect(adapter.signUpCustomer("Ana", "ana@test.com", "clave123")).rejects.toThrow(
        /verificación de seguridad/i,
      );
      // El detalle interno de Cloudflare/GoTrue no llega a la pantalla.
      await expect(adapter.signInCustomer("juan@test.com", "clave123")).rejects.not.toThrow(
        /invalid-input-response/,
      );
    });
  });
});
