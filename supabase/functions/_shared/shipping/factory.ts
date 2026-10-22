import { OcaProvider } from "./oca.ts";
import { type ShippingProvider, ShippingProviderError } from "./types.ts";

export function getShippingProvider(): ShippingProvider {
  const provider = (Deno.env.get("SHIPPING_PROVIDER") || "oca").trim()
    .toLowerCase();
  if (provider === "oca") return new OcaProvider();
  throw new ShippingProviderError(
    `El proveedor logístico "${provider}" no está implementado.`,
    503,
    false,
  );
}
