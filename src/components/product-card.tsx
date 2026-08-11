"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";

export function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useStore();
  const productHref = `/producto?slug=${encodeURIComponent(product.slug)}`;
  return (
    <article className="product-card">
      <Link href={productHref} className="product-image">
        {product.image ? (
          <Image
            src={product.image}
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
        {product.featured && <span className="product-badge">Destacado</span>}
      </Link>
      <div className="product-card-body">
        <span className="eyebrow">{product.brand}</span>
        <Link href={productHref} className="product-name">
          {product.name}
        </Link>
        <span className="product-code">Cód. {product.code}</span>
        <strong className="product-price">{formatCurrency(product.price)}</strong>
        <span className={product.stock > 0 ? "stock in" : "stock out"}>
          {product.stock > 0 ? "Disponible" : "Sin stock"}
        </span>
        <button
          type="button"
          className="button primary full"
          disabled={product.stock <= 0 || product.price === null}
          onClick={() => addToCart(product.id)}
        >
          Agregar al carrito
        </button>
      </div>
    </article>
  );
}
