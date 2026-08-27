import type { ShippingPackage } from "./domain.ts";

export type DeliveryMode = "D" | "S";

export type ProviderQuote = {
  carrierId: string;
  carrierName: string;
  dispatchMode: "D" | "S";
  deliveryMode: DeliveryMode;
  service: string;
  amount: number;
  etaHours: number | null;
  branchId: string | null;
  branchName: string | null;
  branchAddress: string | null;
};

export type QuoteRequest = {
  province: string;
  postalCode: string;
  localityId?: string;
  deliveryMode: DeliveryMode;
  packages: ShippingPackage[];
  totalWeightKg: number;
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

export type CreateProviderOrderInput = {
  externalOrderId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  amount: number;
  createdAt: string;
  province: string;
  locality: string;
};

export type CreateProviderShipmentInput = {
  providerOrderId: string;
  quote: ProviderQuote;
  destination: ShipmentDestination;
  packages: ShippingPackage[];
};

export type ProviderOrderLookup = {
  orderId: string;
  latestShipmentId: string | null;
  shipmentIds: string[];
};

export type ProviderShipment = {
  id: string;
  orderId: string;
  state: string | null;
  condition: string | null;
  subcondition: string | null;
  trackingNumber: string | null;
};

export interface ShippingProvider {
  readonly id: string;
  listLocalities(
    province: string,
  ): Promise<Array<{ id: string; name: string }>>;
  quote(request: QuoteRequest): Promise<ProviderQuote[]>;
  findOrder(externalOrderId: string): Promise<ProviderOrderLookup | null>;
  createOrder(input: CreateProviderOrderInput): Promise<{ id: string }>;
  createShipment(input: CreateProviderShipmentInput): Promise<ProviderShipment>;
  getShipment(id: string): Promise<ProviderShipment>;
  getTracking(id: string): Promise<Array<{ date: string; message: string }>>;
  getLabel(
    id: string,
    format: "pdf" | "jpg",
  ): Promise<{ bytes: Uint8Array; contentType: string }>;
}
