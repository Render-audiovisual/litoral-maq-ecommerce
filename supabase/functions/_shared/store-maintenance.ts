import { json } from "./http.ts";

// Explicit, versioned closure: cannot be accidentally reopened by stale secrets.
// Reopen only alongside the store artifact and the orders trigger.
export function storeMaintenanceResponse(request: Request): Response | null {
  return json(request, {
    error: "Estamos renovando nuestra tienda. Las compras online están pausadas temporalmente.",
    code: "STORE_MAINTENANCE",
  }, 503);
}
