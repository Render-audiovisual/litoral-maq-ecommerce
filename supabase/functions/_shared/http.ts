import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2.111.0";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function allowedOrigins() {
  const configured = (Deno.env.get("CORS_ALLOWED_ORIGINS") || "").split(",");
  return [...new Set([
    "http://localhost:3000",
    "https://litoralmaqrender.rendercorrientes.com",
    "https://admin-litoralmaqrender.rendercorrientes.com",
    Deno.env.get("STORE_PUBLIC_URL") || "",
    Deno.env.get("ADMIN_PUBLIC_URL") || "",
    ...configured,
  ].map((value) => value.trim()).filter(Boolean))];
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins();
  const selected = allowed.includes("*")
    ? "*"
    : allowed.includes(origin)
    ? origin
    : allowed[0] || "null";
  return {
    "access-control-allow-origin": selected,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function handleOptions(request: Request) {
  return new Response("ok", { headers: corsHeaders(request) });
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRole) {
    throw new HttpError(503, "El backend todavía no está configurado.");
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(
  request: Request,
  client = serviceClient(),
): Promise<User> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new HttpError(401, "Necesitás una sesión válida para continuar.");
  }
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, "La sesión venció. Volvé a intentar.");
  }
  return data.user;
}

export async function requireAdmin(request: Request, client = serviceClient()) {
  const user = await requireUser(request, client);
  const { data, error } = await client.from("profiles").select("role").eq(
    "id",
    user.id,
  ).maybeSingle();
  if (error || data?.role !== "admin") {
    throw new HttpError(
      403,
      "Esta operación requiere una sesión administrativa.",
    );
  }
  return user;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) =>
    item.toString(16).padStart(2, "0")
  ).join("");
}

export function errorResponse(request: Request, error: unknown) {
  if (error instanceof HttpError) {
    return json(request, { error: error.message }, error.status);
  }
  const candidate = error as {
    status?: unknown;
    message?: unknown;
    retryable?: unknown;
  };
  const status = typeof candidate?.status === "number" ? candidate.status : 500;
  const message = typeof candidate?.message === "string" && status < 500
    ? candidate.message
    : status === 503
    ? String(candidate?.message || "El servicio no está disponible.")
    : "No se pudo completar la operación. Probá nuevamente.";
  return json(request, {
    error: message,
    retryable: Boolean(candidate?.retryable),
  }, status);
}
