import { ProductDetailClient } from "./product-detail-client";
import productsSeed from "@/data/products.json";
import type { Product } from "@/lib/types";

export function generateStaticParams() {
  return (productsSeed as Product[]).map((product) => ({
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
