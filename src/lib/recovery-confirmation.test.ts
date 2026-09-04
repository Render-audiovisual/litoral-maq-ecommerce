import { describe, expect, it } from "vitest";
import { safeRecoveryConfirmationUrl } from "./recovery-confirmation";

const SUPABASE_URL = "https://bhtaecnzpuotlsenbdlz.supabase.co";
const VALID_URL =
  `${SUPABASE_URL}/auth/v1/verify?token=hash-seguro&type=recovery&redirect_to=` +
  encodeURIComponent("https://litoralmaq.com/restablecer-clave");

describe("safeRecoveryConfirmationUrl", () => {
  it("acepta únicamente un enlace de recuperación del proyecto esperado", () => {
    expect(safeRecoveryConfirmationUrl(VALID_URL, SUPABASE_URL)).toBe(VALID_URL);
  });

  it.each([
    null,
    "https://evil.example/auth/v1/verify?token=x&type=recovery",
    `${SUPABASE_URL}/auth/v1/verify?token=x&type=signup`,
    `${SUPABASE_URL}/auth/v1/verify?type=recovery`,
    `${SUPABASE_URL}/otra-ruta?token=x&type=recovery`,
    `http://bhtaecnzpuotlsenbdlz.supabase.co/auth/v1/verify?token=x&type=recovery`,
  ])("rechaza enlaces ausentes, externos o incompletos", (value) => {
    expect(safeRecoveryConfirmationUrl(value, SUPABASE_URL)).toBeNull();
  });
});
