import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthAdapter } from "@/services/adapters";
import { localAuthAdapter } from "./local-auth-adapter";
import { supportsOAuth } from "./types";
import { createSupabaseAuthAdapter } from "./supabase-auth-adapter";
import type { TypedSupabaseClient } from "@/services/persistence/supabase/client";

/**
 * Regresión de seguridad — P0 del 2026-08-25.
 *
 * El login tenía un botón "Continuar con Google" que no usaba OAuth: ambos
 * adaptadores autenticaban contra UNA cuenta compartida con email y clave
 * fijos, escritos en el código de un repositorio público. Todo cliente que
 * lo usara entraba a la misma cuenta y veía los pedidos de los demás.
 *
 * Estos tests fallan si algo de eso vuelve a aparecer. No prueban una
 * feature: prueban que una clase de error no regrese.
 */

const AUTH_DIR = join(process.cwd(), "src/services/auth");
const sourceOf = (file: string) => readFileSync(join(AUTH_DIR, file), "utf8");

const ADAPTER_SOURCES = [
  "local-auth-adapter.ts",
  "supabase-auth-adapter.ts",
  "index.ts",
  "types.ts",
] as const;

describe("ningún adaptador trae credenciales de cuenta fijas", () => {
  it.each(ADAPTER_SOURCES)("%s no declara una contraseña literal", (file) => {
    const source = sourceOf(file);
    // Cualquier constante cuyo nombre sugiera una clave y tenga un literal
    // asignado. ADMIN_PASSWORD del adaptador local queda excluido a
    // propósito: es la credencial del modo demo sin Supabase detrás, ya
    // documentada como tal en el README y sin cuenta real asociada.
    const literalPasswords = [...source.matchAll(/const\s+(\w*(?:PASSWORD|SECRET|TOKEN|APIKEY)\w*)\s*=\s*["'`]/gi)]
      .map((match) => match[1])
      .filter((name) => name !== "ADMIN_PASSWORD");
    expect(literalPasswords).toEqual([]);
  });

  it.each(ADAPTER_SOURCES)("%s no declara un email de cuenta compartida", (file) => {
    const source = sourceOf(file);
    // Un email literal en un adaptador solo puede ser el del admin demo
    // local; cualquier otro es una cuenta compartida encubierta.
    const emails = [...source.matchAll(/["'`]([\w.+-]+@[\w.-]+\.\w+)["'`]/g)]
      .map((match) => match[1])
      .filter((email) => email !== "admin@litoralmaq.com");
    expect(emails).toEqual([]);
  });

  it("no queda ningún rastro del perfil demo de Google", () => {
    for (const file of ADAPTER_SOURCES) {
      expect(sourceOf(file)).not.toMatch(/GOOGLE_DEMO|cliente\.demo/i);
    }
  });
});

describe("el login social es OAuth real, nunca una cuenta compartida", () => {
  /**
   * El botón volvió, pero ahora sí hay OAuth detrás. Lo que estos tests
   * fijan es la diferencia entre las dos cosas: que el ingreso con Google
   * pase por Supabase (`signInWithOAuth` / `linkIdentity`) y que el botón
   * no exista cuando el proveedor activo no tiene OAuth.
   */
  it("el adaptador Supabase usa OAuth de Supabase, no un login inventado", () => {
    const source = sourceOf("supabase-auth-adapter.ts");
    expect(source).toMatch(/client\.auth\.signInWithOAuth\(\{ provider: "google"/);
    expect(source).toMatch(/client\.auth\.linkIdentity\(\{ provider: "google"/);
  });

  it("ningún adaptador implementa un login social a mano", () => {
    for (const file of ADAPTER_SOURCES) {
      expect(sourceOf(file)).not.toMatch(/signInCustomerWith(Google|Facebook|Apple|Github)/);
    }
  });

  it("el adaptador local NO ofrece Google: sin OAuth real no hay botón", () => {
    expect(supportsOAuth(localAuthAdapter)).toBe(false);
  });

  it("el botón de Google se esconde solo cuando el proveedor no soporta OAuth", () => {
    const button = readFileSync(join(process.cwd(), "src/components/google-button.tsx"), "utf8");
    expect(button).toMatch(/if \(!supportsOAuth\(adapter\)\) return null;/);
  });

  it("ninguna pantalla pública ofrece un acceso etiquetado DEMO", () => {
    const screens = ["src/app/login/page.tsx", "src/app/registro/page.tsx"];
    for (const screen of screens) {
      const source = readFileSync(join(process.cwd(), screen), "utf8");
      expect(source).not.toMatch(/<b>DEMO<\/b>/i);
    }
  });
});

describe("los dos proveedores exponen exactamente la misma superficie", () => {
  /**
   * La causa raíz de fondo: `local` y `supabase` podían divergir en
   * silencio. Un método que existiera solo en uno hacía que el modo demo
   * "funcionara" y el real fallara en producción — o al revés, que el demo
   * tapara un agujero que el real abría. El contrato tiene que ser idéntico.
   */
  const stubClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { session: null }, error: new Error("stub") }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  } as unknown as TypedSupabaseClient;

  const methodsOf = (adapter: AuthAdapter) => {
    const own = Object.keys(adapter);
    return own.filter((key) => typeof (adapter as unknown as Record<string, unknown>)[key] === "function").sort();
  };

  it("el adaptador local implementa todo el contrato AuthAdapter", () => {
    const required: (keyof AuthAdapter)[] = [
      "signInCustomer",
      "signUpCustomer",
      "signInAdmin",
      "requestPasswordReset",
      "resendCustomerConfirmation",
      "updateCustomerPassword",
      "signOut",
    ];
    for (const method of required) {
      expect(typeof localAuthAdapter[method]).toBe("function");
    }
  });

  it("supabase no agrega métodos de autenticación que local no tenga", () => {
    const supabase = createSupabaseAuthAdapter(stubClient);
    const extra = methodsOf(supabase).filter((name) => !methodsOf(localAuthAdapter).includes(name));
    // Las únicas diferencias aceptadas son capacidades declaradas por
    // interfaz y detectadas con un type guard (ver types.ts), nunca un
    // método de login que exista en un proveedor y en el otro no.
    // Las cuatro dependen de una identidad real de Supabase Auth: sesión
    // anónima, su conversión, OAuth y la sesión persistida por el SDK.
    expect(extra).toEqual([
      "ensureGuestSession",
      "linkEmailToGuestAccount",
      "restoreSession",
      "startGoogleSignIn",
    ]);
  });

  it("local no agrega métodos que supabase no tenga", () => {
    const supabase = createSupabaseAuthAdapter(stubClient);
    const extra = methodsOf(localAuthAdapter).filter((name) => !methodsOf(supabase).includes(name));
    expect(extra).toEqual([]);
  });
});
