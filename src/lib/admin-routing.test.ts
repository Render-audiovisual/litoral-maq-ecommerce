import { describe, expect, it } from "vitest";
import { isAdminLoginPath, normalizeAdminPath } from "./admin-routing";

describe("admin routing", () => {
  it("reconoce el login con o sin barra final", () => {
    expect(isAdminLoginPath("/admin/login")).toBe(true);
    expect(isAdminLoginPath("/admin/login/")).toBe(true);
    expect(isAdminLoginPath("/admin/login///")).toBe(true);
  });

  it("no confunde otras rutas del panel con el login", () => {
    expect(isAdminLoginPath("/admin")).toBe(false);
    expect(isAdminLoginPath("/admin/pedidos/")).toBe(false);
  });

  it("conserva la raíz y normaliza rutas internas", () => {
    expect(normalizeAdminPath("/")).toBe("/");
    expect(normalizeAdminPath("/admin/pedidos/")).toBe("/admin/pedidos");
  });
});
