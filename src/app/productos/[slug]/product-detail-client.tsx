"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ImageLightbox } from "@/components/image-lightbox";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { getPurchaseLimit } from "@/lib/purchase-limits";
import { parseProductDescription } from "@/lib/product-description";
import {
  canAddProductToCart,
  getProductAvailability,
} from "@/lib/product-availability";

const icon = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const TRUST = [
  {
    title: "Envíos a todo el país",
    text: "Por Vía Cargo, OCA o Andreani",
    icon: (
      <svg {...icon}>
        <path d="M2.5 6.5h11v9.5h-11z" />
        <path d="M13.5 9.5h4l3.5 3.5v3h-7.5" />
        <circle cx="6.5" cy="17.5" r="1.75" />
        <circle cx="17" cy="17.5" r="1.75" />
      </svg>
    ),
  },
  {
    title: "Retiro gratis",
    text: "Sáenz 1587, Corrientes",
    icon: (
      <svg {...icon}>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
        <circle cx="12" cy="10" r="2.25" />
      </svg>
    ),
  },
  {
    title: "Pago seguro",
    text: "Mercado Pago: cuotas o débito",
    icon: (
      <svg {...icon}>
        <path d="M12 3 19 6v5.5c0 4.3-2.9 7.7-7 9.5-4.1-1.8-7-5.2-7-9.5V6z" />
        <path d="m9 12 2.2 2.2L15.5 10" />
      </svg>
    ),
  },
];

export function ProductDetailClient({ slug }: { slug: string }) {
  const { products, addToCart } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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
  const shownImage = Math.min(activeImage, Math.max(0, gallery.length - 1));
  const availability = getProductAvailability(product);
  const purchaseLimit = getPurchaseLimit(product);
  const inStock = availability === "available" || availability === "sheet-managed";
  const availabilityText =
    availability === "unknown"
      ? "Consultar disponibilidad"
      : inStock
        ? "Disponible"
        : "Agotado";
  const details = parseProductDescription(product.description);
  const description = details.intro || product.description?.trim() || "";
  // "1 Amoladora. 1 Mango lateral." se lee mejor como lista; una sola frase queda en párrafo.
  const contentItems = details.contents
    .split(/\.\s+(?=\d)/)
    .map((item) => item.trim().replace(/\.$/, ""))
    .filter(Boolean);
  const specRows = [
    { label: "Marca", value: product.brand },
    { label: "Categoría", value: product.category },
    { label: "Código", value: product.code },
  ]
    .filter((row) => row.value?.trim())
    .concat(details.specs);
  return (
    <main className="product-detail-page">
      <nav className="breadcrumbs" aria-label="Ruta de navegación">
        <Link href="/">Inicio</Link> / <Link href="/productos">Productos</Link>{" "}
        / <span>{product.name}</span>
      </nav>
      <section className="pdp">
        <div className="pdp-gallery">
          {gallery.length ? (
            <button
              type="button"
              className="pdp-image"
              aria-label="Ampliar imagen"
              onClick={() => setLightboxOpen(true)}
            >
              <Image
                src={gallery[shownImage]}
                alt={product.name}
                fill
                sizes="(max-width: 900px) 100vw, 50vw"
                priority
              />
              <span className="pdp-zoom-hint" aria-hidden="true">
                <svg {...icon}>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m20 20-4.4-4.4" />
                  <path d="M8.5 11h5M11 8.5v5" />
                </svg>
              </span>
            </button>
          ) : (
            <div className="pdp-image">
              <div className="product-placeholder large">
                <span>LM</span>
                <small>Imagen pendiente de carga</small>
              </div>
            </div>
          )}
          {gallery.length > 1 && (
            <div className="pdp-thumbs">
              {gallery.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  className={index === activeImage ? "active" : undefined}
                  aria-label={`Ver imagen ${index + 1} de ${product.name}`}
                  aria-pressed={index === activeImage}
                  onClick={() => setActiveImage(index)}
                >
                  <Image src={src} alt="" fill sizes="72px" />
                </button>
              ))}
            </div>
          )}
          {gallery.length > 0 && (
            <ImageLightbox
              images={gallery.map((src, index) => ({
                src,
                alt: `${product.name} — imagen ${index + 1}`,
              }))}
              index={shownImage}
              open={lightboxOpen}
              onIndexChange={setActiveImage}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </div>
        <div className="pdp-info">
          {product.brand && <p className="pdp-brand">{product.brand}</p>}
          <h1>{product.name}</h1>
          <p className="pdp-meta">
            <span>
              Código <strong>{product.code}</strong>
            </span>
            <span className="pdp-stock">
              <span
                className={`dot ${inStock ? "green" : availability === "unknown" ? "orange" : "red"}`}
              />
              <span>{availabilityText}</span>
            </span>
            <span>
              {availability === "unknown"
                ? "Confirmamos las unidades antes de cerrar la compra"
                : availability === "sheet-managed"
                  ? "Stock gestionado por Litoral"
                  : `${product.stock} unidades confirmadas`}
            </span>
          </p>
          <strong className="pdp-price">{formatCurrency(product.price)}</strong>
          <div className="pdp-buy">
            <div className="pdp-qty" role="group" aria-label="Cantidad">
              <button
                type="button"
                aria-label="Restar una unidad"
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                type="button"
                aria-label="Sumar una unidad"
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
              className="button primary"
              disabled={!canAddProductToCart(product)}
              onClick={() => {
                addToCart(product.id, quantity);
                setAdded(true);
              }}
            >
              {added ? "Agregado al carrito" : "Agregar al carrito"}
            </button>
          </div>
          <p className="pdp-note">
            Máximo {purchaseLimit} unidades por producto en cada compra.
            {added && (
              <>
                {" "}
                <Link href="/carrito">Ir al carrito →</Link>
              </>
            )}
          </p>
          <ul className="pdp-trust">
            {TRUST.map((item) => (
              <li key={item.title}>
                {item.icon}
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="pdp-details">
        <section aria-labelledby="pdp-specs-title">
          <h2 id="pdp-specs-title">Ficha técnica</h2>
          <table className="pdp-specs">
            <tbody>
              {specRows.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {(description || details.extras.length > 0) && (
          <section aria-labelledby="pdp-description-title">
            <h2 id="pdp-description-title">Descripción</h2>
            {description && <p>{description}</p>}
            {details.intro && details.extras.length > 0 && (
              <ul>
                {details.extras.map((extra, index) => (
                  <li key={`${extra}-${index}`}>{extra}</li>
                ))}
              </ul>
            )}
          </section>
        )}
        {details.contents && (
          <section aria-labelledby="pdp-contents-title">
            <h2 id="pdp-contents-title">Qué incluye</h2>
            {contentItems.length > 1 ? (
              <ul>
                {contentItems.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>{details.contents}</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
