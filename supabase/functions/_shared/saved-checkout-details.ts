export const CHECKOUT_DETAIL_KEYS = ["firstName", "lastName", "email", "dni", "phone", "province", "postalCode", "locality", "street", "streetNumber", "floor", "apartment", "reference"] as const;
export type SavedCheckoutDetails = Record<typeof CHECKOUT_DETAIL_KEYS[number], string>;

/** Whitelist only contact/delivery data; never accept identity, roles or totals. */
export function parseSavedCheckoutDetails(value: unknown): SavedCheckoutDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Datos de compra inválidos.");
  const source = value as Record<string, unknown>;
  const result = {} as SavedCheckoutDetails;
  for (const key of CHECKOUT_DETAIL_KEYS) {
    if (typeof source[key] !== "string" || (source[key] as string).length > 240) throw new Error("Revisá los datos de compra.");
    result[key] = (source[key] as string).trim();
  }
  if (result.dni && !/^\d{7,8}$/.test(result.dni)) throw new Error("Revisá el DNI.");
  return result;
}
