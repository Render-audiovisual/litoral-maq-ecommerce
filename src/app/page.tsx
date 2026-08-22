"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { formatCurrency } from "@/lib/utils";
import {
  getLaunchFamilyCards,
  getLaunchProducts,
} from "@/lib/launch-catalog";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";

const PROMO_SLIDES = [
  {
    id: "taladro-energy-550w",
    image: "/promos/taladro-energy-550w.jpg",
    label: "Taladro Energy 550W 13 mm",
    href: "/productos/taladro-550w-13mm-energy-id13-2-220-580",
  },
  {
    id: "electrosierra-forest-20v",
    image: "/promos/electrosierra-forest-20v.jpg",
    label: "Electrosierra Forest & Garden 20V",
    href: "/productos/electrosierra-20v-forest-12-espada-e912-20c1-3757",
  },
  {
    id: "cortacesped-gladiator-1600w",
    image: "/promos/cortacesped-gladiator-1600w.jpg",
    label: "Cortacésped Gladiator 1600W",
    href: "/productos?q=cortacesped%201600w",
  },
  {
    id: "hormigonera-obra-140l",
    image: "/promos/hormigonera-obra-140l.jpg",
    label: "Hormigonera Obra 140 litros",
    href: "/productos?q=hormigonera%20140",
  },
  {
    id: "kit-taladro-amoladora-energy",
    image: "/promos/kit-taladro-amoladora-energy.jpg",
    label: "Kit taladro y amoladora Energy 20V",
    href: "/productos/kit-taladro-y-amoladora-energy-20v-pa20c1-3378",
  },
  {
    id: "escalera-obra-multifuncion",
    image: "/promos/escalera-obra-multifuncion.jpg",
    label: "Escalera Obra multifunción 4x4",
    href: "/productos/escalera-multifuncion-4-x-4-obra-ema804-3687",
  },
  {
    id: "maletin-tubos-criquet",
    image: "/promos/maletin-tubos-criquet.jpg",
    label: "Maletín de tubos y criquet",
    href: "/productos?q=juego%20de%20tubos",
  },
  {
    id: "llave-impacto-neo-next",
    image: "/promos/llave-impacto-neo-next.jpg",
    label: "Llave de impacto Neo Next 20V",
    href: "/productos?q=llave%20de%20impacto%2020v",
  },
  {
    id: "motosierra-knock-out",
    image: "/promos/motosierra-knock-out.jpg",
    label: "Motosierra Knock Out 460 mm",
    href: "/productos/motosierra-460-mm-45-cc-knock-out-kom345-3506",
  },
  {
    id: "minimotosierra-garden",
    image: "/promos/minimotosierra-garden.jpg",
    label: "Minimotosierra inalámbrica Garden",
    href: "/productos/mini-motosierra-electrosierra-inalambrica-garden-3246",
  },
] as const;

