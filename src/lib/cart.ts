import type { CartLine } from "@/lib/types";

/** Combina el carrito local y el remoto sin duplicar cantidades al reingresar. */
export function mergeCartLines(local: CartLine[], remote: CartLine[]): CartLine[] {
  const quantities = new Map<string, number>();
  for (const line of [...remote, ...local]) {
    if (!line.productId || line.quantity <= 0) continue;
    quantities.set(line.productId, Math.max(quantities.get(line.productId) ?? 0, line.quantity));
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}
