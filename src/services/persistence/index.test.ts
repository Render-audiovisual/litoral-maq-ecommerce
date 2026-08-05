import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPersistenceAdapter, resetPersistenceAdapterCache } from "./index";

const ENV_KEYS = [
  "NEXT_PUBLIC_PERSISTENCE_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

describe("getPersistenceAdapter", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetPersistenceAdapterCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    resetPersistenceAdapterCache();
  });

  it("sin NEXT_PUBLIC_PERSISTENCE_PROVIDER, devuelve el adaptador local (comportamiento activo hoy)", async () => {
    const adapter = getPersistenceAdapter();
    // El adaptador local resuelve sin red: si esto no revienta, es Local.
    await expect(adapter.listCustomers()).resolves.toEqual([]);
  });

  it("variables de Supabase presentes pero sin PROVIDER=supabase explícito → sigue en Local (sin auto-detección implícita)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmno.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_" + "a".repeat(20);
    const adapter = getPersistenceAdapter();
    await expect(adapter.listCustomers()).resolves.toEqual([]);
  });

  it("NEXT_PUBLIC_PERSISTENCE_PROVIDER=local fuerza Local aunque haya variables de Supabase válidas", async () => {
    process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER = "local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmno.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_" + "a".repeat(20);
    const adapter = getPersistenceAdapter();
    await expect(adapter.listCustomers()).resolves.toEqual([]);
  });

  it("PROVIDER=supabase con configuración inválida FALLA de forma visible (no cae a Local en silencio)", () => {
    process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmno.supabase.co";
    // falta la key a propósito
    expect(() => getPersistenceAdapter()).toThrowError(/configuración es inválida/);
  });

  it("PROVIDER=supabase sin ninguna variable también falla de forma visible", () => {
    process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER = "supabase";
    expect(() => getPersistenceAdapter()).toThrowError(/Faltan NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("el error de configuración inválida menciona el rollback explícito a local", () => {
    process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER = "supabase";
    expect(() => getPersistenceAdapter()).toThrowError(/NEXT_PUBLIC_PERSISTENCE_PROVIDER=local/);
  });

  it("devuelve siempre la misma instancia cacheada entre llamadas", () => {
    const first = getPersistenceAdapter();
    const second = getPersistenceAdapter();
    expect(first).toBe(second);
  });
});