function scrollRail(element: HTMLDivElement | null, direction: -1 | 1, wrap = false) {
  if (!element) return;
  const atStart = element.scrollLeft <= 8;
  const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 8;

  if (wrap && direction === 1 && atEnd) {
    element.scrollTo({ left: 0, behavior: "smooth" });
    return;
  }
  if (wrap && direction === -1 && atStart) {
    element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
    return;
  }

  element.scrollBy({ left: direction * element.clientWidth * 0.82, behavior: "smooth" });
}

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
            sizes="(max-width: 560px) 78vw, (max-width: 900px) 46vw, 30vw"
            loading={rank <= 2 ? "eager" : "lazy"}
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
  const [activePromo, setActivePromo] = useState(0);
  const categoryRailRef = useRef<HTMLDivElement>(null);
  const productRailRef = useRef<HTMLDivElement>(null);
  const launchProducts = getLaunchProducts(products);
  const categories = getLaunchFamilyCards(launchProducts);
  const carouselProducts = launchProducts.filter((product) => product.image).slice(0, 12);
  const promo = PROMO_SLIDES[activePromo];
  const previousPromo = PROMO_SLIDES[(activePromo - 1 + PROMO_SLIDES.length) % PROMO_SLIDES.length];
  const nextPromo = PROMO_SLIDES[(activePromo + 1) % PROMO_SLIDES.length];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActivePromo((current) => (current + 1) % PROMO_SLIDES.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (carouselProducts.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => scrollRail(productRailRef.current, 1, true), 4300);
    return () => window.clearInterval(timer);
  }, [carouselProducts.length]);

  return (
    <main>
      <section className="commerce-hero">
        <div className="commerce-hero-copy">
          <span className="hero-pill">PRODUCTOS Y PRECIOS REALES</span>
          <h1>Armá tu <em>taller.</em></h1>
          <p>
            Máquinas y herramientas con precios reales, envíos a todo el país
            y retiro gratis en nuestro local.
          </p>
        </div>

        <div
          className="hero-promo-slider"
          aria-label="Promociones destacadas"
          aria-roledescription="carrusel"
        >
          <div className="hero-promo-stack" key={promo.id}>
            <div className="hero-promo-preview previous" aria-hidden="true">
              <Image
                src={previousPromo.image}
                alt=""
                fill
                sizes="(max-width: 560px) 68vw, 300px"
                loading="lazy"
              />
            </div>

            <article
              className="hero-promo-slide"
              aria-label={`${activePromo + 1} de ${PROMO_SLIDES.length}: ${promo.label}`}
            >
              <Link href={promo.href} className="hero-promo-link" aria-label={`Ver ${promo.label}`}>
                <div className="hero-promo-media">
                  <Image
                    src={promo.image}
                    alt={promo.label}
                    fill
                    sizes="(max-width: 560px) 92vw, (max-width: 820px) 360px, 340px"
                    loading={activePromo === 0 ? "eager" : "lazy"}
                    priority={activePromo === 0}
                  />
                </div>
              </Link>
            </article>

            <div className="hero-promo-preview next" aria-hidden="true">
              <Image
                src={nextPromo.image}
                alt=""
                fill
                sizes="(max-width: 560px) 68vw, 300px"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <div className="hero-actions commerce-hero-actions">
          <div className="hero-buttons">
            <Link href="/productos" className="button primary large">Explorar catálogo</Link>
            <Link href="/productos?categoria=Ofertas" className="button ghost large">Ver ofertas</Link>
          </div>
          <div className="pickup-banner">
            <span>RETIRO GRATIS</span>
            <strong>Comprá y retirá gratis en Sáenz 1587</strong>
            <b aria-hidden="true">→</b>
          </div>
        </div>
      </section>

      <section className="winner-section" id="categorias-mas-vendidas">
        <div className="section-heading winner-heading">
          <div>
            <span className="eyebrow orange">CATEGORÍAS MÁS VENDIDAS</span>
            <h2>Novedades que más salen</h2>
            <p>Deslizá para recorrer las categorías y encontrá sus productos por marca y precio.</p>
          </div>
          <Link href="/productos" className="text-link">Ver todos los productos →</Link>
        </div>
        <div className="carousel-shell category-carousel">
          <button
            type="button"
            className="carousel-arrow rail-arrow previous"
            aria-label="Categorías anteriores"
            onClick={() => scrollRail(categoryRailRef.current, -1, true)}
          >
            ‹
          </button>
          <div className="winner-grid carousel-rail" ref={categoryRailRef}>
            {categories.map((category, index) => (
              <CategoryWinnerCard {...category} rank={index + 1} key={category.slug} />
            ))}
          </div>
          <button
            type="button"
            className="carousel-arrow rail-arrow next"
            aria-label="Más categorías"
            onClick={() => scrollRail(categoryRailRef.current, 1, true)}
          >
            ›
          </button>
        </div>
      </section>

      <section className="section soft home-products-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow orange">PRODUCTOS DESTACADOS</span>
            <h2>Herramientas listas para llevar</h2>
            <p>Precios del catálogo y acceso directo a cada producto.</p>
          </div>
          <Link href="/productos" className="text-link">Ver catálogo completo →</Link>
        </div>
        <div className="carousel-shell product-carousel">
          <button
            type="button"
            className="carousel-arrow rail-arrow previous"
            aria-label="Productos anteriores"
            onClick={() => scrollRail(productRailRef.current, -1, true)}
          >
            ‹
          </button>
          <div className="product-carousel-rail carousel-rail" ref={productRailRef}>
            {carouselProducts.map((product, index) => (
              <ProductCard
                product={product}
                badge={index < 3 ? "Más vendido" : undefined}
                eager={index < 4}
                key={product.id}
              />
            ))}
          </div>
          <button
            type="button"
            className="carousel-arrow rail-arrow next"
            aria-label="Más productos"
            onClick={() => scrollRail(productRailRef.current, 1, true)}
          >
            ›
          </button>
        </div>
      </section>
    </main>
  );
}
