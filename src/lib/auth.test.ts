import { describe, expect, it } from "vitest";
import {
  createExpiry,
  isAnonymousSession,
  isPermanentCustomerSession,
  isSessionExpired,
  isValidAdminSession,
  isValidCustomerSession,
} from "./auth";
import type { Session } from "./types";

function session(overrides: Partial<Session["user"]> = {}, expiresAt = createExpiry()): Session {
  return {
    user: { id: "u-1", name: "Ana", email: "ana@test.com", role: "customer", ...overrides },
    token: "t",
    expiresAt,
  };
}

describe("invitado vs. cuenta permanente", () => {
  /**
   * La distinción existe porque un invitado de Supabase SÍ tiene sesión
   * válida (signInAnonymously): puede ver su pedido en este navegador. Lo
   * que no tiene es cuenta. Confundir las dos cosas fue lo que hacía que el
   * header saludara con un nombre vacío.
   */
  it("una sesión anónima es una sesión de cliente válida, pero no una cuenta", () => {
    const guest = session({ name: "", email: "", isAnonymous: true });
    expect(isValidCustomerSession(guest)).toBe(true);
    expect(isAnonymousSession(guest)).toBe(true);
    expect(isPermanentCustomerSession(guest)).toBe(false);
  });

  it("una cuenta permanente pasa las tres", () => {
    const account = session({ isAnonymous: false });
    expect(isValidCustomerSession(account)).toBe(true);
    expect(isAnonymousSession(account)).toBe(false);
    expect(isPermanentCustomerSession(account)).toBe(true);
  });

  it("sin sesión no hay ni invitado ni cuenta", () => {
    expect(isAnonymousSession(null)).toBe(false);
    expect(isPermanentCustomerSession(null)).toBe(false);
  });

  it("el adaptador local, sin identidad anónima, cuenta como permanente", () => {
    // Ahí `isAnonymous` ni siquiera existe: no hay invitados con sesión.
    expect(isPermanentCustomerSession(session())).toBe(true);
  });

  it("una sesión vencida no es cuenta permanente aunque no sea anónima", () => {
    const expired = session({ isAnonymous: false }, Date.now() - 1000);
    expect(isSessionExpired(expired)).toBe(true);
    expect(isPermanentCustomerSession(expired)).toBe(false);
  });

  it("un admin nunca pasa por cliente ni al revés", () => {
    const admin = session({ role: "admin" });
    expect(isValidAdminSession(admin)).toBe(true);
    expect(isValidCustomerSession(admin)).toBe(false);
    expect(isPermanentCustomerSession(admin)).toBe(false);
    expect(isValidAdminSession(session())).toBe(false);
  });

  it("una sesión con expiresAt corrupto se trata como vencida", () => {
    const corrupted = { ...session(), expiresAt: "mañana" } as unknown as Session;
    expect(isSessionExpired(corrupted)).toBe(true);
    expect(isPermanentCustomerSession(corrupted)).toBe(false);
  });
});
