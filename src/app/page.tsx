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
