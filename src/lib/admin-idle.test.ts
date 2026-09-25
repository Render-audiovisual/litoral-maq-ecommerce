import { describe, expect, it } from "vitest";
import {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_MAX_SESSION_MS,
  isAdminSessionStale,
} from "./admin-idle";

const now = Date.parse("2026-09-25T12:00:00.000Z");

describe("isAdminSessionStale", () => {
  it("con actividad reciente y dentro del tope, sigue vigente", () => {
    expect(isAdminSessionStale(now - 60_000, now - 60 * 60 * 1000, now)).toBe(false);
  });

  it("vence tras 8 horas sin actividad", () => {
    expect(isAdminSessionStale(now - ADMIN_IDLE_TIMEOUT_MS + 1, now - 9 * 3_600_000, now)).toBe(false);
    expect(isAdminSessionStale(now - ADMIN_IDLE_TIMEOUT_MS, now - 9 * 3_600_000, now)).toBe(true);
  });

  it("vence a las 24 horas del ingreso aunque haya actividad", () => {
    expect(isAdminSessionStale(now, now - ADMIN_MAX_SESSION_MS + 1, now)).toBe(false);
    expect(isAdminSessionStale(now, now - ADMIN_MAX_SESSION_MS, now)).toBe(true);
  });
});
