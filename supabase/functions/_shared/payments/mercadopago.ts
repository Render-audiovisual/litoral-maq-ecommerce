export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

type PreferenceItem = {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unitPrice: number;
};

type PreferenceInput = {
  orderId: string;
  payerEmail: string;
  items: PreferenceItem[];
  shippingAmount: number;
};

type MercadoPagoConfig = {
  accessToken: string;
  apiBaseUrl: string;
  storeUrl: string;
  useSandbox: boolean;
  maxInstallments: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function readMercadoPagoConfig(): MercadoPagoConfig {
  const accessToken = Deno.env.get("MP_ACCESS_TOKEN")?.trim() || "";
  const storeUrl = (Deno.env.get("STORE_PUBLIC_URL") || "").trim().replace(
    /\/$/,
    "",
  );
  if (!accessToken || !/^https:\/\//.test(storeUrl)) {
    throw new MercadoPagoError(
      "Mercado Pago todavía no está activado: faltan credenciales o la URL pública de la tienda.",
      503,
      false,
    );
  }
  const installments = Number(Deno.env.get("MP_MAX_INSTALLMENTS") || "12");
  return {
    accessToken,
    storeUrl,
    apiBaseUrl: (Deno.env.get("MP_API_BASE_URL") ||
      "https://api.mercadopago.com").replace(/\/$/, ""),
    useSandbox: Deno.env.get("MP_USE_SANDBOX") === "true",
    maxInstallments: Number.isInteger(installments) && installments > 0
      ? Math.min(installments, 24)
      : 12,
  };
}

export class MercadoPagoClient {
  constructor(
    private readonly config = readMercadoPagoConfig(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json",
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new MercadoPagoError(
        "Mercado Pago no respondió dentro del tiempo esperado.",
        504,
        true,
      );
    }
    if (!response.ok) {
      let detail = "";
      try {
        const body = asRecord(await response.json());
        detail = stringValue(body.message || body.error);
      } catch {
        // No se registra el cuerpo crudo: puede contener datos del comprador.
      }
      throw new MercadoPagoError(
        detail
          ? `Mercado Pago rechazó la operación: ${detail.slice(0, 180)}`
          : `Mercado Pago respondió ${response.status}.`,
        response.status >= 500 ? 502 : 422,
        response.status >= 500 || response.status === 429,
      );
    }
    return await response.json() as T;
  }

  async createPreference(input: PreferenceInput) {
    const items = input.items.map((item) => ({
      id: item.id.slice(0, 256),
      title: item.title.slice(0, 256),
      description: item.description?.slice(0, 256),
      quantity: item.quantity,
      currency_id: "ARS",
      unit_price: Number(item.unitPrice.toFixed(2)),
    }));
    if (input.shippingAmount > 0) {
      items.push({
        id: "shipping",
        title: "Envío",
        description: "Entrega del pedido",
        quantity: 1,
        currency_id: "ARS",
        unit_price: Number(input.shippingAmount.toFixed(2)),
      });
    }
    const payload = asRecord(
      await this.request<unknown>(
        "/checkout/preferences",
        {
          method: "POST",
          headers: { "x-idempotency-key": `litoral-${input.orderId}` },
          body: JSON.stringify({
            items,
            payer: { email: input.payerEmail },
            external_reference: input.orderId,
            back_urls: {
              success: `${this.config.storeUrl}/checkout/exito?pedido=${
                encodeURIComponent(input.orderId)
              }`,
              pending: `${this.config.storeUrl}/checkout/pendiente?pedido=${
                encodeURIComponent(input.orderId)
              }`,
              failure: `${this.config.storeUrl}/checkout/error?pedido=${
                encodeURIComponent(input.orderId)
              }`,
            },
            auto_return: "approved",
            statement_descriptor: "LITORAL MAQ",
            payment_methods: { installments: this.config.maxInstallments },
            metadata: { order_id: input.orderId },
          }),
        },
      ),
    );
    const id = stringValue(payload.id);
    const initPoint = stringValue(
      this.config.useSandbox
        ? payload.sandbox_init_point || payload.init_point
        : payload.init_point,
    );
    if (!id || !/^https:\/\//.test(initPoint)) {
      throw new MercadoPagoError(
        "Mercado Pago no devolvió un checkout válido.",
        502,
        true,
      );
    }
    return { id, initPoint };
  }

  async getPayment(paymentId: string) {
    return asRecord(
      await this.request<unknown>(
        `/v1/payments/${encodeURIComponent(paymentId)}`,
      ),
    );
  }
}

function parseSignature(value: string) {
  const parts = Object.fromEntries(
    value.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  return { timestamp: parts.ts || "", signature: parts.v1 || "" };
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyMercadoPagoSignature(input: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}) {
  const parsed = parseSignature(input.xSignature);
  if (
    !parsed.timestamp || !/^\d+$/.test(parsed.timestamp) ||
    !/^[a-f0-9]{64}$/i.test(parsed.signature) || !input.xRequestId ||
    !input.dataId || !input.secret
  ) return false;
  const manifest =
    `id:${input.dataId.toLowerCase()};request-id:${input.xRequestId};ts:${parsed.timestamp};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  return timingSafeEqual(hex(digest), parsed.signature.toLowerCase());
}
