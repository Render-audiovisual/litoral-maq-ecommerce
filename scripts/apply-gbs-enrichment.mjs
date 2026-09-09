import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const productsPath = path.join(process.cwd(), "src", "data", "products.json");
const sourcesPath = path.join(process.cwd(), "src", "data", "product-enrichment-sources.json");
const catalogDir = path.join(process.cwd(), "public", "products", "catalog");
const specsDir = path.join(process.cwd(), "public", "products", "specs");

const entries = [
  {
    id: "1779",
    model: "P12/2/25",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_87?searchCode=P12%2F2%2F25",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_087.jpg",
    fileStem: "1779-p12-2-25-gbs",
    crop: { left: 465, top: 80, width: 715, height: 745 },
    description:
      "Electrobomba periférica Energy P12/2/25 de 1/2 HP (0,37 kW), para alimentación 220 V y 50 Hz. Entrega hasta 28 L/min, con altura máxima de 16 m y succión máxima de 8 m. Posee conexiones de entrada y salida de 1 pulgada, aislación Clase I y pesa 3,45 kg. Recomendada para riego de jardines, transferencia de agua, piscinas y uso doméstico.",
  },
  {
    id: "3217",
    model: "DP06",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_244?searchCode=DP06",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_244.jpg",
    fileStem: "3217-dp06-gbs",
    crop: { left: 455, top: 70, width: 360, height: 790 },
    description:
      "Alicate de corte oblicuo Energy DP06 de 6 pulgadas. Fabricado en acero #45, con mangos ergonómicos revestidos para un agarre firme. Indicado para trabajos con cables y para cortar distintos tipos de alambre. El contenido incluye un alicate de corte oblicuo de 6 pulgadas.",
  },
  {
    id: "3384",
    model: "GWP2/1",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_227?searchCode=GWP2%2F1",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_227.jpg",
    fileStem: "3384-gwp2-1-gbs",
    crop: { left: 430, top: 125, width: 620, height: 620 },
    description:
      "Motobomba a gasolina Energy GWP2/1 con motor de 196 cc y potencia máxima de 6,5 HP. Posee entrada y salida de 2 pulgadas (50 mm), caudal de hasta 40 m³/h, altura máxima de 30 m y succión máxima de 7 m. Cuenta con arranque por retroceso, tanque de 3,6 L y un peso de 23 kg.",
  },
  {
    id: "3389",
    model: "CT10",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_254?searchCode=CT10",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_254.jpg",
    fileStem: "3389-ct10-gbs",
    crop: { left: 130, top: 110, width: 980, height: 500 },
    description:
      "Cúter Energy CT10 con cuerpo de aleación de zinc y hoja de acero al carbón. Utiliza hojas de 60 mm de largo y 19 mm de ancho, e incorpora funciones auto-lock y auto retráctil. Incluye dos hojas de corte adicionales guardadas en un compartimiento. Apto para papel, cartón, poliestireno expandido, plástico fino, vinilos, cintas, goma EVA, telas, alfombras y cueros.",
  },
  {
    id: "3535",
    model: "LI12650/20K2-4",
    brand: "NEO NEXT",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/NEO_23?searchCode=LI12650%2F20K2-4",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/NEO_-_Catalogo_interactivo_2026_Page_023.jpg",
    fileStem: "3535-li12650-20k2-4-gbs",
    crop: { left: 630, top: 20, width: 525, height: 790 },
    description:
      "Llave de impacto recargable NEO Next LI12650/20K2-4 con motor brushless, encastre de 1/2 pulgada y tres niveles de torque: 350, 460 y 650 Nm. Alcanza un torque máximo de ruptura de 950 Nm, con velocidades de hasta 2600 rpm e impactos de hasta 2900 bpm. Tensión nominal de 18 V y máxima de 20 V. El kit incluye dos baterías de 4 Ah, cargador base de 4 A y maletín plástico.",
  },
  {
    id: "3657",
    model: "AG115/1/220",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_31?searchCode=AG115%2F1%2F220",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_031.jpg",
    fileStem: "3657-ag115-1-220-gbs",
    crop: { left: 290, top: 105, width: 1140, height: 570 },
    description:
      "Amoladora angular Energy Economy AG115/1/220 de 720 W para discos de 115 mm (4 1/2 pulgadas). Funciona con alimentación de 220 V, alcanza 11.000 rpm en vacío y pesa 1,85 kg. Posee aislación Clase II e incluye una amoladora angular.",
  },
  {
    id: "3770",
    model: "SP25",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_277?searchCode=SP25",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_277.jpg",
    fileStem: "3770-sp25-gbs",
    crop: { left: 330, top: 170, width: 790, height: 490 },
    description:
      "Set Energy SP25 de 25 puntas profesionales fabricadas en acero S2, presentado en maletín plástico. Incluye 6 puntas Phillips, 3 Pozidriv, 5 planas, 3 hexagonales, 7 Torx y un soporte universal magnético.",
  },
  {
    id: "3771",
    model: "SP32",
    brand: "ENERGY",
    sourceUrl: "https://gbs-corp.com/system/onlinecatalogs/ENERGY_278?searchCode=SP32",
    imageUrl: "https://gbs-corp.com/system/onlinecatalogs/catalogPageImages/ENERGY_-_Catalogo_interactivo_2026_Page_278.jpg",
    fileStem: "3771-sp32-gbs",
    crop: { left: 445, top: 255, width: 555, height: 585 },
    description:
      "Set Energy SP32 de 32 puntas profesionales de acero S2 con maletín plástico. Incluye 4 puntas Phillips, 4 Pozidriv, 4 planas, 4 hexagonales, 7 Torx, 7 Torx resistentes, un adaptador y un portapuntas quick release.",
  },
];

