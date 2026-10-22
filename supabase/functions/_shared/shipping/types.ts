import type { ShippingPackage } from "./domain.ts";

export type DeliveryMode = "D" | "S";

export class ShippingProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ShippingProviderError";
  }
}

export type ProviderQuote = {
  carrierId: string;
  carrierName: string;
  /** Cómo entra el paquete al carrier: "D" = retiran en el depósito. */
  dispatchMode: "D" | "S";
  /** Cómo llega al cliente: "D" = a domicilio, "S" = a sucursal. */
  deliveryMode: DeliveryMode;
  service: string;
  amount: number;
  etaHours: number | null;
  branchId: string | null;
  branchName: string | null;
  branchAddress: string | null;
};

export type QuoteRequest = {
  postalCode: string;
  deliveryMode: DeliveryMode;
  packages: ShippingPackage[];
  totalWeightKg: number;
  declaredValue: number;
};

export type ShipmentDestination = {
  recipient: string;
  province: string;
  postalCode: string;
  locality: string;
  street?: string;
  streetNumber?: string;
  floor?: string;
  apartment?: string;
  reference?: string;
  branchId?: string;
};

export type CreateProviderShipmentInput = {
  externalOrderId: string;
  email: string;
  phone?: string;
  quote: ProviderQuote;
  destination: ShipmentDestination;
  packages: ShippingPackage[];
  declaredValue: number;
};

export type ProviderShipment = {
  /** Orden de retiro del carrier (sirve para etiqueta y anulación). */
  orderId: string;
  /** Número de envío / pieza para seguimiento. */
  shipmentId: string;
  trackingNumber: string | null;
  /** Último estado en texto libre del carrier. */
  state: string | null;
};

export type TrackingEvent = { date: string; message: string };

export interface ShippingProvider {
  readonly id: string;
  quote(request: QuoteRequest): Promise<ProviderQuote[]>;
  createShipment(input: CreateProviderShipmentInput): Promise<ProviderShipment>;
  getTracking(shipmentId: string): Promise<TrackingEvent[]>;
  getLabel(
    orderId: string,
    shipmentId: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }>;
  cancel(orderId: string): Promise<void>;
}
