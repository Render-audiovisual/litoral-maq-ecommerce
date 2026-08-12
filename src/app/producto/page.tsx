"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProductDetailClient } from "@/app/productos/[slug]/product-detail-client";

function ProductContent() {
  const params = useSearchParams();
  return <ProductDetailClient slug={params.get("slug") || ""} />;
}

export default function ProductPage() {
  return <Suspense><ProductContent /></Suspense>;
}
