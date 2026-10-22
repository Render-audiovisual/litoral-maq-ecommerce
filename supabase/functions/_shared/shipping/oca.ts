import {
  buildShipmentXml,
  nextPickupDate,
  parseBranches,
  parseCancel,
  parseCreated,
  parsePdfBase64,
  parseTariffs,
  parseTracking,
  provinceName,
} from "./oca-xml.ts";
import {
  type CreateProviderShipmentInput,
  type ProviderQuote,
  type ProviderShipment,
  type QuoteRequest,
  type ShippingProvider,
  ShippingProviderError,
  type TrackingEvent,
} from "./types.ts";

const BASE_URLS = {
  qa: "https://integraciones.ocadev.com.ar/epak_tracking_test/Oep_TrackEPak.asmx",
  prod: "https://webservice.oca.com.ar/ePak_tracking/Oep_TrackEPak.asmx",
} as const;

const MAX_BRANCH_OPTIONS = 10;

type OcaConfig = {
  baseUrl: string;
  cuit: string;
  account: string;
  user: string;
  password: string;
  operativaDoor: string;
  operativaBranch: string;
  costCenter: string;
  pickupSlot: string;
  insured: boolean;
  origin: {
    street: string;
    number: string;
    postalCode: string;
    locality: string;
    province: string;
    contact: string;
    email: string;
  };
};

function required(name: string) {
  const value = (Deno.env.get(name) || "").trim();
  if (!value) {
    throw new ShippingProviderError(
      `Falta configurar ${name} en las funciones de Supabase.`,
      503,
    );
  }
  return value;
}

function optional(name: string, fallback: string) {
  return (Deno.env.get(name) || "").trim() || fallback;
}

export function readOcaConfig(): OcaConfig {
  // Sin default a propósito: un pedido real nunca debe caer en QA por olvido.
  const env = required("OCA_ENV");
  if (env !== "qa" && env !== "prod") {
    throw new ShippingProviderError('OCA_ENV debe ser "qa" o "prod".', 503);
  }
  return {
    baseUrl: BASE_URLS[env],
    cuit: required("OCA_CUIT"),
    account: required("OCA_ACCOUNT"),
    user: required("OCA_USER"),
    password: required("OCA_PASSWORD"),
    operativaDoor: required("OCA_OPERATIVA_DOMICILIO"),
    operativaBranch: required("OCA_OPERATIVA_SUCURSAL"),
    costCenter: required("OCA_COST_CENTER"),
    pickupSlot: optional("OCA_PICKUP_SLOT", "1"),
    insured: optional("OCA_INSURED", "false") === "true",
    origin: {
      street: optional("OCA_ORIGIN_STREET", "Saenz"),
      number: optional("OCA_ORIGIN_NUMBER", "1587"),
      postalCode: optional("OCA_ORIGIN_POSTAL_CODE", "3400"),
      locality: optional("OCA_ORIGIN_LOCALITY", "Corrientes"),
      province: optional("OCA_ORIGIN_PROVINCE", "Corrientes"),
      contact: optional("OCA_ORIGIN_CONTACT", "Litoral Maq"),
      email: optional("OCA_ORIGIN_EMAIL", "maqlitoral@gmail.com"),
    },
  };
}

function volumeM3(packages: QuoteRequest["packages"]) {
  const cm3 = packages.reduce(
    (sum, p) => sum + p.heightCm * p.widthCm * p.lengthCm,
    0,
  );
  return Math.max(cm3 / 1_000_000, 0.0001);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts.shift() || "Cliente",
    lastName: parts.join(" ") || "Litoral Maq",
  };
}

export class OcaProvider implements ShippingProvider {
  readonly id = "oca";
  private readonly config = readOcaConfig();

  private async call(method: string, params: Record<string, string>) {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ShippingProviderError(
        "OCA no respondió a tiempo. Si estabas creando una guía, buscá el remito (n.º de pedido) en ePak antes de reintentar.",
        503,
        true,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      throw new ShippingProviderError(
        `OCA devolvió un error (${response.status}). Si estabas creando una guía, buscá el remito en ePak antes de reintentar.`,
        503,
        true,
      );
    }
    // Un parámetro mal armado vuelve como texto plano, no como XML.
    if (!text.trimStart().startsWith("<")) {
      throw new ShippingProviderError(
        `OCA rechazó la consulta: ${text.trim().slice(0, 160)}`,
        502,
      );
    }
    return text;
  }

  private async tariff(
    operativa: string,
    request: QuoteRequest,
  ) {
    const xml = await this.call("Tarifar_Envio_Corporativo", {
      Cuit: this.config.cuit,
      Operativa: operativa,
      PesoTotal: String(request.totalWeightKg),
      VolumenTotal: volumeM3(request.packages).toFixed(4),
      CodigoPostalOrigen: this.config.origin.postalCode,
      CodigoPostalDestino: request.postalCode,
      CantidadPaquetes: String(request.packages.length),
      ValorDeclarado: String(Math.max(Math.round(request.declaredValue), 1)),
    });
    return parseTariffs(xml)[0] || null;
  }

