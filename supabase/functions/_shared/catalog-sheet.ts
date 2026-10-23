export type CatalogSheetRow = {
  code: string;
  name: string;
  price: number;
  rawPrice: string;
  sourceRow: number;
  slug: string;
  // null: el Sheet no trae columna de stock o la celda está vacía.
  stock: number | null;
};

export type ParsedCatalogSheet = {
  rows: CatalogSheetRow[];
  headers: string[];
  invalidRows: number[];
  // Filas con código y artículo, pero precio ilegible (p.ej. "############"
  // por un formato de celda angosto en Sheets). El llamador puede optar por
  // conservar el precio actual de estos códigos en vez de retirarlos.
  unpriceable: { code: string; sourceRow: number }[];
};

export class CatalogSheetValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "CatalogSheetValidationError";
  }
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new CatalogSheetValidationError(
      "El CSV del Sheet contiene una celda entre comillas sin cerrar.",
    );
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parsePrice(value: string) {
  const compact = value.replace(/\$/g, "").replace(/\s/g, "");
  if (!compact) return null;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if ((compact.match(/\./g) || []).length > 1) {
    normalized = compact.replace(/\./g, "");
  } else if (lastDot >= 0 && compact.length - lastDot - 1 === 3) {
    normalized = compact.replace(".", "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Topes de cordura: una celda mal cargada (o un Sheet adulterado) no debe
// abortar el sync ni publicar precios absurdos. Fuera de rango = fila ilegible,
// y para productos que ya existen se conserva el precio anterior.
export const MAX_PRICE = 100_000_000;
export const MAX_STOCK = 1_000_000;
export const MAX_NAME_LENGTH = 200;

/**
 * Solo enteros ("12", "-3", "2,0"). "1.234" (miles) o "2,5" son ambiguos: se
 * descartan (null = conservar el stock actual) en vez de adivinar. Negativos
 * del sistema de stock se llevan a 0.
 */
export function parseStock(raw: string): number | null {
  const value = raw.trim();
  if (!/^-?\d+([.,]0+)?$/.test(value)) return null;
  const parsed = Math.trunc(Number(value.replace(",", ".")));
  if (parsed > MAX_STOCK) return null;
  return Math.max(0, parsed);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseCatalogSheet(csv: string, minimumRows = 100): ParsedCatalogSheet {
  const parsedRows = parseCsv(csv);
  if (parsedRows.length < 2) {
    throw new CatalogSheetValidationError("El Sheet no contiene productos.");
  }

  const rawHeaders = parsedRows[0].map((header) => header.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const codeIndex = headers.findIndex((header) => ["codigo", "cod", "sku"].includes(header));
  const nameIndex = headers.findIndex((header) => ["articulo", "producto", "nombre"].includes(header));
  // "precio" con prefijo: cubre "precio", "preciocon", "preciocontado" y variantes como
  // "Precio con IVA" (normaliza a "precioconiva"), que rompían el match exacto anterior.
  const priceIndex = headers.findIndex((header) => header.startsWith("precio"));
  const stockIndex = headers.indexOf("stock");
  if ([codeIndex, nameIndex, priceIndex].some((index) => index < 0)) {
    throw new CatalogSheetValidationError(
      `Encabezados inválidos. Se esperaba código, artículo y precio; llegaron: ${rawHeaders.join(", ")}.`,
    );
  }

  const seenCodes = new Set<string>();
  const invalidRows: number[] = [];
  const unpriceable: { code: string; sourceRow: number }[] = [];
  const rows: CatalogSheetRow[] = [];
  for (let index = 1; index < parsedRows.length; index += 1) {
    const sourceRow = index + 1;
    const source = parsedRows[index];
    // El Sheet trae ceros a la izquierda ("02635"); el catálogo usa "2635".
    const code = (source[codeIndex] || "").trim().replace(/^0+(?=\d)/, "");
    const name = (source[nameIndex] || "").trim();
    const rawPrice = (source[priceIndex] || "").trim();
    const price = parsePrice(rawPrice);
    const rawStock = stockIndex >= 0 ? (source[stockIndex] || "").trim() : "";
    const stock = parseStock(rawStock);
    if (!code || !name || price === null || price > MAX_PRICE || name.length > MAX_NAME_LENGTH) {
      invalidRows.push(sourceRow);
      if (code && name) unpriceable.push({ code, sourceRow });
      continue;
    }
    if (seenCodes.has(code)) {
      throw new CatalogSheetValidationError(`El código ${code} está duplicado en el Sheet.`);
    }
    seenCodes.add(code);
    rows.push({
      code,
      name,
      price,
      rawPrice,
      sourceRow,
      slug: `${slugify(name)}-${slugify(code)}`,
      stock,
    });
  }

  // Filas incompletas o con precio ilegible (p.ej. "############" por un
  // formato de celda angosto en Sheets) se descartan en vez de cancelar toda
  // la sincronización: el resto del catálogo sí se actualiza, y el llamador
  // decide qué avisar con `invalidRows`.
  if (rows.length < minimumRows) {
    throw new CatalogSheetValidationError(
      `El Sheet devolvió solo ${rows.length} productos válidos. Se canceló la sincronización por seguridad.`,
    );
  }

  return { rows, headers: rawHeaders, invalidRows, unpriceable };
}
