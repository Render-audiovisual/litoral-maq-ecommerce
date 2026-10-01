import { describe, expect, it } from "vitest";
import { adminInitials, resolveAdminDisplayName } from "./admin-names";

describe("resolveAdminDisplayName", () => {
  it("devuelve el nombre asignado a cada cuenta conocida", () => {
    expect(resolveAdminDisplayName("byfranromero@hotmail.com")).toBe("Dev");
    expect(resolveAdminDisplayName("maqlitoral@gmail.com")).toBe("Gonza");
    expect(resolveAdminDisplayName("gabrielespinozaa5@gmail.com")).toBe("Gaby");
  });

  it("no distingue mayúsculas ni espacios", () => {
    expect(resolveAdminDisplayName("  Gabrielespinozaa5@Gmail.com  ")).toBe("Gaby");
  });

  it("una cuenta nueva sin nombre asignado usa la parte antes del @", () => {
    expect(resolveAdminDisplayName("nuevo.empleado@gmail.com")).toBe("nuevo.empleado");
  });

  it("sin email devuelve un nombre genérico", () => {
    expect(resolveAdminDisplayName(undefined)).toBe("Admin");
    expect(resolveAdminDisplayName(null)).toBe("Admin");
    expect(resolveAdminDisplayName("")).toBe("Admin");
  });
});

describe("adminInitials", () => {
  it("toma las dos primeras letras en mayúscula", () => {
    expect(adminInitials("Gaby")).toBe("GA");
    expect(adminInitials("Dev")).toBe("DE");
  });

  it("sin nombre devuelve una A", () => {
    expect(adminInitials("")).toBe("A");
    expect(adminInitials("   ")).toBe("A");
  });
});
