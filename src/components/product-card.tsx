"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { productPhoto } from "@/lib/product-photos";
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
  const [added, setAdded] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productHref = `/producto?slug=${encodeURIComponent(product.slug)}`;
  const productImage = imageOverride?.trim() || productPhoto(product);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const availability = getProductAvailability(product);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const handleBuy = () => {
    addToCart(product.id);
    setAdded(true);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setAdded(false), 1_500);
  };

  return (
    <article className="product-card">
      <Link
        href={productHref}
        className="product-card-link"
        aria-label={`Ver ${product.name}`}
      />
      <div className="product-image">
        {productImage && failedImage !== productImage ? (
          <Image
            src={productImage}
            alt={product.name}
            fill
            sizes="(max-width: 700px) 50vw, 25vw"
            onError={() => setFailedImage(productImage)}
          />
        ) : (
          <div className="product-placeholder">
            <div className="product-placeholder-icon" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none" width="72" height="72">
                <path d="M39 10a15 15 0 0 0-18 19L9 41a8 8 0 0 0 11 11l12-12a15 15 0 0 0 19-18l-9 9-9-2-2-9 8-10Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="15" cy="47" r="2" fill="currentColor" />
              </svg>
            </div>
          </div>
        )}
        {badge !== null && (badge || product.featured) && <span className="product-badge">{badge || "Destacado"}</span>}
      </div>
      <div className="product-card-body">
        <span className="eyebrow">{product.brand}</span>
        <h3 className="product-name">
          {product.name}
        </h3>
        <span className="product-code">Cód. {product.code}</span>
        <strong className="product-price">{formatCurrency(product.price)}</strong>
        <span className={`stock ${availability === "available" || availability === "sheet-managed" ? "in" : availability === "unknown" ? "pending" : "out"}`}>
          {availabilityLabel(product)}
        </span>
        <button
          type="button"
          className="button primary full"
          disabled={!canAddProductToCart(product)}
          onClick={handleBuy}
        >
          <span aria-live="polite">{added ? "Agregado" : "Comprar"}</span>
        </button>
      </div>
    </article>
  );
}
