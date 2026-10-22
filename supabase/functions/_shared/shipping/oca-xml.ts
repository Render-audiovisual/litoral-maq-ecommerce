// Parseo y armado de XML de OCA ePak. Funciones puras, sin red ni Deno, para
// poder testearlas con respuestas reales del ambiente QA.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(text: string) {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

/** Contenido interno de cada `<tag>…</tag>` (ignora los autocerrados). */
export function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*[^/>])?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((match) => match[1]);
}

export function value(xml: string, tag: string): string {
  const found = blocks(xml, tag)[0];
  return found === undefined ? "" : decode(found).trim();
}

export type OcaTariff = {
  amount: number;
  days: number | null;
};

export function parseTariffs(xml: string): OcaTariff[] {
  return blocks(xml, "Table").flatMap((row) => {
    const total = Number(value(row, "Total"));
    if (!Number.isFinite(total) || total <= 0) return [];
    const days = Number(value(row, "PlazoEntrega"));
    return [{ amount: total, days: Number.isFinite(days) ? days : null }];
  });
}

export type OcaBranch = {
  id: string;
  name: string;
  address: string;
  acceptsDelivery: boolean;
};

export function parseBranches(xml: string): OcaBranch[] {
  return blocks(xml, "Centro").map((centro) => {
    const services = blocks(centro, "IdTipoServicio").map((id) => id.trim());
    const street = [value(centro, "Calle"), value(centro, "Numero")].filter(
      Boolean,
    ).join(" ");
    return {
      id: value(centro, "IdCentroImposicion"),
      name: value(centro, "Sucursal"),
      address: [street, value(centro, "Localidad")].filter(Boolean).join(", "),
      // 1 = admisión de paquetes, 2 = entrega de paquetes.
      acceptsDelivery: services.includes("2"),
    };
  }).filter((branch) => branch.id);
}

export type OcaCreated = {
  orderId: string;
  shipmentId: string;
  state: string;
  rejected: number;
};

export function parseCreated(xml: string): OcaCreated | null {
  const detail = blocks(xml, "DetalleIngresos")[0];
  const summary = blocks(xml, "Resumen")[0] || "";
  const orderId = detail ? value(detail, "OrdenRetiro") : "";
  const shipmentId = detail ? value(detail, "NumeroEnvio") : "";
  if (!orderId || !shipmentId) return null;
  return {
    orderId,
    shipmentId,
    state: value(detail, "Estado"),
    rejected: Number(value(summary, "CantidadRechazados")) || 0,
  };
}

export type OcaTrackingEvent = { date: string; message: string };

