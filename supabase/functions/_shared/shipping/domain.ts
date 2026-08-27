export type ShippingPackage = {
  productId: string;
  description: string;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

export type ShippingProduct = {
  id: string;
  name: string;
  shippingEnabled: boolean;
  shippingWeightKg: number | null;
  shippingHeightCm: number | null;
  shippingWidthCm: number | null;
  shippingLengthCm: number | null;
};

export type ShippingCartLine = { productId: string; quantity: number };

export type ShippingLimits = {
  maxPackages: number;
  maxWeightKg: number;
  maxHeightCm: number;
  maxWidthCm: number;
  maxLengthCm: number;
};

export type PackageAssessment =
  | { automatic: true; packages: ShippingPackage[]; totalWeightKg: number }
  | { automatic: false; reason: string; productIds: string[] };

export const DEFAULT_AUTOMATIC_LIMITS: ShippingLimits = {
  maxPackages: 99,
  maxWeightKg: 35,
  maxHeightCm: 40,
  maxWidthCm: 40,
  maxLengthCm: 40,
};

function positive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function assessPackages(
  products: ShippingProduct[],
  lines: ShippingCartLine[],
  limits: ShippingLimits = DEFAULT_AUTOMATIC_LIMITS,
): PackageAssessment {
  if (!lines.length) {
    return {
      automatic: false,
      reason: "El carrito está vacío.",
      productIds: [],
    };
  }
  const byId = new Map(products.map((product) => [product.id, product]));
  const packages: ShippingPackage[] = [];
  const blocked = new Set<string>();

  for (const line of lines) {
    if (
      !Number.isInteger(line.quantity) || line.quantity < 1 ||
      line.quantity > limits.maxPackages
    ) {
      return {
        automatic: false,
        reason:
          "La cantidad solicitada no es válida para cotización automática.",
        productIds: [line.productId],
      };
    }
    const product = byId.get(line.productId);
    if (!product || !product.shippingEnabled) {
      blocked.add(line.productId);
      continue;
    }
    const values = [
      product.shippingWeightKg,
      product.shippingHeightCm,
      product.shippingWidthCm,
      product.shippingLengthCm,
    ];
    if (!values.every(positive)) {
      blocked.add(product.id);
      continue;
    }
    const [weightKg, heightCm, widthCm, lengthCm] = values as [
      number,
      number,
      number,
      number,
    ];
    if (
      weightKg > limits.maxWeightKg ||
      heightCm > limits.maxHeightCm ||
      widthCm > limits.maxWidthCm ||
      lengthCm > limits.maxLengthCm
    ) {
      blocked.add(product.id);
      continue;
    }
    for (let unit = 0; unit < line.quantity; unit += 1) {
      packages.push({
        productId: product.id,
        description: product.name.slice(0, 50),
        weightKg,
        heightCm: Math.ceil(heightCm),
        widthCm: Math.ceil(widthCm),
        lengthCm: Math.ceil(lengthCm),
      });
    }
  }

  if (blocked.size) {
    return {
      automatic: false,
      reason:
        "Uno o más productos no tienen peso y medidas embaladas verificadas o superan el límite automático.",
      productIds: [...blocked],
    };
  }
  if (packages.length > limits.maxPackages) {
    return {
      automatic: false,
      reason:
        `El pedido supera el máximo automático de ${limits.maxPackages} bultos.`,
      productIds: lines.map((line) => line.productId),
    };
  }
  return {
    automatic: true,
    packages,
    totalWeightKg: Number(
      packages.reduce((sum, item) => sum + item.weightKg, 0).toFixed(2),
    ),
  };
}

export function packagesParameter(packages: ShippingPackage[]) {
  return packages.map((item) =>
    `${item.heightCm}x${item.widthCm}x${item.lengthCm}`
  ).join(",");
}

export function normalizeLocation(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeProviderStatus(input: {
  state?: string | null;
  condition?: string | null;
  latestTrackingMessage?: string | null;
}) {
  const text = normalizeLocation(
    [input.state, input.condition, input.latestTrackingMessage].filter(Boolean)
      .join(" "),
  );
  if (/entregad|recibid.*destinat/.test(text)) return "delivered" as const;
  if (/cancel|rechaz|devuelt|no entreg/.test(text)) return "cancelled" as const;
  if (/transito|distribucion|despach|viaje|arribo|manifiesto/.test(text)) {
    return "in_transit" as const;
  }
  if (input.state === "P") return "ready" as const;
  return "processing" as const;
}
