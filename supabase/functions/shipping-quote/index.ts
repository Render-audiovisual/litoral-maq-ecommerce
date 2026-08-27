import {
  assessPackages,
  DEFAULT_AUTOMATIC_LIMITS,
  normalizeLocation,
} from "../_shared/shipping/domain.ts";
import { getShippingProvider } from "../_shared/shipping/factory.ts";
import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
  requireUser,
  serviceClient,
  sha256,
} from "../_shared/http.ts";

type QuoteBody = {
  lines?: Array<{ productId?: string; quantity?: number }>;
  province?: string;
  postalCode?: string;
  locality?: string;
  deliveryType?: "domicilio" | "sucursal";
};

function positiveEnv(name: string, fallback: number) {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  try {
    const db = serviceClient();
    const user = await requireUser(request, db);
    const body = await request.json() as QuoteBody;
    const lines = (body.lines || []).map((line) => ({
      productId: String(line.productId || ""),
      quantity: Number(line.quantity),
    }));
    const province = String(body.province || "").trim().toUpperCase();
    const postalCode = String(body.postalCode || "").trim();
    const locality = String(body.locality || "").trim();
    const deliveryType = body.deliveryType;
    if (
      !/^[A-Z]$/.test(province) || !/^\d{4}$/.test(postalCode) ||
      locality.length < 2
    ) {
      throw new HttpError(
        400,
        "Completá provincia, código postal y localidad válidos.",
      );
    }
    if (
      !lines.length ||
      lines.some((line) =>
        !line.productId || !Number.isInteger(line.quantity) || line.quantity < 1
      )
    ) {
      throw new HttpError(400, "El carrito no contiene productos válidos.");
    }
    if (!deliveryType || !["domicilio", "sucursal"].includes(deliveryType)) {
      throw new HttpError(400, "Elegí entrega a domicilio o en sucursal.");
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db
      .from("shipping_quotes")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .gte("created_at", oneMinuteAgo);
    if ((count || 0) >= 12) {
      throw new HttpError(
        429,
        "Hiciste demasiadas cotizaciones. Esperá un minuto.",
      );
    }

    const productIds = [...new Set(lines.map((line) => line.productId))];
    const { data: rows, error: productsError } = await db
      .from("products")
      .select(
        "id,name,active,shipping_enabled,shipping_weight_kg,shipping_height_cm,shipping_width_cm,shipping_length_cm",
      )
      .in("id", productIds)
      .eq("active", true);
    if (productsError) {
      throw new HttpError(503, "No se pudo validar el catálogo para cotizar.");
    }
    const products = (rows || []).map((product) => ({
      id: product.id,
      name: product.name,
      shippingEnabled: product.shipping_enabled,
      shippingWeightKg: product.shipping_weight_kg === null
        ? null
        : Number(product.shipping_weight_kg),
      shippingHeightCm: product.shipping_height_cm,
      shippingWidthCm: product.shipping_width_cm,
      shippingLengthCm: product.shipping_length_cm,
    }));
    const assessment = assessPackages(products, lines, {
      maxPackages: positiveEnv(
        "SHIPPING_AUTO_MAX_PACKAGES",
        DEFAULT_AUTOMATIC_LIMITS.maxPackages,
      ),
      maxWeightKg: positiveEnv(
        "SHIPPING_AUTO_MAX_WEIGHT_KG",
        DEFAULT_AUTOMATIC_LIMITS.maxWeightKg,
      ),
      maxHeightCm: positiveEnv(
        "SHIPPING_AUTO_MAX_HEIGHT_CM",
        DEFAULT_AUTOMATIC_LIMITS.maxHeightCm,
      ),
      maxWidthCm: positiveEnv(
        "SHIPPING_AUTO_MAX_WIDTH_CM",
        DEFAULT_AUTOMATIC_LIMITS.maxWidthCm,
      ),
      maxLengthCm: positiveEnv(
        "SHIPPING_AUTO_MAX_LENGTH_CM",
        DEFAULT_AUTOMATIC_LIMITS.maxLengthCm,
      ),
    });
    if (!assessment.automatic) {
      return json(request, {
        status: "manual",
        reason: assessment.reason,
        productIds: assessment.productIds,
      });
    }

    const provider = getShippingProvider();
    let localityId: string | undefined;
    let localitySuggestions: string[] = [];
    if (deliveryType === "sucursal") {
      const locations = await provider.listLocalities(province);
      const wanted = normalizeLocation(locality);
      const exact = locations.find((item) =>
        normalizeLocation(item.name) === wanted
      );
      if (!exact) {
        localitySuggestions = locations
          .filter((item) =>
            normalizeLocation(item.name).includes(wanted) ||
            wanted.includes(normalizeLocation(item.name))
          )
          .slice(0, 5)
          .map((item) => item.name);
        return json(request, {
          status: "manual",
          reason:
            "No pudimos identificar la localidad para ofrecer sucursales automáticamente.",
          localitySuggestions,
        });
      }
      localityId = exact.id;
    }

    const quotes = await provider.quote({
      province,
      postalCode,
      localityId,
      deliveryMode: deliveryType === "sucursal" ? "S" : "D",
      packages: assessment.packages,
      totalWeightKg: assessment.totalWeightKg,
    });
    if (!quotes.length) {
      return json(request, {
        status: "manual",
        reason:
          "No hay una tarifa automática disponible para este destino y estos bultos.",
      });
    }

    const normalizedLines = [...lines].sort((a, b) =>
      a.productId.localeCompare(b.productId)
    );
    const requestHash = await sha256(
      JSON.stringify({
        user: user.id,
        normalizedLines,
        province,
        postalCode,
        locality,
        deliveryType,
      }),
    );
    const ttlMinutes = Math.max(
      5,
      positiveEnv("SHIPPING_QUOTE_TTL_MINUTES", 1440),
    );
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    const destination = {
      province,
      postalCode,
      locality,
      localityId: localityId || null,
      deliveryType,
    };
    const records = quotes.slice(0, 20).map((quote) => ({
      id: crypto.randomUUID(),
      customer_id: user.id,
      provider: provider.id,
      request_hash: requestHash,
      carrier_id: quote.carrierId,
      carrier_name: quote.carrierName,
      dispatch_mode: quote.dispatchMode,
      delivery_mode: quote.deliveryMode,
      service: quote.service,
      amount: quote.amount,
      eta_hours: quote.etaHours,
      branch_id: quote.branchId,
      branch_name: quote.branchName,
      branch_address: quote.branchAddress,
      packages: assessment.packages,
      destination,
      expires_at: expiresAt,
    }));
    const { error: insertError } = await db.from("shipping_quotes").insert(
      records,
    );
    if (insertError) {
      throw new HttpError(503, "No se pudieron guardar las opciones de envío.");
    }

    return json(request, {
      status: "quoted",
      expiresAt,
      options: records.map((record) => ({
        id: record.id,
        provider: record.provider,
        carrierId: record.carrier_id,
        carrierName: record.carrier_name,
        service: record.service,
        amount: record.amount,
        etaHours: record.eta_hours,
        deliveryType,
        branchId: record.branch_id,
        branchName: record.branch_name,
        branchAddress: record.branch_address,
      })),
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
