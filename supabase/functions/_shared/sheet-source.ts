import {
  LITORAL_SHEET_CSV_URL,
  LITORAL_SHEET_ID,
  looksLikeHtml,
  parseCsv,
} from "./sheet-parser.ts";
import { HttpError } from "./http.ts";

const TIMEOUT_MS = 20_000;
const SHEET_RANGE = Deno.env.get("GOOGLE_SHEET_RANGE") || "A:Z";

export type SheetRead = { rows: string[][]; source: string };

type ServiceAccount = { client_email: string; private_key: string };

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSegment(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** El private_key del JSON viene con "\n" literales cuando se guarda como
 * secreto de una sola línea: hay que devolverle los saltos reales antes de
 * que crypto.subtle pueda importarlo. */
function pemToPkcs8(pem: string) {
  const body = pem
    .replace(/\n/g, "\n")
    .replace(/-----(?:BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function readServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw?.trim()) return null;
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(
      503,
      "GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido. Revisá el secreto en Supabase.",
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new HttpError(
      503,
      "GOOGLE_SERVICE_ACCOUNT_JSON no tiene client_email y private_key.",
    );
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

async function accessToken(account: ServiceAccount) {
  const issued = Math.floor(Date.now() / 1000);
  const claim = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: issued,
    exp: issued + 3600,
  };
  const payload = `${encodeSegment({ alg: "RS256", typ: "JWT" })}.${
    encodeSegment(claim)
  }`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(payload),
  );
  const assertion = `${payload}.${base64Url(new Uint8Array(signature))}`;
  const response = await withTimeout((signal) =>
    fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    })
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new HttpError(
      502,
      `Google rechazó las credenciales de servicio (${response.status}). Verificá que el Sheet esté compartido con ${account.client_email}.`,
    );
  }
  return body.access_token as string;
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>) {
  return (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  })();
}

/** Un solo reintento: alcanza para un corte de red puntual y evita que un
 * Sheet caído multiplique las llamadas hasta agotar el tiempo de la Edge
 * Function. */
async function once<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return await run();
  }
}

async function readWithApi(account: ServiceAccount): Promise<SheetRead> {
  const token = await accessToken(account);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${LITORAL_SHEET_ID}/values/${
      encodeURIComponent(SHEET_RANGE)
    }?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
  const response = await withTimeout((signal) =>
    fetch(url, { signal, headers: { authorization: `Bearer ${token}` } })
  );
  if (!response.ok) {
    throw new HttpError(
      502,
      `Google Sheets API respondió ${response.status}. No se tocó el catálogo.`,
    );
  }
  const body = await response.json() as { values?: unknown[][] };
  const rows = (body.values || []).map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
  );
  return { rows, source: "Google Sheets API v4 · Lista de precios LitoralMaq" };
}

async function readWithCsv(): Promise<SheetRead> {
  const response = await withTimeout((signal) =>
    fetch(`${LITORAL_SHEET_CSV_URL}&_=${Date.now()}`, {
      signal,
      cache: "no-store",
    })
  );
  if (!response.ok) {
    throw new HttpError(
      502,
      `Google Sheets respondió ${response.status}. No se tocó el catálogo.`,
    );
  }
  const body = await response.text();
  if (looksLikeHtml(body, response.headers.get("content-type"))) {
    throw new HttpError(
      502,
      "Google devolvió una página de inicio de sesión en lugar del Sheet. Revisá que siga compartido por link, o cargá GOOGLE_SERVICE_ACCOUNT_JSON.",
    );
  }
  return {
    rows: parseCsv(body),
    source: "Google Sheet CSV publicado · Lista de precios LitoralMaq",
  };
}

/**
 * Con credencial de servicio usa la API (el Sheet puede estar privado y los
 * errores llegan explícitos); sin ella cae al CSV publicado, que es lo que
 * funciona hoy. Cargar el secreto GOOGLE_SERVICE_ACCOUNT_JSON alcanza para
 * pasar de una a la otra: no hay que redesplegar la función.
 */
export function readSheet(): Promise<SheetRead> {
  const account = readServiceAccount();
  return once(() => (account ? readWithApi(account) : readWithCsv()));
}
