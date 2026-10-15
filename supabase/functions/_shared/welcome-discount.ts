export type PricedLine = { unitPrice: number; quantity: number };
/** Currency is rounded per unit, identically in the UI and Mercado Pago items. */
export function welcomeDiscount<T extends PricedLine>(lines: T[]) {
  let originalCents = 0;
  let discountedCents = 0;
  const items = lines.map((line) => {
    const cents = Math.round(line.unitPrice * 100);
    if (!Number.isFinite(cents) || cents <= 0 || !Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("Importe inválido.");
    const discounted = Math.round(cents * 95 / 100);
    if (discounted <= 0) throw new Error("Importe insuficiente para aplicar el beneficio.");
    originalCents += cents * line.quantity;
    discountedCents += discounted * line.quantity;
    return { ...line, unitPrice: discounted / 100 };
  });
  return { items, amount: (originalCents - discountedCents) / 100, subtotal: discountedCents / 100 };
}
