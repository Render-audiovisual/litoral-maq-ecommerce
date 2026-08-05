import { describe, expect, it } from "vitest";
import {
  getAdminUrl,
  getStoreUrl,
  readAdminDomain,
  readDomainConfig,
  readStoreDomain,
} from "./domain-config";

describe("readStoreDomain / readAdminDomain", () => {
  it("sin la variable, status 'unset' (caso normal en desarrollo local)", () => {
    expect(readStoreDomain({})).toEqual({ status: "unset" });
    expect(readAdminDomain({})).toEqual({ status: "unset" });
  });

  it("acepta un dominio sin protocolo y lo normaliza a https://", () => {
    const result = readStoreDomain({ NEXT_PUBLIC_STORE_DOMAIN: "www.litoralmaq.com" });
    expect(result).toEqual({ status: "ok", url: "https://www.litoralmaq.com" });
  });

  it("acepta un dominio con protocolo explícito", () => {
    const result = readAdminDomain({ NEXT_PUBLIC_ADMIN_DOMAIN: "https://admin.litoralmaq.com" });
    expect(result).toEqual({ status: "ok", url: "https://admin.litoralmaq.com" });
  });

  it("recorta espacios en blanco", () => {
    const result = readStoreDomain({ NEXT_PUBLIC_STORE_DOMAIN: "  www.litoralmaq.com  " });
    expect(result).toEqual({ status: "ok", url: "https://www.litoralmaq.com" });
  });

  it("rechaza un valor sin forma de dominio (sin punto)", () => {
    const result = readStoreDomain({ NEXT_PUBLIC_STORE_DOMAIN: "localhost" });
    expect(result.status).toBe("invalid");
  });

  it("rechaza un valor con ruta (debe ser solo el dominio)", () => {
    const result = readStoreDomain({ NEXT_PUBLIC_STORE_DOMAIN: "www.litoralmaq.com/productos" });
    expect(result.status).toBe("invalid");
  });

  it("rechaza un valor con query string", () => {
    const result = readAdminDomain({ NEXT_PUBLIC_ADMIN_DOMAIN: "admin.litoralmaq.com?x=1" });
    expect(result.status).toBe("invalid");
  });

  it("rechaza texto que no forma una URL válida", () => {
    const result = readStoreDomain({ NEXT_PUBLIC_STORE_DOMAIN: "http://" });
    expect(result.status).toBe("invalid");
  });
});

describe("readDomainConfig", () => {
  it("sin ninguna variable, unset-store", () => {
    expect(readDomainConfig({})).toEqual({ status: "unset-store" });
  });

  it("con solo STORE_DOMAIN, unset-admin", () => {
    const result = readDomainConfig({ NEXT_PUBLIC_STORE_DOMAIN: "www.litoralmaq.com" });
    expect(result).toEqual({ status: "unset-admin" });
  });

  it("ambas configuradas y válidas, ok con las dos URLs", () => {
    const result = readDomainConfig({
      NEXT_PUBLIC_STORE_DOMAIN: "www.litoralmaq.com",
      NEXT_PUBLIC_ADMIN_DOMAIN: "admin.litoralmaq.com",
    });
    expect(result).toEqual({
      status: "ok",
      storeUrl: "https://www.litoralmaq.com",
      adminUrl: "https://admin.litoralmaq.com",
    });
  });

  it("mismo dominio en ambas variables, same-domain (configuración contradictoria)", () => {
    const result = readDomainConfig({
      NEXT_PUBLIC_STORE_DOMAIN: "litoralmaq.com",
      NEXT_PUBLIC_ADMIN_DOMAIN: "litoralmaq.com",
    });
    expect(result).toEqual({ status: "same-domain", url: "https://litoralmaq.com" });
  });

  it("una variable inválida se reporta antes que 'unset' de la otra", () => {
    const result = readDomainConfig({ NEXT_PUBLIC_STORE_DOMAIN: "no es una url" });
    expect(result.status).toBe("invalid");
  });
});

describe("getStoreUrl / getAdminUrl", () => {
  it("sin configurar, devuelve ruta relativa (funciona en el mismo origen)", () => {
    expect(getStoreUrl("/productos", {})).toBe("/productos");
    expect(getAdminUrl("/admin/pedidos", {})).toBe("/admin/pedidos");
  });

  it("agrega la barra inicial si falta", () => {
    expect(getStoreUrl("productos", {})).toBe("/productos");
  });

  it("con dominio configurado, arma la URL absoluta", () => {
    expect(getStoreUrl("/productos", { NEXT_PUBLIC_STORE_DOMAIN: "www.litoralmaq.com" })).toBe(
      "https://www.litoralmaq.com/productos",
    );
    expect(getAdminUrl("/admin/login", { NEXT_PUBLIC_ADMIN_DOMAIN: "admin.litoralmaq.com" })).toBe(
      "https://admin.litoralmaq.com/admin/login",
    );
  });

  it("path por defecto: '/' para tienda, '/admin' para admin", () => {
    expect(getStoreUrl(undefined, { NEXT_PUBLIC_STORE_DOMAIN: "www.litoralmaq.com" })).toBe(
      "https://www.litoralmaq.com/",
    );
    expect(getAdminUrl(undefined, { NEXT_PUBLIC_ADMIN_DOMAIN: "admin.litoralmaq.com" })).toBe(
      "https://admin.litoralmaq.com/admin",
    );
  });

  it("con variable presente pero inválida, lanza en vez de armar un link roto", () => {
    expect(() => getStoreUrl("/", { NEXT_PUBLIC_STORE_DOMAIN: "no-es-dominio" })).toThrow(
      /Configuración de dominio inválida/,
    );
    expect(() => getAdminUrl("/admin", { NEXT_PUBLIC_ADMIN_DOMAIN: "http://" })).toThrow(
      /Configuración de dominio inválida/,
    );
  });
});
