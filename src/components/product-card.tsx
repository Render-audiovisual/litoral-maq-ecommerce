"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import {
  availabilityLabel,
  canAddProductToCart,
  getProductAvailability,
} from "@/lib/product-availability";

export function ProductCard({
  product,
  badge,
  imageOverride,
}: {
  product: Product;
  /** `null` apaga también el "Destacado" automático (p. ej. dentro de una sección de destacados). */
  badge?: string | null;
  imageOverride?: string;
}) {
  const { addToCart } = useStore();
  const productHref = `/producto?slug=${encodeURIComponent(product.slug)}`;
  const productImage = imageOverride || product.image;
  const availability = getProductAvailability(product);
  return (
    <article className="product-card">
      <Link href={productHref} className="product-image">
        {productImage ? (
          <Image
            src={productImage}
            alt={product.name}
            fill
            sizes="(max-width: 700px) 50vw, 25vw"
          />
        ) : (
          <div className="product-placeholder">
            <span>LM</span>
            <small>Imagen pendiente</small>
          </div>
        )}
        {badge !== null && (badge || product.featured) && <span className="product-badge">{badge || "Destacado"}</span>}
      </Link>
      <div className="product-card-body">
        <span className="eyebrow">{product.brand}</span>
        <Link href={productHref} className="product-name">
          {product.name}
        </Link>
        <span className="product-code">Cód. {product.code}</span>
        <strong className="product-price">{formatCurrency(product.price)}</strong>
        <span className={`stock ${availability === "available" || availability === "sheet-managed" ? "in" : availability === "unknown" ? "pending" : "out"}`}>
          {availabilityLabel(product)}
        </span>
        <button
          type="button"
          className="button primary full"
          disabled={!canAddProductToCart(product)}
          onClick={() => addToCart(product.id)}
        >
          Agregar al carrito
        </button>
      </div>
    </article>
  );
}
