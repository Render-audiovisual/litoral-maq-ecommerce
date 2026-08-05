import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAuthAdapter, resetAuthAdapterCache } from "./index";

const ENV_KEYS = [
  "NEXT_PUBLIC_PERSISTENCE_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

describe("getAuthAdapter", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetAuthAdapterCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    resetAuthAdapterCache();
  });

  it("sin configurar, devuelve el adaptador local", async () => {
    const adapter = getAuthAdapter();
    await expect(adapter.signInAdmin("admin@litoralmaq.com", "admin123")).resolves.toMatchObject({
      user: { role: "admin" },
    });
  });

  it("PROVIDER=local fuerza local aunque haya variables de Supabase", () => {
    process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER = "local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmno.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_" + "a".repeat(20);
    expect(() => getAuthAdapter()).not.toThrow();
  });

  it("PROVIDER=supabase con configuración inválida falla de forma visible, no cae a local", () => {
    process.env.NEXT_PUBLIC_PERSISTENCE_PROVIDER = "supabase";
    expect(() => getAuthAdapter()).toThrowError(/configuración es inválida/);
  });

  it("devuelve siempre la misma instancia cacheada", () => {
    const first = getAuthAdapter();
    const second = getAuthAdapter();
    expect(first).toBe(second);
  });
});
