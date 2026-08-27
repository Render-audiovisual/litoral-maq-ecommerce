import type { Product } from "@/lib/types";

export const LAUNCH_PRODUCT_MODELS = [
  "OEH04",
  "OEAC04",
  "EMA804",
  "VC35/220",
  "VC18/1/220",
  "A1170/220",
  "CS58",
  "ID13/2/220",
  "TP413/7/220K",
  "TP813/18C1",
  "P20C1",
  "DDI10/2/12C1",
  "AG15/3/220",
  "AA415/2/220VVM",
  "AA518/220PLUS",
  "AA11115/20C1",
  "P12/2/25",
  "EVP818/43-1",
  "HL7000/220M",
  "LI1065/20C1",
  "IMET140/2/220",
  "BWIR150",
  "JT1012 1/2",
] as const;

export const LAUNCH_BEST_SELLER_MODELS = [
  "ID13/2/220",
  "TP413/7/220K",
  "TP813/18C1",
  "P20C1",
  "DDI10/2/12C1",
  "AG15/3/220",
  "AA415/2/220VVM",
  "AA518/220PLUS",
  "AA11115/20C1",
  "CS58",
] as const;

export const LAUNCH_FEATURED_MODELS = [
  "OEH04",
  "OEAC04",
  "EMA804",
  "VC35/220",
  "VC18/1/220",
  "A1170/220",
  "P12/2/25",
  "EVP818/43-1",
  "HL7000/220M",
  "LI1065/20C1",
] as const;

export const LAUNCH_FAMILIES = [
  {
    slug: "taladros",
    label: "Taladros",
    description: "Perforación y atornillado",
    image: "/promos/taladro-energy-550w.jpg",
    pattern: /^(TALADRO|ATORNILLADOR)/,
  },
  {
    slug: "amoladoras",
    label: "Amoladoras",
    description: "Corte y desbaste",
    image: "/products/AMOLADORA ANGULAR.png",
    pattern: /^AMOLADORA/,
  },
  {
    slug: "escaleras",
    label: "Escaleras",
    description: "Para el hogar y la obra",
    image: "/promos/escalera-obra-multifuncion.jpg",
    pattern: /^ESCALERA/,
  },
  {
    slug: "soldadoras",
    label: "Soldadoras",
    description: "Equipos para unir y reparar",
    image: "/products/SOLDADORA 3 en 1.png",
    pattern: /^SOLDADORA/,
  },
  {
    slug: "compresores",
    label: "Compresores",
    description: "Aire para el taller y el trabajo",
    image: "/categories/compresores-cliente.jpg",
    pattern: /^COMPRESOR/,
  },
  {
    slug: "aspiradoras",
    label: "Aspiradoras",
    description: "Limpieza para taller y obra",
    image: "/categories/aspiradora-energy-vc35.webp",
    pattern: /^(ASPIRADORA|SOPLOASPIRADOR)/,
  },
  {
    slug: "motosierras",
    label: "Motosierras",
    description: "Potencia para corte exterior",
    image: "/promos/motosierra-knock-out.jpg",
    pattern: /^(MOTOSIERRA|ELECTROSIERRA|MINI MOTOSIERRA)/,
  },
  {
    slug: "kits-herramientas",
    label: "Kits de herramientas",
    description: "Todo listo en un solo equipo",
    image: "/promos/maletin-tubos-criquet.jpg",
    pattern: /^(JUEGO DE TUBOS|MALET[IÍ]N|LLAVE DE IMPACTO)/,
  },
] as const;

export type LaunchFamilySlug = (typeof LAUNCH_FAMILIES)[number]["slug"];

function normalizedName(product: Product) {
  return product.name.toUpperCase();
}

function hasExactModel(name: string, model: string) {
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(name);
}

function productsInModelOrder(products: Product[], models: readonly string[]) {
  const activeProducts = products.filter((product) => product.active);
  return models.flatMap((model) => {
    const product = activeProducts.find((item) => hasExactModel(normalizedName(item), model));
    return product ? [product] : [];
  });
}

export function isLaunchProduct(product: Product) {
  const name = normalizedName(product);
  return LAUNCH_PRODUCT_MODELS.some((model) => hasExactModel(name, model));
}

export function getLaunchProducts(products: Product[]) {
  return products.filter(
    (product) => product.active && Boolean(product.image) && Boolean(product.description),
  );
}

export function getLaunchBestSellers(products: Product[]) {
  const published = getLaunchProducts(products);
  const preferred = productsInModelOrder(published, LAUNCH_BEST_SELLER_MODELS);
  return [...preferred, ...published.filter((product) => !preferred.some((item) => item.id === product.id))].slice(0, 10);
}

export function getLaunchFeaturedProducts(products: Product[]) {
  const published = getLaunchProducts(products);
  const excluded = new Set(getLaunchBestSellers(published).map((product) => product.id));
  const preferred = productsInModelOrder(published, LAUNCH_FEATURED_MODELS).filter(
    (product) => !excluded.has(product.id),
  );
  return [
    ...preferred,
    ...published.filter(
      (product) => !excluded.has(product.id) && !preferred.some((item) => item.id === product.id),
    ),
  ].slice(0, 10);
}

export function getLaunchBestSellerRankMap(products: Product[]) {
  return new Map(getLaunchBestSellers(products).map((product, index) => [product.id, index + 1]));
}

export function matchesLaunchFamily(product: Product, slug: string) {
  const family = LAUNCH_FAMILIES.find((item) => item.slug === slug);
  return family ? family.pattern.test(normalizedName(product)) : true;
}

export function getLaunchFamilyCards(products: Product[]) {
  return LAUNCH_FAMILIES.map((family) => {
    const familyProducts = products.filter((product) => family.pattern.test(normalizedName(product)));
    const prices = familyProducts
      .map((product) => product.price)
      .filter((price): price is number => price !== null);
    const priceFrom = prices.length ? Math.min(...prices) : null;
    return {
      ...family,
      productCount: familyProducts.length,
      priceFrom,
      representativeProduct:
        familyProducts.find((product) => product.image && product.price === priceFrom) ??
        familyProducts.find((product) => product.image) ??
        familyProducts[0] ??
        null,
    };
  }).filter((family) => family.productCount > 0 && family.priceFrom !== null);
}
