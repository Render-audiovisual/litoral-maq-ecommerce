import { formatCurrency } from "./utils";

export type PaymentSummaryInput = {
  installments?: number | null;
  /** Importe de cada cuota tal como lo informa Mercado Pago: ya incluye el interés. */
  installmentAmount?: number | null;
  paymentTypeId?: string | null;
  total?: number | null;
};

// Los nombres que usa Mercado Pago en payment_type_id, en criollo.
const MEDIOS: Record<string, string> = {
  credit_card: "crédito",
  debit_card: "débito",
  prepaid_card: "tarjeta prepaga",
  ticket: "efectivo",
  bank_transfer: "transferencia",
  account_money: "dinero en cuenta",
};

/** Una línea corta para el cliente: "3 cuotas de $ 50.000,00" o "Mercado Pago (débito)". */
export function formatPaymentSummary(input: PaymentSummaryInput | undefined | null) {
  if (!input) return "";
  const { installments, installmentAmount, paymentTypeId, total } = input;
  if (installments && installments > 1) {
    // Preferimos el importe que informa Mercado Pago: dividir el total mostraría
    // la cuota sin interés, que no es lo que termina pagando el cliente.
    const cuota = installmentAmount ?? (typeof total === "number" ? total / installments : null);
    if (cuota !== null) return `${installments} cuotas de ${formatCurrency(cuota)}`;
    return `${installments} cuotas`;
  }
  const medio = paymentTypeId ? MEDIOS[paymentTypeId] : undefined;
  return medio ? `Mercado Pago (${medio})` : "Mercado Pago";
}
