import { describe, expect, it } from "vitest";
import { formatPaymentSummary } from "./payment-summary";
import { formatCurrency } from "./utils";

describe("formatPaymentSummary", () => {
  it("dice cuántas cuotas y de cuánto", () => {
    expect(formatPaymentSummary({ installments: 3, installmentAmount: 50000 }))
      .toBe(`3 cuotas de ${formatCurrency(50000)}`);
  });

  // El importe de cada cuota lo informa Mercado Pago y ya trae el interés:
  // dividir el total por la cantidad de cuotas mostraría menos de lo que el
  // cliente realmente paga por mes.
  it("usa el importe de cuota que informa Mercado Pago, no el total dividido", () => {
    expect(formatPaymentSummary({ installments: 6, installmentAmount: 22000, total: 120000 }))
      .toBe(`6 cuotas de ${formatCurrency(22000)}`);
  });

  it("si no vino el importe de cuota lo estima con el total", () => {
    expect(formatPaymentSummary({ installments: 2, total: 100000 }))
      .toBe(`2 cuotas de ${formatCurrency(50000)}`);
  });

  it("en un pago sin cuotas nombra el medio en vez de decir '1 cuota'", () => {
    expect(formatPaymentSummary({ installments: 1, paymentTypeId: "credit_card" }))
      .toBe("Mercado Pago (crédito)");
    expect(formatPaymentSummary({ installments: 1, paymentTypeId: "debit_card" }))
      .toBe("Mercado Pago (débito)");
    expect(formatPaymentSummary({ paymentTypeId: "ticket" }))
      .toBe("Mercado Pago (efectivo)");
    expect(formatPaymentSummary({ paymentTypeId: "bank_transfer" }))
      .toBe("Mercado Pago (transferencia)");
    expect(formatPaymentSummary({ paymentTypeId: "account_money" }))
      .toBe("Mercado Pago (dinero en cuenta)");
  });

  it("con un medio que no conocemos no inventa: dice solo Mercado Pago", () => {
    expect(formatPaymentSummary({ paymentTypeId: "crypto_transfer" })).toBe("Mercado Pago");
    expect(formatPaymentSummary({})).toBe("Mercado Pago");
  });

  it("no muestra nada si el pago todavía no se acreditó", () => {
    expect(formatPaymentSummary(undefined)).toBe("");
  });
});
