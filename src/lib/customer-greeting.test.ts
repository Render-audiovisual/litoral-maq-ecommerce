import { describe, expect, it } from "vitest";
import { customerGreeting } from "./customer-greeting";

describe("customer greeting", () => {
  it("uses the first name, preserving accents", () => {
    expect(customerGreeting(" Agustín  Obregón ")).toBe("Hola, Agustín");
    expect(customerGreeting("Ana María Pérez")).toBe("Hola, Ana");
  });
  it("never uses an email as a greeting or invents a name", () => {
    expect(customerGreeting("")).toBe("Hola");
    expect(customerGreeting("   ")).toBe("Hola");
    expect(customerGreeting("persona@example.com")).toBe("Hola");
  });
});
