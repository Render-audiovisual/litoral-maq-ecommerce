import { beforeEach, describe, expect, it } from "vitest";
import {
  hasPasswordRecoveryIntent,
  isRecoveryHash,
  markPasswordRecovery,
  resetPasswordRecoveryIntent,
} from "./password-recovery";

/**
 * Regresión: `/restablecer-clave` aceptaba el cambio con cualquier sesión
 * abierta. Alcanzaba con una sesión olvidada en una máquina compartida para
 * cambiar la contraseña sin conocer la anterior ni pasar por el email.
 *
 * ALCANCE DE ESTOS TESTS: cubren el comportamiento de la PANTALLA. No
 * prueban —ni pueden probar— que la API de Supabase rechace un
 * `updateUser({ password })` hecho desde la consola con una sesión común:
 * eso depende de "Secure password change" en el proyecto, que hoy está sin
 * verificar. No tomar el verde de acá como "el riesgo está cerrado".
 */
describe("detección del enlace de recuperación", () => {
  beforeEach(() => resetPasswordRecoveryIntent(false));

  it("reconoce el fragmento que manda Supabase en el flujo implícito", () => {
    expect(isRecoveryHash("#access_token=abc&expires_in=3600&type=recovery")).toBe(true);
    expect(isRecoveryHash("#type=recovery")).toBe(true);
    expect(isRecoveryHash("#type=recovery&access_token=abc")).toBe(true);
  });

  it("no confunde otros flujos de email con recuperación", () => {
    expect(isRecoveryHash("#access_token=abc&type=signup")).toBe(false);
    expect(isRecoveryHash("#access_token=abc&type=magiclink")).toBe(false);
    expect(isRecoveryHash("#type=invite")).toBe(false);
  });

  it("acceso directo, sin fragmento, no habilita el cambio", () => {
    expect(isRecoveryHash("")).toBe(false);
    expect(isRecoveryHash("#")).toBe(false);
    expect(hasPasswordRecoveryIntent()).toBe(false);
  });

  it("no se deja engañar por un type=recovery embebido en otro valor", () => {
    expect(isRecoveryHash("#next=/x?type=recoveryX")).toBe(false);
    expect(isRecoveryHash("#custom_type=recovery")).toBe(false);
  });

  it("el evento PASSWORD_RECOVERY habilita el cambio aunque el hash ya haya sido consumido", () => {
    expect(hasPasswordRecoveryIntent()).toBe(false);
    markPasswordRecovery();
    expect(hasPasswordRecoveryIntent()).toBe(true);
  });
});

describe("la pantalla exige el flujo de recuperación", () => {
  it("restablecer-clave consulta la intención antes de aceptar el cambio", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/app/restablecer-clave/page.tsx"), "utf8");
    expect(source).toMatch(/hasPasswordRecoveryIntent\(\)/);
    // El guard tiene que estar en el submit, no solo en el render: si solo
    // se ocultara el formulario, seguiría siendo alcanzable por otras vías.
    const submitBlock = source.slice(source.indexOf("async function submit"), source.indexOf("if (fromRecovery"));
    expect(submitBlock).toMatch(/hasPasswordRecoveryIntent\(\)/);
  });

  it("no se migró a PKCE, que rompería el sitio estático", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const client = readFileSync(join(process.cwd(), "src/services/persistence/supabase/client.ts"), "utf8");
    // PKCE exige un handler de servidor que llame a exchangeCodeForSession;
    // con output: "export" no existe ese lugar. Ver password-recovery.ts.
    expect(client).not.toMatch(/flowType:\s*["']pkce["']/);
  });
});
