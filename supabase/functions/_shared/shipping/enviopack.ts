import { packagesParameter } from "./domain.ts";
import type {
  CreateProviderOrderInput,
  CreateProviderShipmentInput,
  ProviderOrderLookup,
  ProviderQuote,
  ProviderShipment,
  QuoteRequest,
  ShippingProvider,
} from "./types.ts";

type FetchLike = typeof fetch;

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

type EnviopackConfig = {
  apiKey: string;
  secretKey: string;
  depotId: string;
  baseUrl: string;
  dispatchMode: "D" | "S";
  allowedCarriers: Set<string>;
  markupPercent: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts.shift() || "Cliente",
    lastName: parts.join(" ") || "Litoral Maq",
  };
}

export function readEnviopackConfig(): EnviopackConfig {
  const apiKey = Deno.env.get("ENVIOPACK_API_KEY")?.trim() || "";
  const secretKey = Deno.env.get("ENVIOPACK_SECRET_KEY")?.trim() || "";
  const depotId = Deno.env.get("ENVIOPACK_DEPOT_ID")?.trim() || "";
  if (!apiKey || !secretKey || !depotId) {
    throw new ShippingProviderError(
      "Envíopack todavía no está activado: faltan credenciales o el depósito de origen.",
      503,
      false,
    );
  }
  const dispatchMode = Deno.env.get("ENVIOPACK_DISPATCH_MODE") === "D"
    ? "D"
    : "S";
  const allowed = (Deno.env.get("ENVIOPACK_ALLOWED_CARRIERS") || "oca,urbano")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const markupPercent = Number(
    Deno.env.get("SHIPPING_PRICE_MARKUP_PERCENT") || "0",
  );
  return {
    apiKey,
    secretKey,
    depotId,
    baseUrl: (Deno.env.get("ENVIOPACK_BASE_URL") || "https://api.enviopack.com")
      .replace(/\/$/, ""),
    dispatchMode,
    allowedCarriers: new Set(allowed),
    markupPercent: Number.isFinite(markupPercent) && markupPercent >= 0
      ? markupPercent
      : 0,
  };
}

export class EnviopackProvider implements ShippingProvider {
  readonly id = "enviopack";

  constructor(
    private readonly config = readEnviopackConfig(),
    private readonly fetcher: FetchLike = fetch,
  ) {}

