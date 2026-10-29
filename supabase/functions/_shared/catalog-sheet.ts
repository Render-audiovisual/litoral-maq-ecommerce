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
    const parsedStock = rawStock === "" ? NaN : Number(rawStock.replace(",", "."));
    const stock = Number.isFinite(parsedStock) ? Math.max(0, Math.floor(parsedStock)) : null;
    if (!code || !name || price === null) {
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

// Planilla aparte con peso y medidas embaladas por código. Va separada de la
// lista de precios porque los dueños re-suben ese .xls y se perderían columnas.

export type ShippingDimensionsRow = {
  code: string;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

export type ParsedShippingDimensions = {
  rows: ShippingDimensionsRow[];
  // Filas con código pero algún dato vacío o ilegible: se ignoran.
  incomplete: number[];
};

// Acepta "4,5", "4.5", "4,5 kg", "36cm". Devuelve null si no es un número > 0.
function parseMeasure(value: string) {
  const match = value.replace(/\s/g, "").replace(",", ".").match(
    /^(\d+(?:\.\d+)?)[a-z]*$/i,
  );
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 10_000
    ? parsed
    : null;
}

export function parseShippingDimensionsSheet(
  csv: string,
): ParsedShippingDimensions {
  const parsedRows = parseCsv(csv);
  const headers = (parsedRows[0] || []).map(normalizeHeader);
  const index = (prefix: string) =>
    headers.findIndex((header) => header.startsWith(prefix));
  const codeIndex = headers.findIndex((header) =>
    ["codigo", "cod", "sku"].includes(header)
  );
  const columns = {
    weightKg: index("peso"),
    heightCm: index("alto"),
    widthCm: index("ancho"),
    lengthCm: index("largo"),
  };
  if (codeIndex < 0 || Object.values(columns).some((i) => i < 0)) {
    throw new Error(
      "La planilla de medidas necesita las columnas Código, Peso, Alto, Ancho y Largo.",
    );
  }

  const rows: ShippingDimensionsRow[] = [];
  const incomplete: number[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < parsedRows.length; i += 1) {
    const source = parsedRows[i];
    const code = (source[codeIndex] || "").trim().replace(/^0+(?=\d)/, "");
    if (!code || seen.has(code)) continue;
    const weightKg = parseMeasure(source[columns.weightKg] || "");
    const heightCm = parseMeasure(source[columns.heightCm] || "");
    const widthCm = parseMeasure(source[columns.widthCm] || "");
    const lengthCm = parseMeasure(source[columns.lengthCm] || "");
    if (!weightKg || !heightCm || !widthCm || !lengthCm) {
      incomplete.push(i + 1);
      continue;
    }
    seen.add(code);
    // La base guarda cm enteros: se redondea hacia arriba para no subcotizar.
    rows.push({
      code,
      weightKg: Math.round(weightKg * 100) / 100,
      heightCm: Math.ceil(heightCm),
      widthCm: Math.ceil(widthCm),
      lengthCm: Math.ceil(lengthCm),
    });
  }
  return { rows, incomplete };
}
