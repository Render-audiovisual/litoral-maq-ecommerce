/** Local de retiro. El enlace de Google Maps se arma desde la dirección. */
export const STORE_ADDRESS = "Sáenz 1587, Corrientes";
export const STORE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${STORE_ADDRESS}, Argentina`)}`;
export const STORE_HOURS = ["Lun a Vie 8 a 17 hs", "Sáb 8:30 a 12:30 hs"] as const;

/** `maximumFractionDigits: 0` para precios orientativos ("Desde $ 88.999"). */
export function formatCurrency(value: number | null, maximumFractionDigits = 2) {
  if (value === null) return "Precio a completar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits,
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
