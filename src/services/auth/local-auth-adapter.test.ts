import { beforeEach, describe, expect, it } from "vitest";
import { localAuthAdapter } from "./local-auth-adapter";
import { EmailConfirmationRequiredError } from "./types";

function installLocalStorageShim() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  // @ts-expect-error shim mínimo de window para el entorno de test (sin jsdom)
  globalThis.window = { localStorage };
}

describe("localAuthAdapter", () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  it("registro nuevo crea cuenta con rol customer y permite loguearse después", async () => {
    const signUpSession = await localAuthAdapter.signUpCustomer("Juan Pérez", "Juan@Test.com", "clave123");
    expect(signUpSession.user.role).toBe("customer");
    expect(signUpSession.user.email).toBe("juan@test.com");

    const signInSession = await localAuthAdapter.signInCustomer("JUAN@TEST.COM", "clave123");
    expect(signInSession.user.id).toBe(signUpSession.user.id);
  });

  it("un registro repetido no crea cuenta pero tampoco revela que el email existe", async () => {
    await localAuthAdapter.signUpCustomer("Juan", "juan@test.com", "clave123");
    await expect(localAuthAdapter.signUpCustomer("Otro", " Juan@Test.com ", "otraclave")).rejects.toThrow(
      EmailConfirmationRequiredError,
    );
    // La clave original sigue siendo la válida: el segundo alta no pisó nada.
    const session = await localAuthAdapter.signInCustomer("juan@test.com", "clave123");
    expect(session.user.name).toBe("Juan");
  });

  it("rechaza el registro con el email reservado del admin", async () => {
    await expect(localAuthAdapter.signUpCustomer("Admin Falso", "admin@litoralmaq.com", "clave123")).rejects.toThrow(
      /reservado/,
    );
  });

  it("login con contraseña incorrecta da error genérico y no crea sesión", async () => {
    await localAuthAdapter.signUpCustomer("Juan", "juan@test.com", "clave123");
    await expect(localAuthAdapter.signInCustomer("juan@test.com", "mala")).rejects.toThrow(
      "Email o contraseña incorrectos.",
    );
  });

  it("login con email inexistente da el mismo error genérico (no filtra si el email existe)", async () => {
    await expect(localAuthAdapter.signInCustomer("no-existe@test.com", "cualquiera")).rejects.toThrow(
      "Email o contraseña incorrectos.",
    );
  });

  it("rechaza el email admin en el login público", async () => {
    await expect(localAuthAdapter.signInCustomer("admin@litoralmaq.com", "admin123")).rejects.toThrow(
      /acceso administrativo/,
    );
  });

  it("signInAdmin acepta la credencial correcta y rechaza cualquier otra", async () => {
    const session = await localAuthAdapter.signInAdmin("admin@litoralmaq.com", "admin123");
    expect(session.user.role).toBe("admin");
    await expect(localAuthAdapter.signInAdmin("admin@litoralmaq.com", "mala")).rejects.toThrow(
      "Credenciales de administrador incorrectas.",
    );
    await expect(localAuthAdapter.signInAdmin("juan@test.com", "clave123")).rejects.toThrow(
      "Credenciales de administrador incorrectas.",
    );
  });

  it("signOut no lanza", async () => {
    await expect(localAuthAdapter.signOut()).resolves.toBeUndefined();
  });
});
