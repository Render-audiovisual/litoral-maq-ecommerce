import { ProductDetailClient } from "./product-detail-client";
import productsSeed from "@/data/products.json";
import type { Product } from "@/lib/types";

// Genera página para TODOS los productos conocidos, no solo los activos al
// momento del build: el catálogo se auto-sincroniza cada pocas horas en
// Supabase y activa/desactiva productos sin disparar un deploy. Si filtrara
// por activo acá, un producto recién activado en la base no tendría página
// (404 real del hosting estático) hasta el próximo deploy. El componente
// cliente ya decide con el dato en vivo si el producto está disponible.
export function generateStaticParams() {
  return (productsSeed as Product[])
    .filter((product) => product.slug)
    .map((product) => ({
      slug: product.slug,
    }));
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}
