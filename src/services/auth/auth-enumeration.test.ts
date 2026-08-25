import { describe, expect, it, vi } from "vitest";
import { createSupabaseAuthAdapter } from "./supabase-auth-adapter";
import { localAuthAdapter } from "./local-auth-adapter";
import { EmailConfirmationRequiredError } from "./types";
import type { TypedSupabaseClient } from "@/services/persistence/supabase/client";

/**
 * Regresión: el formulario de registro no puede funcionar como oráculo de
 * qué emails son clientes. Supabase ya evita filtrarlo (devuelve un alta
 * "exitosa" con `identities` vacío); el código lo deshacía con un mensaje
 * "Ya existe una cuenta con ese email".
 *
 * El criterio verificado acá es más fuerte que "no dice que existe": las
 * salidas de ambos casos tienen que ser INDISTINGUIBLES entre sí.
 */

type Case = { label: string; identities: unknown[] };

function fakeClient(identities: unknown[]) {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signUp: vi.fn(async (): Promise<{ data: { user: unknown; session: unknown }; error: unknown }> => ({
      data: { user: { id: "u1", identities }, session: null },
      error: null,
    })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    resend: vi.fn(async () => ({ data: {}, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
  };
  const client = { auth, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
  return { client: client as unknown as TypedSupabaseClient, auth };
}

async function captureOutcome(identities: unknown[]) {
  const { client } = fakeClient(identities);
  const adapter = createSupabaseAuthAdapter(client);
  try {
    await adapter.signUpCustomer("Ana", "ana@test.com", "clave123");
    return { kind: "resolved" as const, name: "", message: "" };
  } catch (error) {
    const err = error as Error;
    return { kind: "rejected" as const, name: err.name, message: err.message };
  }
}

describe("el alta no revela si un email ya está registrado", () => {
  const cases: Case[] = [
    { label: "email nuevo", identities: [{ id: "identity-1" }] },
    { label: "email ya registrado", identities: [] },
  ];

  it("ambos casos producen exactamente el mismo resultado observable", async () => {
    const [nuevo, existente] = await Promise.all(cases.map((c) => captureOutcome(c.identities)));
    expect(existente).toEqual(nuevo);
  });

  it("el mensaje es condicional, nunca afirma que la cuenta se creó ni que existe", async () => {
    const outcome = await captureOutcome([]);
    expect(outcome.name).toBe("EmailConfirmationRequiredError");
    expect(outcome.message).toMatch(/si el email está disponible/i);
    expect(outcome.message).not.toMatch(/ya existe|cuenta creada|registrado|está en uso/i);
  });

  it("un error de 'email ya registrado' del backend tampoco se filtra al usuario", async () => {
    const { client, auth } = fakeClient([]);
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: Object.assign(new Error("User already registered"), { code: "email_exists" }),
    });
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.signUpCustomer("Ana", "ana@test.com", "clave123")).rejects.toThrow(
      EmailConfirmationRequiredError,
    );
  });

  it("el adaptador local se comporta igual que el de Supabase", async () => {
    // El store local vive en localStorage; sin shim no persiste entre
    // llamadas y el alta duplicada no se detectaría.
    const store = new Map<string, string>();
    // Shim mínimo de window para el entorno node de vitest.
    globalThis.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    } as unknown as Window & typeof globalThis;
    const email = `dup-${Date.now()}@test.com`;
    await localAuthAdapter.signUpCustomer("Juan", email, "clave123");
    let caught: Error | null = null;
    try {
      await localAuthAdapter.signUpCustomer("Otro", email, "otraclave");
    } catch (error) {
      caught = error as Error;
    }
    expect(caught?.name).toBe("EmailConfirmationRequiredError");
    expect(caught?.message).not.toMatch(/ya existe/i);
  });
});

describe("recuperación y reenvío tampoco enumeran", () => {
  it("requestPasswordReset no distingue un email registrado de uno que no", async () => {
    const { client, auth } = fakeClient([]);
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.requestPasswordReset("existe@test.com", "https://x/y")).resolves.toBeUndefined();
    await expect(adapter.requestPasswordReset("no-existe@test.com", "https://x/y")).resolves.toBeUndefined();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });

  it("resendCustomerConfirmation no distingue tampoco", async () => {
    const { client, auth } = fakeClient([]);
    const adapter = createSupabaseAuthAdapter(client);
    await expect(adapter.resendCustomerConfirmation("existe@test.com", "https://x/y")).resolves.toBeUndefined();
    await expect(adapter.resendCustomerConfirmation("no-existe@test.com", "https://x/y")).resolves.toBeUndefined();
    expect(auth.resend).toHaveBeenCalledTimes(2);
  });

  it("ninguna pantalla de auth muestra un texto que confirme la existencia de la cuenta", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const screens = ["registro", "recuperar-clave", "confirmar-cuenta", "login"];
    for (const screen of screens) {
      const source = readFileSync(join(process.cwd(), `src/app/${screen}/page.tsx`), "utf8");
      expect(source, `${screen} filtra existencia`).not.toMatch(/Ya existe una cuenta|ese email ya|no está registrado|cuenta no encontrada/i);
    }
  });
});
