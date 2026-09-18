"use client";

import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { TestimonialsSection } from "@/components/testimonials";
import { formatCurrency } from "@/lib/utils";
import {
  getLaunchFamilyCards,
} from "@/lib/launch-catalog";
import { useContinuousTicker } from "@/hooks/use-continuous-ticker";
import { useInfinitePointerMarquee } from "@/hooks/use-infinite-pointer-marquee";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";

const PROMO_SLIDES = [
  {
    id: "electrosierra-forest-20v",
    productId: "3757",
    image: "/promos/electrosierra-forest-20v.jpg",
    label: "Electrosierra Forest & Garden 20V",
    href: "/productos/electrosierra-20v-forest-12-espada-e912-20c1-3757",
  },
  {
    id: "cortacesped-gladiator-1600w",
    productId: "3348",
    image: "/promos/cortacesped-gladiator-1600w.jpg",
    label: "Cortacésped Gladiator 1600W",
    href: "/productos/cort-cesped-1600w-gladiator-cp536-220-3348",
  },
  {
    id: "hormigonera-obra-140l",
    productId: "3353",
    image: "/promos/hormigonera-obra-140l.jpg",
    label: "Hormigonera Obra 140 litros",
    href: "/productos/hormigonera-140-lts-obra-mh8140-25-3353",
  },
  {
    id: "kit-taladro-amoladora-energy",
    productId: "3378",
    image: "/promos/kit-taladro-amoladora-energy.jpg",
    label: "Kit taladro y amoladora Energy 20V",
    href: "/productos/kit-taladro-y-amoladora-energy-20v-pa20c1-3378",
  },
  {
    id: "escalera-obra-multifuncion",
    productId: "3687",
    image: "/promos/escalera-obra-multifuncion.jpg",
    label: "Escalera Obra multifunción 4x4",
    href: "/productos/escalera-multifuncion-4-x-4-obra-ema804-3687",
  },
  {
    id: "maletin-tubos-criquet",
    productId: "3650",
    image: "/promos/maletin-tubos-criquet.jpg",
    label: "Maletín de tubos y criquet 32 piezas",
    href: "/productos/juego-de-tubos-1-2-x-32-jt10321-2-3650",
  },
  {
    id: "llave-impacto-neo-next",
    productId: "3732",
    image: "/promos/llave-impacto-neo-next.jpg",
    label: "Llave de impacto Neo Next 20V",
    href: "/productos/llave-de-impacto-20v-650-n-m-neo-li1065-20c1-3732",
  },
] as const;

const STAR_PRODUCTS = [
  { productId: "3381", image: "/products/catalog/3381-aa518-220plus.webp" },
  { productId: "3506", image: "/products/MOTOSIERRA_.png" },
  { productId: "3499", image: "/products/catalog/3499-bwir150.webp" },
  { productId: "3542", image: "/products/catalog/3542-lo180-220.webp" },
] as const;

// Cinta continua: píxeles por segundo, no tarjetas por segundo. El ritmo es
// el de un ticker —constante y parejo— en vez de saltar de tarjeta en tarjeta.
const HERO_TICKER_SPEED = 46;
const HERO_MAX_FLING_SPEED = 900;

type PromoSlide = (typeof PROMO_SLIDES)[number];

function HeroPromoCarousel({ slides }: { slides: readonly PromoSlide[] }) {
  // El juego de tarjetas va duplicado: cuando la cinta avanzó exactamente un
  // juego vuelve a cero y el corte no se ve.
  const trackItems = [...slides, ...slides];
  const { trackRef, dragging, handlers } = useContinuousTicker({
    itemCount: slides.length,
    speed: HERO_TICKER_SPEED,
    maxFlingSpeed: HERO_MAX_FLING_SPEED,
  });

  if (slides.length === 0) return null;

  return (
    <div
      className={`hero-promo-slider${dragging ? " is-dragging" : ""}`}
      aria-label="Promociones destacadas"
      aria-roledescription="carrusel"
      {...handlers}
    >
      <div className="hero-promo-track" ref={trackRef}>
        {trackItems.map((slide, index) => {
          const duplicate = index >= slides.length;
          return (
            <Link
              href={slide.href}
              className="hero-promo-card"
              aria-label={`Ver ${slide.label}`}
              aria-hidden={duplicate}
              tabIndex={duplicate ? -1 : undefined}
              key={`${slide.id}-${index}`}
            >
              <Image
                src={slide.image}
                alt={slide.label}
                fill
                sizes="(max-width: 430px) 46vw, (max-width: 820px) 42vw, 270px"
                loading={index < slides.length ? "eager" : "lazy"}
                priority={index === 0}
                draggable={false}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

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
const CATEGORY_MAX_FLING_SPEED = 1500;

type CategoryCardData = ReturnType<typeof getLaunchFamilyCards>[number];

function CategoryMarquee({ categories }: { categories: CategoryCardData[] }) {
  const trackItems = [...categories, ...categories];
  const { railRef, dragging, handlers } = useInfinitePointerMarquee({
    itemCount: categories.length,
    autoSpeed: CATEGORY_AUTO_SCROLL_SPEED,
    maxFlingSpeed: CATEGORY_MAX_FLING_SPEED,
  });

  return (
    <div
      ref={railRef}
      className={`category-marquee${dragging ? " is-dragging" : ""}`}
      aria-label="Categorías de productos, se puede deslizar"
      {...handlers}
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

export function HomeClient() {
  const { products } = useStore();
  const activeProducts = products.filter((product) => product.active);
  const categories = getLaunchFamilyCards(activeProducts);
  const promoSlides = PROMO_SLIDES.filter((slide) =>
    activeProducts.some((product) => product.id === slide.productId),
  );
  const starProducts = STAR_PRODUCTS.flatMap((item) => {
    const product = activeProducts.find((candidate) => candidate.id === item.productId);
    return product ? [{ product, image: item.image }] : [];
  });
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

        <HeroPromoCarousel slides={promoSlides} />

        <div className="hero-actions commerce-hero-actions">
          <div className="hero-buttons">
            <Link href="/productos" className="button primary large">Explorar catálogo</Link>
            <Link href="#productos-estrella" className="button ghost large hero-offers-link">
              <span className="hero-offers-desktop">Ver ofertas</span>
              <span className="hero-offers-mobile">Ver ofertas destacadas →</span>
            </Link>
          </div>
          <div className="pickup-banner">
            <span>RETIRO GRATIS</span>
            <div className="pickup-banner-copy">
              <strong><i aria-hidden="true">📍</i> Retirá gratis en Sáenz 1587, Corrientes Capital</strong>
              <small>Abrí y probá tu producto antes de llevártelo, sin compromiso.</small>
            </div>
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

      <section className="section soft home-products-section" id="productos-estrella">
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