export function parseTracking(xml: string): OcaTrackingEvent[] {
  return blocks(xml, "Table").map((row) => ({
    date: value(row, "fecha"),
    // OCA escribe mal el tag ("Desdcripcion_Estado"); aceptamos ambos.
    message: value(row, "Desdcripcion_Estado") || value(row, "Descripcion_Estado"),
  })).filter((event) => event.message)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function parsePdfBase64(xml: string): string {
  return value(xml, "string").replace(/\s+/g, "");
}

/** Resultado de AnularOrdenGenerada: 100 = anulada. */
export function parseCancel(xml: string) {
  return {
    code: Number(value(xml, "IdResult")),
    message: value(xml, "Mensaje"),
  };
}

// --- Armado del XML de IngresoORMultiplesRetiros_v2 -------------------------

/** Quita tildes y los caracteres que OCA no admite (| & < >), y recorta. */
export function clean(input: string | undefined | null, max: number) {
  return (input || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[|&<>"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type OcaPackage = {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightKg: number;
  declaredValue: number;
};

export type OcaShipmentXmlInput = {
  account: string;
  operativa: string;
  costCenter: string;
  pickupDate: string; // AAAAMMDD
  pickupSlot: string; // 1 = 8-17, 2 = 8-12, 3 = 14-17
  remito: string;
  origin: {
    street: string;
    number: string;
    postalCode: string;
    locality: string;
    province: string;
    contact: string;
    email: string;
  };
  recipient: {
    lastName: string;
    firstName: string;
    street: string;
    number: string;
    floor: string;
    apartment: string;
    postalCode: string;
    locality: string;
    province: string;
    phone: string;
    email: string;
    notes: string;
    branchId: string; // "0" si es a domicilio
  };
  packages: OcaPackage[];
};

const num = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

export function buildShipmentXml(input: OcaShipmentXmlInput): string {
  const o = input.origin;
  const r = input.recipient;
  const packages = input.packages.map((p) =>
    `<paquete alto="${num(p.heightCm)}" ancho="${num(p.widthCm)}" largo="${
      num(p.lengthCm)
    }" peso="${num(p.weightKg)}" valor="${num(p.declaredValue)}" cant="1" />`
  ).join("");
  return `<?xml version="1.0" encoding="iso-8859-1" standalone="yes"?>` +
    `<ROWS><cabecera ver="2.0" nrocuenta="${
      clean(input.account, 10)
    }" origen="API" />` +
    `<origenes><origen calle="${clean(o.street, 30)}" nro="${
      clean(o.number, 5)
    }" piso="" depto="" cp="${clean(o.postalCode, 4)}" localidad="${
      clean(o.locality, 30)
    }" provincia="${clean(o.province, 30)}" contacto="${
      clean(o.contact, 30)
    }" email="${clean(o.email, 100)}" solicitante="${
      clean(o.contact, 30)
    }" observaciones="" centrocosto="${
      clean(input.costCenter, 10)
    }" idfranjahoraria="${clean(input.pickupSlot, 1)}" idcentroimposicionorigen="0" fecha="${
      clean(input.pickupDate, 10)
    }">` +
    `<envios><envio idoperativa="${clean(input.operativa, 6)}" nroremito="${
      clean(input.remito, 30)
    }">` +
    `<destinatario apellido="${clean(r.lastName, 30)}" nombre="${
      clean(r.firstName, 30)
    }" calle="${clean(r.street, 30)}" nro="${clean(r.number, 5)}" piso="${
      clean(r.floor, 6)
    }" depto="${clean(r.apartment, 4)}" localidad="${
      clean(r.locality, 30)
    }" provincia="${clean(r.province, 30)}" cp="${
      clean(r.postalCode, 4)
    }" telefono="${clean(r.phone, 30)}" email="${
      clean(r.email, 100)
    }" idci="${clean(r.branchId, 6)}" celular="${
      clean(r.phone, 15)
    }" observaciones="${clean(r.notes, 100)}" />` +
    `<paquetes>${packages}</paquetes></envio></envios></origen></origenes></ROWS>`;
}

// --- Helpers de datos --------------------------------------------------------

/** Código ISO de provincia argentina (el que usa el checkout) → nombre. */
const PROVINCES: Record<string, string> = {
  A: "Salta",
  B: "Buenos Aires",
  C: "Capital Federal",
  D: "San Luis",
  E: "Entre Rios",
  F: "La Rioja",
  G: "Santiago del Estero",
  H: "Chaco",
  J: "San Juan",
  K: "Catamarca",
  L: "La Pampa",
  M: "Mendoza",
  N: "Misiones",
  P: "Formosa",
  Q: "Neuquen",
  R: "Rio Negro",
  S: "Santa Fe",
  T: "Tucuman",
  U: "Chubut",
  V: "Tierra del Fuego",
  W: "Corrientes",
  X: "Cordoba",
  Y: "Jujuy",
  Z: "Santa Cruz",
};

export function provinceName(code: string) {
  return PROVINCES[code.trim().toUpperCase()] || code;
}

/** Próximo día hábil (lun-vie) en hora de Argentina, formato AAAAMMDD. */
export function nextPickupDate(now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 3600_000);
  do {
    ar.setUTCDate(ar.getUTCDate() + 1);
  } while ([0, 6].includes(ar.getUTCDay()));
  return ar.toISOString().slice(0, 10).replaceAll("-", "");
}
