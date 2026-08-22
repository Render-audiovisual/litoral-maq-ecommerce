"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { getLaunchFamilyCards, getLaunchProducts } from "@/lib/launch-catalog";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";

const SHOWCASE_IMAGES = [
  { src: "/showcase/taladro-energy-550w.png", alt: "Taladro Energy 550W 13mm, $35.000" },
  { src: "/showcase/cortadora-cesped-bat-20v.png", alt: "Cortadora de cesped Forest y Garden a bateria 20V, $420.000" },
];

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
  const categories = getLaunchFamilyCards(launchProducts);

  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (SHOWCASE_IMAGES.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSlide((current) => (current + 1) % SHOWCASE_IMAGES.length), 3000);
    return () => clearInterval(timer);
  }, []);

  const showcaseImage = SHOWCASE_IMAGES[slide];

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
          <Image
            key={showcaseImage.src}
            src={showcaseImage.src}
            alt={showcaseImage.alt}
            fill
            sizes="(max-width: 900px) 90vw, 42vw"
            className="showcase-image"
            priority
          />
        </div>
      </section>

      <section className="pickup-banner">
        <p>Comprá y retirá <span>gratis en Sáenz 1587</span></p>
        <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" aria-label="Consultar por WhatsApp" className="pickup-banner-whatsapp">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.7.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.2 1.6 2.5 3.9 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3Z"/></svg>
        </a>
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
