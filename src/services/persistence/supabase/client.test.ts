import { describe, expect, it } from "vitest";
import { readSupabaseConfig } from "./client";

describe("readSupabaseConfig", () => {
  it("sin ninguna variable → absent (modo local, sin error)", () => {
    expect(readSupabaseConfig({})).toEqual({ status: "absent" });
  });

  it("con las dos variables válidas → ok", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40),
    });
    expect(result.status).toBe("ok");
  });

  it("falta la key → invalid con motivo claro", () => {
    const result = readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co" });
    expect(result.status).toBe("invalid");
    expect(result).toMatchObject({ reason: expect.stringContaining("PUBLISHABLE_KEY") });
  });

  it("acepta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY como opción principal", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "a".repeat(20),
    });
    expect(result.status).toBe("ok");
  });

  it("rechaza una clave con forma de clave secreta aunque venga en la variable pública", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_" + "a".repeat(20),
    });
    expect(result.status).toBe("invalid");
  });

  it("rechaza NEXT_PUBLIC_SUPABASE_SECRET_KEY sin mirar su valor", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "a".repeat(20),
      NEXT_PUBLIC_SUPABASE_SECRET_KEY: "b".repeat(20),
    });
    expect(result.status).toBe("invalid");
  });

  it("falta la url → invalid con motivo claro", () => {
    const result = readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40) });
    expect(result).toEqual({ status: "invalid", reason: "Falta NEXT_PUBLIC_SUPABASE_URL." });
  });

  it("url con formato inválido → invalid", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://no-es-supabase.example.com",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40),
    });
    expect(result.status).toBe("invalid");
  });

  it("key demasiado corta → invalid", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "corta",
    });
    expect(result.status).toBe("invalid");
  });

  it("rechaza una service_role pegada por error en variable pública", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmno.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40),
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
    });
    expect(result.status).toBe("invalid");
  });
});
