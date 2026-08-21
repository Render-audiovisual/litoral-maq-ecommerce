"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import {
  getLaunchBestSellers,
  getLaunchFamilyCards,
  getLaunchProducts,
} from "@/lib/launch-catalog";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";

const SHOWCASE_SLOTS = 3;

function CategoryWinnerCard({
  slug,
  label,
  description,
  priceFrom,
  productCount,
  representativeProduct,
  rank,
}: {
  slug: string;
  label: string;
  description: string;
  priceFrom: number | null;
  productCount: number;
  representativeProduct: Product | null;
  rank: number;
}) {
  const href = `/productos?familia=${encodeURIComponent(slug)}`;
  return (
    <Link href={href} className={`winner-card winner-card-${(rank - 1) % 3}`}>
      <div className="winner-card-media">
        {representativeProduct?.image ? (
          <Image
            src={representativeProduct.image}
            alt={`Ver productos de ${label}`}
            fill
            sizes="(max-width: 560px) 50vw, (max-width: 900px) 33vw, 28vw"
            priority={rank <= 2}
          />
        ) : (
          <div className="winner-placeholder">LM</div>
        )}
      </div>
      <div className="winner-card-copy">
        <span>{productCount} {productCount === 1 ? "producto" : "productos"}</span>
        <h3>{label}</h3>
        <small>{description}</small>
        <strong>{priceFrom === null ? "Consultar" : `Desde ${formatCurrency(priceFrom)}`}</strong>
        <b>Ver {label.toLowerCase()} <span aria-hidden>→</span></b>
      </div>
    </Link>
  );
}

export default function Home() {
  const { products } = useStore();
  const launchProducts = getLaunchProducts(products);
  const winners = getLaunchBestSellers(products);
  const categories = getLaunchFamilyCards(launchProducts);

  // Una foto por archivo: varios productos comparten imagen y rotarian repetido.
  const showcase = Array.from(
    new Map(winners.filter((product) => product.image).map((product) => [product.image, product])).values(),
  );
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (showcase.length <= SHOWCASE_SLOTS) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSlide((current) => current + 1), 3000);
    return () => clearInterval(timer);
  }, [showcase.length]);

  const slots = showcase.length
    ? Array.from({ length: SHOWCASE_SLOTS }, (_, i) => showcase[(slide + i) % showcase.length])
    : [];
  const lead = slots[0] ?? null;

  return (
    <main>
      <section className="commerce-hero">
        <div className="commerce-hero-copy">
          <span className="hero-pill">LOS MÁS ELEGIDOS DE LITORAL MAQ</span>
          <h1>Precios para <em>equipar tu taller.</em></h1>
          <p>
            Productos seleccionados, precios reales del catálogo y atención
            personalizada para elegir mejor.
          </p>
          <div className="hero-actions">
            <a href="#categorias-mas-vendidas" className="button primary large">Ver categorías</a>
            <Link href="/productos" className="button ghost large">Ver productos</Link>
          </div>
        </div>
        <div className="commerce-hero-showcase" aria-label="Productos destacados">
          {lead ? (
            <div className="showcase-copy" key={lead.id}>
              <span>PRODUCTO DESTACADO</span>
              <strong>{lead.name}</strong>
              <small>{lead.brand}</small>
            </div>
          ) : null}
          {slots.map((product, index) => (
            <Link
              href={`/producto?slug=${encodeURIComponent(product.slug)}`}
              className={`showcase-product showcase-product-${index + 1}`}
              key={`${index}-${product.id}`}
              aria-label={`Ver ${product.name}`}
            >
              <Image src={product.image!} alt="" fill sizes="28vw" priority={index === 0} />
            </Link>
          ))}
          {lead ? (
            <span className="showcase-price" key={`price-${lead.id}`}>{formatCurrency(lead.price)}</span>
          ) : null}
        </div>
      </section>

      <section className="winner-section" id="categorias-mas-vendidas">
        <div className="section-heading winner-heading">
          <div>
            <span className="eyebrow orange">CATEGORÍAS MÁS VENDIDAS</span>
            <h2>Los que más salen</h2>
            <p>Entrá a una categoría y encontrá sus productos por marca y precio.</p>
          </div>
          <Link href="/productos" className="text-link">Ver todos los productos →</Link>
        </div>
        <div className="winner-grid">
          {categories.map((category, index) => (
            <CategoryWinnerCard {...category} rank={index + 1} key={category.slug} />
          ))}
        </div>
      </section>

      <section className="cta-banner">
        <div>
          <span className="eyebrow">¿TENÉS DUDAS?</span>
          <h2>Te ayudamos a elegir la herramienta correcta.</h2>
          <p>Contanos qué trabajo necesitás hacer y te orientamos.</p>
        </div>
        <a className="cta-whatsapp" href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
          Consultar por WhatsApp →
        </a>
      </section>
    </main>
  );
}
