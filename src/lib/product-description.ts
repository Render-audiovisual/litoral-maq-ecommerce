export type ProductSpec = { label: string; value: string };
export type ParsedProductDescription = {
  intro: string;
  specs: ProductSpec[];
  extras: string[];
  contents: string;
};

const CONTENTS = /^(?:contenido|contiene|incluye)\s*(?:[.:]\s*(.*))?$/i;
const HEADING = /^datos t[eé]cnicos\s*:?$/i;
const BULLET = /^[•\-*]\s*/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9¿¡])/; // un punto pegado (1.8m) nunca corta

// "Etiqueta: valor" cortando en el primer ": ". Las viñetas admiten puntos en la etiqueta ("Torque máx.").
function toSpec(text: string, allowDots: boolean): ProductSpec | null {
  const i = text.indexOf(": ");
  if (i < 0) return null;
  const label = text.slice(0, i).trim();
  const value = text.slice(i + 2).trim().replace(/\.$/, "");
  if (!label || !value || label.length > 45 || (!allowDots && label.includes("."))) return null;
  return { label, value };
}

export function parseProductDescription(raw?: string | null): ParsedProductDescription {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  const out: ParsedProductDescription = { intro: "", specs: [], extras: [], contents: "" };
  if (!text) return out;

  const contents: string[] = [];
  const multiline = text.includes("\n");
  // Sin saltos de línea, cada oración hace de línea; el marcador puede ser una oración sola ("Contiene.").
  const lines = (multiline ? text.split("\n") : text.split(SENTENCE_SPLIT)).map((l) => l.trim());
  let inContents = false;
  let introDone = false;

  for (const line of lines) {
    if (inContents) {
      if (line) contents.push(line);
      continue;
    }
    if (!line) {
      if (out.intro) introDone = true;
      continue;
    }
    const marker = CONTENTS.exec(line);
    if (marker) {
      inContents = true;
      if (marker[1]) contents.push(marker[1]);
      continue;
    }
    if (HEADING.test(line)) {
      introDone = true;
      continue;
    }
    if (!introDone) {
      // La introducción es el primer párrafo (o la primera oración).
      out.intro = multiline && out.intro ? `${out.intro} ${line}` : line;
      introDone = !multiline;
      continue;
    }
    const isBullet = BULLET.test(line);
    const body = line.replace(BULLET, "");
    const spec = toSpec(body, multiline);
    if (spec) out.specs.push(spec);
    else if (isBullet || !multiline) out.extras.push(body.replace(/\.$/, ""));
  }

  out.contents = contents.join(" ");
  return out;
}
