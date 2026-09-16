"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { getPurchaseLimit } from "@/lib/purchase-limits";
import {
  canAddProductToCart,
  getProductAvailability,
} from "@/lib/product-availability";

export function ProductDetailClient({ slug }: { slug: string }) {
  const { products, addToCart } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const product = products.find((item) => item.slug === slug);
  if (!product || !product.active) {
    return (
      <main className="center-state">
        <span className="state-icon">?</span>
        <h1>Producto no encontrado</h1>
        <Link href="/productos" className="button primary">
          Volver al catálogo
        </Link>
      </main>
    );
  }
  const gallery = product.images.length
    ? product.images
    : product.image
      ? [product.image]
      : [];
  const availability = getProductAvailability(product);
  const purchaseLimit = getPurchaseLimit(product);
  const availabilityText =
    availability === "unknown"
      ? "Consultar disponibilidad"
      : availability === "available" || availability === "sheet-managed"
        ? "Disponible"
        : "Agotado";
  return (
    <main className="product-detail-page">
      <div className="breadcrumbs">
        <Link href="/">Inicio</Link> / <Link href="/productos">Productos</Link>{" "}
        / <span>{product.name}</span>
      </div>
      <section className="product-detail">
        <div className="detail-gallery">
          <div className="detail-image">
            {gallery.length ? (
              <Image
                src={gallery[Math.min(activeImage, gallery.length - 1)]}
                alt={product.name}
                fill
                sizes="50vw"
                priority
              />
            ) : (
              <div className="product-placeholder large">
                <span>LM</span>
                <small>Imagen pendiente de carga</small>
              </div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="detail-thumbs">
              {gallery.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  className={index === activeImage ? "active" : undefined}
                  aria-label={`Ver imagen ${index + 1} de ${product.name}`}
                  aria-pressed={index === activeImage}
                  onClick={() => setActiveImage(index)}
                >
                  <Image src={src} alt="" fill sizes="120px" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="detail-info">
          <span className="eyebrow orange">{product.brand}</span>
          <h1>{product.name}</h1>
          <span className="detail-code">
            Código de producto: <strong>{product.code}</strong>
          </span>
          <strong className="detail-price">
            {formatCurrency(product.price)}
          </strong>
          <div className="availability">
            <span
              className={`dot ${availability === "available" || availability === "sheet-managed" ? "green" : availability === "unknown" ? "orange" : "red"}`}
            />
            {availabilityText}
            <small>
              {availability === "unknown"
                ? "Confirmamos las unidades antes de cerrar la compra"
                : availability === "sheet-managed"
                  ? "Stock gestionado por Litoral"
                  : `${product.stock} unidades confirmadas`}
            </small>
          </div>
          <p className="detail-description">
            {product.description ||
              "Información técnica y descripción comercial pendientes de completar desde el panel."}
          </p>
          <div className="buy-row">
            <div className="quantity">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                −
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                disabled={quantity >= purchaseLimit}
                onClick={() =>
                  setQuantity((value) => Math.min(purchaseLimit, value + 1))
                }
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="button primary large"
              disabled={!canAddProductToCart(product)}
              onClick={() => {
                addToCart(product.id, quantity);
                setAdded(true);
              }}
            >
              {added ? "Agregado ✓" : "Agregar al carrito"}
            </button>
          </div>
          <small className="purchase-limit-note">
            Máximo {purchaseLimit} unidades por producto en cada compra.
          </small>
          {added && (
            <Link href="/carrito" className="text-link">
              Ir al carrito →
            </Link>
          )}
          <div className="purchase-benefits">
            <div>
              <span>🚚</span>
              <strong>Envíos</strong>
              <small>Cotización después de confirmar stock</small>
            </div>
            <div>
              <span>📍</span>
              <strong>Retiro gratis</strong>
              <small>Sáenz 1587, Corrientes</small>
            </div>
            <div>
              <span>✓</span>
              <strong>Sin cobro previo</strong>
              <small>Coordinamos el pago con vos</small>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
