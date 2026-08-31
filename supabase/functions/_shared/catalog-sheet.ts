export type CatalogSheetRow = {
  code: string;
  name: string;
  price: number;
  rawPrice: string;
  sourceRow: number;
  slug: string;
};

export type ParsedCatalogSheet = {
  rows: CatalogSheetRow[];
  headers: string[];
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
  const priceIndex = headers.findIndex((header) =>
    ["preciocon", "precio", "preciocontado"].includes(header)
  );
  if ([codeIndex, nameIndex, priceIndex].some((index) => index < 0)) {
    throw new CatalogSheetValidationError(
      `Encabezados inválidos. Se esperaba código, artículo y precio; llegaron: ${rawHeaders.join(", ")}.`,
    );
  }

  const seenCodes = new Set<string>();
  const invalidRows: number[] = [];
  const rows: CatalogSheetRow[] = [];
  for (let index = 1; index < parsedRows.length; index += 1) {
    const sourceRow = index + 1;
    const source = parsedRows[index];
    const code = (source[codeIndex] || "").trim();
    const name = (source[nameIndex] || "").trim();
    const rawPrice = (source[priceIndex] || "").trim();
    const price = parsePrice(rawPrice);
    if (!code || !name || price === null) {
      invalidRows.push(sourceRow);
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
    });
  }

  if (invalidRows.length) {
    throw new CatalogSheetValidationError(
      `Hay filas incompletas o con precio inválido: ${invalidRows.slice(0, 8).join(", ")}${
        invalidRows.length > 8 ? "…" : ""
      }.`,
    );
  }
  if (rows.length < minimumRows) {
    throw new CatalogSheetValidationError(
      `El Sheet devolvió solo ${rows.length} productos. Se canceló la sincronización por seguridad.`,
    );
  }

  return { rows, headers: rawHeaders };
}
