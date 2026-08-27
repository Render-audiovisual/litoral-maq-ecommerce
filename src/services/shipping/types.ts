import type { CartLine, ShippingDeliveryType } from "@/lib/types";

export type ShippingQuoteOption = {
  id: string;
  provider: string;
  carrierId: string;
  carrierName: string;
  service: string;
  amount: number;
  etaHours: number | null;
  deliveryType: ShippingDeliveryType;
  branchId: string | null;
  branchName: string | null;
  branchAddress: string | null;
};
export type ShippingQuoteRequest = {
  lines: CartLine[];
  province: string;
  postalCode: string;
  locality: string;
  deliveryType: ShippingDeliveryType;
};

export type ShippingQuoteResult =
  | { status: "quoted"; expiresAt: string; options: ShippingQuoteOption[] }
  | { status: "manual"; reason: string; productIds?: string[]; localitySuggestions?: string[] };

export type ShippingCreationResult = {
  status: string;
  shipmentId: string;
  trackingNumber?: string | null;
  labelReady?: boolean;
  idempotent?: boolean;
};
