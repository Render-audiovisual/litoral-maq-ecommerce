import { describe, expect, it } from "vitest";
import { isAdminSurface } from "@/lib/site-surface";

describe("isAdminSurface", () => {
  it("reconoce las rutas administrativas", () => {
    expect(isAdminSurface("/admin", "litoralmaq.com")).toBe(true);
    expect(isAdminSurface("/admin/pedidos", "litoralmaq.com")).toBe(true);
  });

  it("reconoce la raíz servida desde el subdominio admin", () => {
    expect(isAdminSurface("/", "admin.litoralmaq.com", "admin.litoralmaq.com")).toBe(true);
  });

  it("mantiene la navegación comercial en la tienda", () => {
    expect(isAdminSurface("/", "litoralmaq.com", "admin.litoralmaq.com")).toBe(false);
    expect(isAdminSurface("/productos", "litoralmaq.com", "admin.litoralmaq.com")).toBe(false);
  });

  it("falla de forma segura si el dominio configurado es inválido", () => {
    expect(isAdminSurface("/", "admin.litoralmaq.com", "http://")).toBe(false);
  });
});
