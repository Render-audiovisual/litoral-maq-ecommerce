"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { TestimonialsSection } from "@/components/testimonials";
import { formatCurrency } from "@/lib/utils";
import {
  getLaunchFamilyCards,
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
    href: "/productos/cort-cesped-1600w-gladiator-cp536-220-3348",
  },
  {
    id: "hormigonera-obra-140l",
    image: "/promos/hormigonera-obra-140l.jpg",
    label: "Hormigonera Obra 140 litros",
    href: "/productos/hormigonera-140-lts-obra-mh8140-25-3353",
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
    label: "Maletín de tubos y criquet 32 piezas",
    href: "/productos/juego-de-tubos-1-2-x-32-jt10321-2-3650",
  },
  {
    id: "llave-impacto-neo-next",
    image: "/promos/llave-impacto-neo-next.jpg",
    label: "Llave de impacto Neo Next 20V",
    href: "/productos/llave-de-impacto-20v-650-n-m-neo-li1065-20c1-3732",
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

const STAR_PRODUCTS = [
  { model: "ID13/2/220", image: "/promos/taladro-energy-550w.jpg" },
  { model: "HL7000/220M", image: "/products/hidrolavadora-gladiator-hl7000.jpg" },
  { model: "CS58", image: "/products/MOTOSIERRA_.png" },
  { model: "IMET140/2/220", image: "/products/SOLDADORA 3 en 1.png" },
] as const;

function CategoryWinnerCard({
  slug,
  label,
  description,
  priceFrom,
  productCount,
  representativeProduct,
  image,
  rank,
  duplicate = false,
}: {
  slug: string;
  label: string;
  description: string;
  priceFrom: number | null;
  productCount: number;
  representativeProduct: Product | null;
  image: string;
  rank: number;
  duplicate?: boolean;
}) {
  const href = `/productos?familia=${encodeURIComponent(slug)}`;
  return (
    <Link
      href={href}
      className={`winner-card winner-card-${(rank - 1) % 3}`}
      aria-hidden={duplicate}
      tabIndex={duplicate ? -1 : undefined}
    >
      <div className="winner-card-media">
        {image || representativeProduct?.image ? (
          <Image
            src={image || representativeProduct?.image || ""}
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

const CATEGORY_AUTO_SCROLL_SPEED = 38;
const CATEGORY_TOUCH_RESUME_DELAY = 2200;

type CategoryCardData = ReturnType<typeof getLaunchFamilyCards>[number];

function CategoryMarquee({ categories }: { categories: CategoryCardData[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimer = useRef<number | undefined>(undefined);
  const trackItems = [...categories, ...categories];

  useEffect(() => {
    if (categories.length < 2) return;
    let raf: number;
    let last = performance.now();

    function step(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      const rail = railRef.current;
      if (rail && !pausedRef.current) {
        rail.scrollLeft += CATEGORY_AUTO_SCROLL_SPEED * dt;
        const half = rail.scrollWidth / 2;
        if (rail.scrollLeft >= half) rail.scrollLeft -= half;
      }
      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [categories.length]);

  useEffect(() => {
    return () => {
      window.clearTimeout(resumeTimer.current);
    };
  }, []);

  return (
    <div
      ref={railRef}
      className="category-marquee"
      aria-label="Categorías de productos, se puede deslizar"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onTouchStart={() => {
        pausedRef.current = true;
        window.clearTimeout(resumeTimer.current);
      }}
      onTouchEnd={() => {
        resumeTimer.current = window.setTimeout(() => {
          pausedRef.current = false;
        }, CATEGORY_TOUCH_RESUME_DELAY);
      }}
    >
      <div className="winner-grid category-track">
        {trackItems.map((category, index) => (
          <CategoryWinnerCard
            {...category}
            rank={(index % categories.length) + 1}
            duplicate={index >= categories.length}
            key={`${category.slug}-${index}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { products } = useStore();
  const [activePromo, setActivePromo] = useState(0);
  const activeProducts = products.filter((product) => product.active);
  const categories = getLaunchFamilyCards(activeProducts);
  const starProducts = STAR_PRODUCTS.flatMap((item) => {
    const product = activeProducts.find((candidate) => candidate.name.includes(item.model));
    return product ? [{ product, image: item.image }] : [];
  });
  const promo = PROMO_SLIDES[activePromo];
  const previousPromo = PROMO_SLIDES[(activePromo - 1 + PROMO_SLIDES.length) % PROMO_SLIDES.length];
  const nextPromo = PROMO_SLIDES[(activePromo + 1) % PROMO_SLIDES.length];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePromo((current) => (current + 1) % PROMO_SLIDES.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, []);

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
            <Link
              href={previousPromo.href}
              className="hero-promo-preview previous"
              aria-label={`Ver ${previousPromo.label}`}
            >
              <Image
                src={previousPromo.image}
                alt={previousPromo.label}
                fill
                sizes="(max-width: 560px) 68vw, 300px"
                loading="lazy"
              />
            </Link>

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

            <Link
              href={nextPromo.href}
              className="hero-promo-preview next"
              aria-label={`Ver ${nextPromo.label}`}
            >
              <Image
                src={nextPromo.image}
                alt={nextPromo.label}
                fill
                sizes="(max-width: 560px) 68vw, 300px"
                loading="lazy"
              />
            </Link>
          </div>
        </div>

        <div className="hero-actions commerce-hero-actions">
          <div className="hero-buttons">
            <Link href="/productos" className="button primary large">Explorar catálogo</Link>
            <Link href="/productos?categoria=Ofertas" className="button ghost large hero-offers-link">
              <span className="hero-offers-desktop">Ver ofertas</span>
              <span className="hero-offers-mobile">Ver ofertas destacadas →</span>
            </Link>
          </div>
          <div className="pickup-banner">
            <span>RETIRO GRATIS</span>
            <strong><i aria-hidden="true">📍</i> Comprá y retirá gratis en Sáenz 1587</strong>
            <b aria-hidden="true">→</b>
          </div>
        </div>
      </section>

      <section className="winner-section" id="categorias-mas-vendidas">
        <div className="section-heading winner-heading">
          <div>
            <span className="eyebrow orange">COMPRÁ POR CATEGORÍA</span>
            <h2>Encontrá la máquina que necesitás</h2>
            <p>Ocho accesos directos con stock real y precios para comparar.</p>
          </div>
          <Link href="/productos" className="text-link">Ver todos los productos →</Link>
        </div>
        <CategoryMarquee categories={categories} />
      </section>

      <section className="section soft home-products-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow orange">PRODUCTOS ESTRELLA</span>
            <h2>Los elegidos de Litoral Maq</h2>
            <p>Cuatro productos con buen precio, stock y salida.</p>
          </div>
          <Link href="/productos" className="text-link">Ver catálogo completo →</Link>
        </div>
        <div className="star-products-grid" aria-label="Cuatro productos estrella">
          {starProducts.map(({ product, image }) => (
            <ProductCard
              product={product}
              imageOverride={image}
              badge="Producto estrella"
              key={product.id}
            />
          ))}
        </div>
      </section>

      <TestimonialsSection />
    </main>
  );
}
