import { describe, expect, it } from "vitest";
import {
  authCallbackUrl,
  AUTH_CALLBACK_PATHS,
  AUTH_ORIGINS,
  developmentRedirectUrls,
  productionRedirectUrls,
  SITE_URL,
} from "./auth-callbacks";
import { friendlyAuthError, isRateLimitError } from "./auth-errors";

describe("URLs de callback de Supabase Auth", () => {
  it("arma la URL de confirmación sobre el origen recibido", () => {
    expect(authCallbackUrl("emailConfirmed", "https://litoralmaqrender.rendercorrientes.com")).toBe(
      "https://litoralmaqrender.rendercorrientes.com/login?confirmed=1",
    );
  });

  it("arma la URL de recuperación sobre el origen recibido", () => {
    expect(authCallbackUrl("passwordRecovery", "http://localhost:3000")).toBe(
      "http://localhost:3000/restablecer-clave",
    );
  });

  it("tolera un origen con barra final", () => {
    expect(authCallbackUrl("passwordRecovery", "https://x.com/")).toBe("https://x.com/restablecer-clave");
  });

  it("la lista de producción cubre solo las rutas exactas de producción", () => {
    const urls = productionRedirectUrls();
    expect(urls).toEqual([
      "https://litoralmaqrender.rendercorrientes.com/login?confirmed=1",
      "https://litoralmaqrender.rendercorrientes.com/restablecer-clave",
    ]);
  });

  it("producción NO autoriza localhost: un token de email no puede ir a una app local", () => {
    for (const url of productionRedirectUrls()) {
      expect(url).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0/);
      expect(url.startsWith("https://"), `${url} no es HTTPS`).toBe(true);
    }
  });

  it("producción no usa comodines: un '**' abriría el retorno a cualquier ruta", () => {
    for (const url of productionRedirectUrls()) {
      expect(url).not.toContain("*");
    }
  });

  it("la lista de desarrollo es separada y ahí sí va localhost", () => {
    const urls = developmentRedirectUrls();
    expect(urls).toEqual([
      "http://localhost:3000/login?confirmed=1",
      "http://localhost:3000/restablecer-clave",
    ]);
  });

  it("las dos listas no se solapan", () => {
    const prod = new Set(productionRedirectUrls());
    for (const url of developmentRedirectUrls()) expect(prod.has(url)).toBe(false);
  });

  it("staging se suma a la lista de desarrollo, nunca a la de producción", () => {
    const dev = developmentRedirectUrls(["https://staging.example.com"]);
    expect(dev).toContain("https://staging.example.com/restablecer-clave");
    expect(dev).toHaveLength(4);
    expect(productionRedirectUrls()).toHaveLength(2);
  });

  it("el Site URL es el de producción vigente", () => {
    expect(SITE_URL).toBe(AUTH_ORIGINS.production);
    expect(SITE_URL).toBe("https://litoralmaqrender.rendercorrientes.com");
  });

  it("ninguna pantalla arma su callback a mano", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const screen of ["registro", "recuperar-clave", "confirmar-cuenta"]) {
      const source = readFileSync(join(process.cwd(), `src/app/${screen}/page.tsx`), "utf8");
      expect(source, `${screen} concatena la URL a mano`).not.toMatch(
        /window\.location\.origin\}\/(login|restablecer)/,
      );
      expect(source).toMatch(/authCallbackUrl\(/);
    }
  });

  it("las rutas declaradas existen como páginas", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const path of Object.values(AUTH_CALLBACK_PATHS)) {
      const route = path.split("?")[0];
      expect(existsSync(join(process.cwd(), `src/app${route}/page.tsx`)), `falta ${route}`).toBe(true);
    }
  });
});

describe("errores de auth mostrados al usuario", () => {
  it("detecta el rate limit de GoTrue en sus variantes", () => {
    expect(isRateLimitError(new Error("For security purposes, you can only request this after 47 seconds"))).toBe(true);
    expect(isRateLimitError(new Error("email rate limit exceeded"))).toBe(true);
    expect(isRateLimitError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
  });

  it("nunca devuelve el texto crudo de Supabase", () => {
    const crudo = "For security purposes, you can only request this after 47 seconds";
    const shown = friendlyAuthError(new Error(crudo));
    expect(shown).not.toBe(crudo);
    expect(shown).not.toMatch(/security purposes|seconds/i);
    expect(shown).toMatch(/esperá/i);
  });

  it("un error cualquiera cae en el fallback dado, sin filtrar el mensaje interno", () => {
    const shown = friendlyAuthError(new Error("column profiles.foo does not exist"), "Mensaje neutro.");
    expect(shown).toBe("Mensaje neutro.");
  });
});
