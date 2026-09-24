/** Local de retiro. El enlace de Google Maps se arma desde la dirección. */
export const STORE_ADDRESS = "Sáenz 1587, Corrientes";
// Ficha del negocio en Google Maps (la que administra el dueño: reseñas, fotos y cómo llegar).
export const STORE_MAPS_URL = "https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8";
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