  async quote(request: QuoteRequest): Promise<ProviderQuote[]> {
    const toDoor = request.deliveryMode === "D";
    const tariff = await this.tariff(
      toDoor ? this.config.operativaDoor : this.config.operativaBranch,
      request,
    );
    if (!tariff) return [];
    const base = {
      carrierId: "oca",
      carrierName: "OCA",
      dispatchMode: "D" as const,
      deliveryMode: request.deliveryMode,
      service: toDoor ? "Puerta a puerta" : "Puerta a sucursal",
      amount: tariff.amount,
      etaHours: tariff.days === null ? null : tariff.days * 24,
    };
    if (toDoor) {
      return [{ ...base, branchId: null, branchName: null, branchAddress: null }];
    }
    const xml = await this.call("GetCentrosImposicionConServiciosByCP", {
      CodigoPostal: request.postalCode,
    });
    return parseBranches(xml)
      .filter((branch) => branch.acceptsDelivery)
      .slice(0, MAX_BRANCH_OPTIONS)
      .map((branch) => ({
        ...base,
        branchId: branch.id,
        branchName: branch.name,
        branchAddress: branch.address,
      }));
  }

  async createShipment(
    input: CreateProviderShipmentInput,
  ): Promise<ProviderShipment> {
    const toBranch = input.quote.deliveryMode === "S";
    if (toBranch && !input.destination.branchId) {
      throw new ShippingProviderError(
        "La cotización a sucursal no tiene sucursal elegida.",
        409,
      );
    }
    const names = splitName(input.destination.recipient);
    const perPackageValue = this.config.insured
      ? input.declaredValue / input.packages.length
      : 0;
    const xml = buildShipmentXml({
      account: this.config.account,
      operativa: toBranch
        ? this.config.operativaBranch
        : this.config.operativaDoor,
      costCenter: this.config.costCenter,
      pickupDate: nextPickupDate(),
      pickupSlot: this.config.pickupSlot,
      remito: input.externalOrderId,
      origin: this.config.origin,
      recipient: {
        ...names,
        street: input.destination.street || "",
        number: input.destination.streetNumber || "",
        floor: input.destination.floor || "",
        apartment: input.destination.apartment || "",
        postalCode: input.destination.postalCode,
        locality: input.destination.locality,
        province: provinceName(input.destination.province),
        phone: input.phone || "",
        email: input.email,
        notes: input.destination.reference || "",
        branchId: toBranch ? input.destination.branchId! : "0",
      },
      packages: input.packages.map((p) => ({
        heightCm: p.heightCm,
        widthCm: p.widthCm,
        lengthCm: p.lengthCm,
        weightKg: p.weightKg,
        declaredValue: perPackageValue,
      })),
    });
    const response = await this.call("IngresoORMultiplesRetiros_v2", {
      usr: this.config.user,
      psw: this.config.password,
      xml_Datos: xml,
      ConfirmarRetiro: "true",
      ArchivoCliente: "",
      ArchivoProceso: "",
      compatMode: "",
    });
    const created = parseCreated(response);
    if (!created || created.rejected > 0) {
      throw new ShippingProviderError(
        "OCA rechazó el envío. Revisá los datos del destinatario y de la dirección.",
        422,
      );
    }
    return {
      orderId: created.orderId,
      shipmentId: created.shipmentId,
      trackingNumber: created.shipmentId,
      state: created.state,
    };
  }

  async getTracking(shipmentId: string): Promise<TrackingEvent[]> {
    const xml = await this.call("Tracking_PiezaNumeroEnvio", {
      Pieza: shipmentId,
    });
    return parseTracking(xml);
  }

  async getLabel(orderId: string, shipmentId: string) {
    const xml = await this.call("GetPdfDeEtiquetasPorOrdenOrNumeroEnvio", {
      idOrdenRetiro: orderId,
      nroEnvio: shipmentId,
      logisticaInversa: "false",
    });
    const base64 = parsePdfBase64(xml);
    if (!base64) {
      throw new ShippingProviderError(
        "OCA todavía no generó la etiqueta.",
        409,
        true,
      );
    }
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { bytes, contentType: "application/pdf" };
  }

  async cancel(orderId: string) {
    const xml = await this.call("AnularOrdenGenerada", {
      usr: this.config.user,
      psw: this.config.password,
      IdOrdenRetiro: orderId,
    });
    const result = parseCancel(xml);
    if (result.code !== 100) {
      throw new ShippingProviderError(
        result.message || "OCA no pudo anular la orden.",
        409,
      );
    }
  }
}
