import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthAdapter } from "@/services/adapters";
import { localAuthAdapter } from "./local-auth-adapter";
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

describe("no se ofrece OAuth sin OAuth real", () => {
  it("el contrato AuthAdapter no expone un login social", () => {
    const contract = readFileSync(join(process.cwd(), "src/services/adapters.ts"), "utf8");
    const authBlock = contract.slice(contract.indexOf("interface AuthAdapter"));
    expect(authBlock).not.toMatch(/signInCustomerWith(Google|Facebook|Apple|Github)/);
  });

  it("ningún adaptador implementa un login social", () => {
    for (const file of ADAPTER_SOURCES) {
      expect(sourceOf(file)).not.toMatch(/signInCustomerWith(Google|Facebook|Apple|Github)/);
    }
  });

  it("la pantalla de login no ofrece un botón de proveedor social", () => {
    const login = readFileSync(join(process.cwd(), "src/app/login/page.tsx"), "utf8");
    // Si algún día hay OAuth real, este test debe actualizarse junto con la
    // configuración del proveedor en Supabase — nunca antes.
    expect(login).not.toMatch(/Continuar con (Google|Facebook|Apple)/i);
    expect(login).not.toMatch(/button google/);
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
    expect(extra).toEqual(["ensureGuestSession", "restoreSession"]);
  });

  it("local no agrega métodos que supabase no tenga", () => {
    const supabase = createSupabaseAuthAdapter(stubClient);
    const extra = methodsOf(localAuthAdapter).filter((name) => !methodsOf(supabase).includes(name));
    expect(extra).toEqual([]);
  });
});
