import { describe, expect, it } from "vitest";
import {
  assessPackages,
  normalizeLocation,
  normalizeProviderStatus,
  packagesParameter,
} from "../../../supabase/functions/_shared/shipping/domain";

const product = {
  id: "p1",
  name: "Taladro",
  shippingEnabled: true,
  shippingWeightKg: 4.5,
  shippingHeightCm: 20,
  shippingWidthCm: 30,
  shippingLengthCm: 40,
};

describe("dominio logístico compartido", () => {
  it("arma un bulto por unidad y calcula peso total", () => {
    const result = assessPackages([product], [{ productId: "p1", quantity: 2 }]);
    expect(result.automatic).toBe(true);
    if (!result.automatic) return;
    expect(result.packages).toHaveLength(2);
    expect(result.totalWeightKg).toBe(9);
    expect(packagesParameter(result.packages)).toBe("20x30x40,20x30x40");
  });

  it("deriva a manual si faltan medidas verificadas", () => {
    const result = assessPackages([{ ...product, shippingEnabled: false }], [{ productId: "p1", quantity: 1 }]);
    expect(result).toMatchObject({ automatic: false, productIds: ["p1"] });
  });

  it("deriva a manual al superar 35 kg o 40 cm por bulto", () => {
    const heavy = assessPackages([{ ...product, shippingWeightKg: 35.01 }], [{ productId: "p1", quantity: 1 }]);
    const large = assessPackages([{ ...product, shippingLengthCm: 41 }], [{ productId: "p1", quantity: 1 }]);
    expect(heavy.automatic).toBe(false);
    expect(large.automatic).toBe(false);
  });

  it("normaliza localidades y estados de tracking sin depender del carrier", () => {
    expect(normalizeLocation("  Río Cuarto  ")).toBe("rio cuarto");
    expect(normalizeProviderStatus({ latestTrackingMessage: "En distribución" })).toBe("in_transit");
    expect(normalizeProviderStatus({ latestTrackingMessage: "Entregado al destinatario" })).toBe("delivered");
  });
});
