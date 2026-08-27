import { EnviopackProvider, ShippingProviderError } from "./enviopack.ts";
import type { ShippingProvider } from "./types.ts";

export function getShippingProvider(): ShippingProvider {
  const provider = (Deno.env.get("SHIPPING_PROVIDER") || "enviopack").trim()
    .toLowerCase();
  if (provider === "enviopack") return new EnviopackProvider();
  throw new ShippingProviderError(
    `El proveedor logístico "${provider}" no está implementado.`,
    503,
    false,
  );
}