async function download(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "LitoralMaqCatalogEnrichment/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} al descargar ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

await mkdir(catalogDir, { recursive: true });
await mkdir(specsDir, { recursive: true });

const products = JSON.parse(await readFile(productsPath, "utf8"));
const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const productsById = new Map(products.map((product) => [product.id, product]));

for (const entry of entries) {
  const product = productsById.get(entry.id);
  if (!product || !product.name.toUpperCase().includes(entry.model)) {
    throw new Error(`El producto ${entry.id} no coincide con el modelo ${entry.model}.`);
  }

  const sourceImage = await download(entry.imageUrl);
  const primaryRelative = `/products/catalog/${entry.fileStem}.webp`;
  const specsRelative = `/products/specs/${entry.fileStem}-ficha.webp`;

  await sharp(sourceImage)
    .extract(entry.crop)
    .resize({
      width: 1000,
      height: 1000,
      fit: "contain",
      background: { r: 8, g: 24, b: 31 },
    })
    .webp({ quality: 90 })
    .toFile(path.join(catalogDir, `${entry.fileStem}.webp`));

  await sharp(sourceImage)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(path.join(specsDir, `${entry.fileStem}-ficha.webp`));

  product.brand = entry.brand;
  product.image = primaryRelative;
  product.images = [primaryRelative, specsRelative];
  product.description = entry.description;
  product.incomplete = product.incomplete.filter(
    (field) => field !== "image" && field !== "description",
  );

  const sourceRecord = {
    productId: entry.id,
    model: entry.model,
    match: "exact_model",
    productSourceUrl: entry.sourceUrl,
    imageSourceUrl: entry.imageUrl,
    localImage: primaryRelative,
    specificationImage: specsRelative,
    descriptionImported: true,
    conflictsSkipped: [],
    verifiedAt: "2026-09-09",
  };
  const sourceIndex = sources.findIndex((source) => source.productId === entry.id);
  if (sourceIndex >= 0) sources[sourceIndex] = sourceRecord;
  else sources.push(sourceRecord);
}

await writeFile(productsPath, `${JSON.stringify(products, null, 2)}\n`);
await writeFile(
  sourcesPath,
  `${JSON.stringify(sources, null, 2)}\n`,
);

console.log(JSON.stringify({ enriched: entries.length, ids: entries.map((entry) => entry.id) }, null, 2));
