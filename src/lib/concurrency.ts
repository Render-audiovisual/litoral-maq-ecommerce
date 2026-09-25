import type { Product } from "./types";

/**
 * Varias personas usan el panel a la vez. Un guardado nunca pisa lo que
 * cambió otra: los productos mandan solo los campos tocados con un control de
 * versión (`updated_at`) y los pedidos exigen el estado que la persona veía.
 * Si la base no confirma, se recarga la versión vigente y se avisa.
 */

export const PRODUCT_CONFLICT_MESSAGE =
  "Otra persona modificó este producto mientras lo editabas. Ya cargamos su versión: revisá los cambios y volvé a guardar.";

export const PRODUCT_DELETED_MESSAGE =
  "Otra persona eliminó este producto mientras lo editabas.";

export function orderConflictMessage(
  currentLabel: string,
  subject: "El pedido" | "El pago del pedido" = "El pedido",
) {
  return `${subject} ya cambió a «${currentLabel}» (lo movió otra persona). Revisá el estado y volvé a intentar.`;
}

/** La base no aplicó el cambio porque otra persona llegó antes. */
export class ConflictError<T> extends Error {
  constructor(
    message: string,
    readonly latest: T | undefined,
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

// El id identifica la fila y updatedAt es la versión: nunca viajan como cambio.
const NOT_PATCHABLE: ReadonlySet<string> = new Set(["id", "updatedAt"]);

/** Campos que la persona cambió respecto de la copia que abrió. */
export function changedProductFields(
  original: Product,
  edited: Product,
): Partial<Product> {
  const changes: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(original), ...Object.keys(edited)]);
  for (const key of keys) {
    if (NOT_PATCHABLE.has(key)) continue;
    const before = original[key as keyof Product];
    const after = edited[key as keyof Product];
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[key] = after;
  }
  return changes as Partial<Product>;
}

/**
 * Tras un conflicto: la versión vigente de la base con los cambios sin guardar
 * de la persona encima, para que no pierda lo que escribió.
 */
export function rebaseProductEdits(
  fresh: Product,
  original: Product,
  edited: Product,
): Product {
  return { ...fresh, ...changedProductFields(original, edited) };
}