  private async token(force = false) {
    if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
      return cachedToken.value;
    }
    const body = new URLSearchParams({
      "api-key": this.config.apiKey,
      "secret-key": this.config.secretKey,
    });
    const response = await this.fetcher(`${this.config.baseUrl}/auth`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new ShippingProviderError(
        "Envíopack rechazó las credenciales configuradas.",
        502,
        false,
      );
    }
    const payload = asRecord(await response.json());
    const accessToken = stringValue(payload.access_token);
    if (!accessToken) {
      throw new ShippingProviderError(
        "Envíopack no devolvió un token de acceso válido.",
        502,
        true,
      );
    }
    cachedToken = {
      value: accessToken,
      expiresAt: Date.now() + 4 * 60 * 60 * 1000,
    };
    return accessToken;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    query: Record<string, string | number | undefined> = {},
    retryAuth = true,
  ): Promise<T> {
    const token = await this.token();
    const url = new URL(`${this.config.baseUrl}${path}`);
    url.searchParams.set("access_token", token);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ShippingProviderError(
        "Envíopack no respondió dentro del tiempo esperado.",
        504,
        true,
      );
    }
    if (response.status === 401 && retryAuth) {
      cachedToken = null;
      await this.token(true);
      return this.request<T>(path, init, query, false);
    }
    if (!response.ok) {
      let detail = "";
      try {
        const payload = asRecord(await response.json());
        detail = stringValue(
          payload.mensaje || payload.message || payload.error,
        );
      } catch {
        // No se incluye el cuerpo crudo: algunos proxies reflejan la URL y el token.
      }
      throw new ShippingProviderError(
        detail
          ? `Envíopack rechazó la operación: ${detail.slice(0, 180)}`
          : `Envíopack respondió ${response.status}.`,
        response.status >= 500 ? 502 : 422,
        response.status >= 500 || response.status === 429,
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json() as T;
    }
    return new Uint8Array(await response.arrayBuffer()) as T;
  }

  async listLocalities(province: string) {
    const rows = await this.request<unknown[]>("/localidades", {}, {
      id_provincia: province,
    });
    return rows.map((row) => {
      const item = asRecord(row);
      return { id: stringValue(item.id), name: stringValue(item.nombre) };
    }).filter((item) => item.id && item.name);
  }

  async quote(request: QuoteRequest): Promise<ProviderQuote[]> {
    const common = {
      provincia: request.province,
      peso: request.totalWeightKg,
      paquetes: packagesParameter(request.packages),
      direccion_envio: this.config.depotId,
    };
    if (request.deliveryMode === "S") {
      if (!request.localityId) return [];
      const rows = await this.request<unknown[]>(
        "/cotizar/precio/a-sucursal",
        {},
        {
          ...common,
          localidad: request.localityId,
        },
      );
      return rows.flatMap((row) => {
        const item = asRecord(row);
        const branch = asRecord(item.sucursal);
        const carrier = asRecord(branch.correo);
        const carrierId = stringValue(carrier.id).toLowerCase();
        const rawAmount = numberValue(item.valor);
        if (
          !carrierId || rawAmount === null ||
          !this.config.allowedCarriers.has(carrierId)
        ) return [];
        const amount = rawAmount * (1 + this.config.markupPercent / 100);
        const street = [branch.calle, branch.numero].filter(Boolean).join(" ");
        return [{
          carrierId,
          carrierName: stringValue(carrier.nombre) || carrierId,
          dispatchMode: this.config.dispatchMode,
          deliveryMode: "S" as const,
          service: stringValue(item.servicio) || "N",
          amount: Number(amount.toFixed(2)),
          etaHours: numberValue(item.horas_entrega),
          branchId: stringValue(branch.id),
          branchName: stringValue(branch.nombre),
          branchAddress: street,
        }];
      });
    }

    const rows = await this.request<unknown[]>("/cotizar/costo", {}, {
      ...common,
      codigo_postal: request.postalCode,
      despacho: this.config.dispatchMode,
      modalidad: "D",
      orden_columna: "valor",
      orden_sentido: "asc",
    });
    return rows.flatMap((row) => {
      const item = asRecord(row);
      const carrier = asRecord(item.correo);
      const carrierId = stringValue(carrier.id).toLowerCase();
      const rawAmount = numberValue(item.valor);
      if (
        !carrierId || rawAmount === null ||
        stringValue(item.despacho) !== this.config.dispatchMode ||
        stringValue(item.modalidad) !== "D" ||
        !this.config.allowedCarriers.has(carrierId)
      ) return [];
      const amount = rawAmount * (1 + this.config.markupPercent / 100);
      return [{
        carrierId,
        carrierName: stringValue(carrier.nombre) || carrierId,
        dispatchMode: this.config.dispatchMode,
        deliveryMode: "D" as const,
        service: stringValue(item.servicio) || "N",
        amount: Number(amount.toFixed(2)),
        etaHours: numberValue(item.horas_entrega),
        branchId: null,
        branchName: null,
        branchAddress: null,
      }];
    });
  }

  async findOrder(
    externalOrderId: string,
  ): Promise<ProviderOrderLookup | null> {
    try {
      const payload = asRecord(
        await this.request<unknown>("/pedidos/obtener-ids", {
          method: "POST",
          body: JSON.stringify({
            id_externo: externalOrderId,
            plataforma: "web",
          }),
        }),
      );
      const orderId = stringValue(payload.id_pedido);
      if (!orderId) return null;
      const shipments = Array.isArray(payload.envios_asociados)
        ? payload.envios_asociados
        : [];
      return {
        orderId,
        latestShipmentId: stringValue(payload.id_ultimo_envio) || null,
        shipmentIds: shipments.map((item) => stringValue(asRecord(item).id))
          .filter(Boolean),
      };
    } catch (error) {
      if (
        error instanceof ShippingProviderError &&
        [404, 422].includes(error.status)
      ) return null;
      throw error;
    }
  }

  async createOrder(input: CreateProviderOrderInput) {
    const names = splitName(`${input.firstName} ${input.lastName}`);
    const payload = asRecord(
      await this.request<unknown>("/pedidos", {
        method: "POST",
        body: JSON.stringify({
          id_externo: input.externalOrderId.slice(0, 30),
          nombre: names.firstName.slice(0, 30),
          apellido: names.lastName.slice(0, 30),
          email: input.email.slice(0, 100),
          telefono: input.phone?.slice(0, 30),
          celular: input.phone?.slice(0, 30),
          monto: input.amount,
          fecha_alta: input.createdAt.replace("T", " ").slice(0, 19),
          pagado: true,
          provincia: input.province,
          localidad: input.locality.slice(0, 50),
        }),
      }),
    );
    const id = stringValue(payload.id);
    if (!id) {
      throw new ShippingProviderError(
        "Envíopack creó el pedido sin devolver su identificador.",
        502,
        true,
      );
    }
    return { id };
  }

  private mapShipment(payload: unknown): ProviderShipment {
    const item = asRecord(payload);
    return {
      id: stringValue(item.id),
      orderId: stringValue(item.pedido),
      state: stringValue(item.estado) || null,
      condition: stringValue(item.condicion) || null,
      subcondition: stringValue(item.sub_condicion || item.subcondicion) ||
        null,
      trackingNumber: stringValue(item.tracking_number) || null,
    };
  }

  async createShipment(input: CreateProviderShipmentInput) {
    const destination = input.destination;
    const body: Record<string, unknown> = {
      pedido: Number(input.providerOrderId),
      direccion_envio: Number(this.config.depotId),
      destinatario: destination.recipient.slice(0, 50),
      observaciones: destination.reference?.slice(0, 180),
      usa_seguro: null,
      confirmado: true,
      tiene_fulfillment: false,
      despacho: input.quote.dispatchMode,
      modalidad: input.quote.deliveryMode,
      servicio: input.quote.service,
      correo: input.quote.carrierId,
      paquetes: input.packages.map((item) => ({
        alto: item.heightCm,
        ancho: item.widthCm,
        largo: item.lengthCm,
        peso: item.weightKg,
        descripcion_primera_linea: item.description.slice(0, 50),
        descripcion_segunda_linea: item.productId.slice(0, 50),
      })),
    };
    if (input.quote.deliveryMode === "S") {
      body.sucursal = Number(destination.branchId);
    } else {
      body.calle = destination.street?.slice(0, 50);
      body.numero = destination.streetNumber?.slice(0, 5);
      body.piso = destination.floor?.slice(0, 6);
      body.depto = destination.apartment?.slice(0, 4);
      body.referencia_domicilio = destination.reference?.slice(0, 30);
      body.codigo_postal = destination.postalCode;
      body.provincia = destination.province;
      body.localidad = destination.locality.slice(0, 50);
    }
    const shipment = this.mapShipment(
      await this.request<unknown>("/envios", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    if (!shipment.id) {
      throw new ShippingProviderError(
        "Envíopack no devolvió el identificador del envío.",
        502,
        true,
      );
    }
    return shipment;
  }

  async getShipment(id: string) {
    return this.mapShipment(
      await this.request<unknown>(`/envios/${encodeURIComponent(id)}`),
    );
  }

  async getTracking(id: string) {
    const rows = await this.request<unknown[]>(
      `/envios/${encodeURIComponent(id)}/tracking`,
      {},
      {
        formato: "iso",
        orden: "asc",
      },
    );
    return rows.map((row) => {
      const item = asRecord(row);
      return {
        date: stringValue(item.fecha),
        message: stringValue(item.mensaje),
      };
    });
  }

  async getLabel(id: string, format: "pdf" | "jpg") {
    const bytes = await this.request<Uint8Array>(
      `/envios/${encodeURIComponent(id)}/etiqueta`,
      {
        headers: {
          accept: format === "pdf" ? "application/pdf" : "image/jpeg",
        },
      },
      { formato: format },
    );
    return {
      bytes,
      contentType: format === "pdf" ? "application/pdf" : "image/jpeg",
    };
  }
}
