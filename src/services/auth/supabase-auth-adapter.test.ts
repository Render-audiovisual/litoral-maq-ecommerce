import { describe, expect, it, vi } from "vitest";
import { createSupabaseAuthAdapter } from "./supabase-auth-adapter";
import type { TypedSupabaseClient } from "@/services/persistence/supabase/client";
import { EmailConfirmationRequiredError } from "./types";

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

  it("signUpCustomer con sesión anónima activa CONVIERTE la cuenta en el mismo uid (no crea una nueva)", async () => {
    const { client, auth, profileMap } = createFakeClient([
      { id: "anon-1", role: "customer", name: null, email: null, is_anonymous: true },
    ]);
    auth.getSession
      .mockResolvedValueOnce({ data: { session: fakeAuthSession("anon-1", true) }, error: null })
      .mockResolvedValueOnce({ data: { session: fakeAuthSession("anon-1", false) }, error: null });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "anon-1" } }, error: null });
    const adapter = createSupabaseAuthAdapter(client);
    const session = await adapter.signUpCustomer("Ana", "ana@test.com", "clave123");
    expect(session.user.id).toBe("anon-1");
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(profileMap.get("anon-1")?.is_anonymous).toBe(false);
    expect(profileMap.get("anon-1")?.email).toBe("ana@test.com");
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
    await expect(adapter.signUpCustomer("Ana", "ana-existente@test.com", "clave123")).rejects.toThrow(
      EmailConfirmationRequiredError,
    );
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
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@test.com", {
      redirectTo: "https://tienda.test/restablecer-clave",
    });
    expect(auth.resend).toHaveBeenCalledWith({
      type: "signup", email: "ana@test.com", options: { emailRedirectTo: "https://tienda.test/login?confirmed=1" },
    });
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
});
