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
import { useInfinitePointerMarquee } from "@/hooks/use-infinite-pointer-marquee";
import type { Product } from "@/lib/types";
import { useStore } from "@/store/store";

const PROMO_SLIDES = [
  {
    id: "taladro-energy-550w",
    productId: "580",
    image: "/promos/taladro-energy-550w.jpg",
    label: "Taladro Energy 550W 13 mm",
    href: "/productos/taladro-550w-13mm-energy-id13-2-220-580",
  },
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
  {
    id: "motosierra-knock-out",
    productId: "3506",
    image: "/promos/motosierra-knock-out.jpg",
    label: "Motosierra Knock Out 460 mm",
    href: "/productos/motosierra-460-mm-45-cc-knock-out-kom345-3506",
  },
  {
    id: "minimotosierra-garden",
    productId: "3246",
    image: "/promos/minimotosierra-garden.jpg",
    label: "Minimotosierra inalámbrica Garden",
    href: "/productos/mini-motosierra-electrosierra-inalambrica-garden-3246",
  },
] as const;

const STAR_PRODUCTS = [
  { productId: "3604", image: "/products/catalog/3604-aa10115-220p.webp" },
  { productId: "3381", image: "/products/catalog/3381-aa518-220plus.webp" },
  { productId: "3881", image: "/products/catalog/3881-aa11115-20c1.webp" },
  { productId: "3658", image: "/products/catalog/3658-aa623-220.webp" },
] as const;

const HERO_AUTO_SPEED = 0.18;
const HERO_MOUSE_MAX_SPEED = 0.82;
const HERO_TOUCH_MAX_SPEED = 2.8;

type PromoSlide = (typeof PROMO_SLIDES)[number];

function wrapCarouselDelta(value: number, length: number) {
  let wrapped = value;
  if (wrapped > length / 2) wrapped -= length;
  if (wrapped < -length / 2) wrapped += length;
  return wrapped;
}

function HeroPromoCarousel({ slides }: { slides: readonly PromoSlide[] }) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const positionRef = useRef(0);
  const velocityRef = useRef(HERO_AUTO_SPEED);
  const mouseVelocityRef = useRef(HERO_AUTO_SPEED);
  const mouseInsideRef = useRef(false);
  const touchingRef = useRef(false);
  const draggedRef = useRef(false);
  const touchRef = useRef({ pointerId: -1, x: 0, lastX: 0, lastTime: 0, position: 0 });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let renderedActive = 0;

    function render(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!touchingRef.current) {
        const target = mouseInsideRef.current ? mouseVelocityRef.current : HERO_AUTO_SPEED;
        const response = mouseInsideRef.current ? 5.5 : 1.8;
        velocityRef.current += (target - velocityRef.current) * Math.min(1, dt * response);
        positionRef.current = (positionRef.current + velocityRef.current * dt + slides.length) % slides.length;
      }

      const position = positionRef.current;
      const nearest = Math.round(position) % slides.length;
      if (nearest !== renderedActive) {
        renderedActive = nearest;
        setActiveIndex(nearest);
      }

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const delta = wrapCarouselDelta(index - position, slides.length);
        const distance = Math.abs(delta);
        const scale = Math.max(0.76, 1 - Math.min(distance, 2.3) * 0.095);
        const opacity = Math.max(0, 1 - Math.max(0, distance - 1.1) * 0.72);
        const x = delta * 78;
        card.style.transform = `translate3d(calc(-50% + ${x}%), -50%, 0) scale(${scale}) rotate(${delta * 1.65}deg)`;
        card.style.opacity = `${opacity}`;
        card.style.zIndex = `${Math.max(1, 20 - Math.round(distance * 6))}`;
        card.style.pointerEvents = distance < 1.55 ? "auto" : "none";
      });

      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [slides.length]);

  function updateMouseDirection(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || touchingRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalized = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const strength = Math.abs(normalized);
    mouseVelocityRef.current = strength < 0.08
      ? 0
      : -Math.sign(normalized) * (0.12 + strength * HERO_MOUSE_MAX_SPEED);
  }

  function startTouch(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    touchingRef.current = true;
    draggedRef.current = false;
    velocityRef.current = 0;
    touchRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
      position: positionRef.current,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // El navegador puede cancelar el puntero antes de capturarlo; el gesto
      // sigue funcionando mientras los eventos continúen sobre el carrusel.
    }
  }

  function moveTouch(event: React.PointerEvent<HTMLDivElement>) {
    if (!touchingRef.current || touchRef.current.pointerId !== event.pointerId) return;
    const width = Math.max(210, Math.min(340, event.currentTarget.clientWidth * 0.68));
    const dx = event.clientX - touchRef.current.x;
    const now = performance.now();
    const segmentDx = event.clientX - touchRef.current.lastX;
    const elapsed = Math.max(16, now - touchRef.current.lastTime);
    if (Math.abs(dx) > 6) draggedRef.current = true;
    positionRef.current = (touchRef.current.position - dx / width + slides.length) % slides.length;
    velocityRef.current = Math.max(
      -HERO_TOUCH_MAX_SPEED,
      Math.min(HERO_TOUCH_MAX_SPEED, -(segmentDx / width) / (elapsed / 1000)),
    );
    touchRef.current.lastX = event.clientX;
    touchRef.current.lastTime = now;
  }

  function endTouch(event: React.PointerEvent<HTMLDivElement>) {
    if (!touchingRef.current || touchRef.current.pointerId !== event.pointerId) return;
    touchingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (slides.length === 0) return null;

  return (
    <div
      ref={sliderRef}
      className="hero-promo-slider"
      aria-label="Promociones destacadas"
      aria-roledescription="carrusel"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        mouseInsideRef.current = true;
        updateMouseDirection(event);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") mouseInsideRef.current = false;
      }}
      onPointerMove={(event) => {
        updateMouseDirection(event);
        moveTouch(event);
      }}
      onPointerDown={startTouch}
      onPointerUp={endTouch}
      onPointerCancel={endTouch}
      onClickCapture={(event) => {
        if (!draggedRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        draggedRef.current = false;
      }}
    >
      <span className="sr-only" aria-live="polite">
        {activeIndex + 1} de {slides.length}: {slides[activeIndex]?.label}
      </span>
      {slides.map((slide, index) => (
        <Link
          ref={(node) => { cardRefs.current[index] = node; }}
          href={slide.href}
          className="hero-promo-card"
          aria-label={`Ver ${slide.label}`}
          aria-current={activeIndex === index ? "true" : undefined}
          tabIndex={activeIndex === index ? 0 : -1}
          key={slide.id}
        >
          <Image
            src={slide.image}
            alt={slide.label}
            fill
            sizes="(max-width: 560px) 76vw, (max-width: 820px) 360px, 340px"
            loading={index <= 1 || index === slides.length - 1 ? "eager" : "lazy"}
            priority={index === 0}
            draggable={false}
          />
        </Link>
      ))}
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
const CATEGORY_MOUSE_MAX_SPEED = 260;
const CATEGORY_TOUCH_MAX_SPEED = 1500;

type CategoryCardData = ReturnType<typeof getLaunchFamilyCards>[number];

function CategoryMarquee({ categories }: { categories: CategoryCardData[] }) {
  const trackItems = [...categories, ...categories];
  const { railRef, dragging, handlers } = useInfinitePointerMarquee({
    itemCount: categories.length,
    autoSpeed: CATEGORY_AUTO_SCROLL_SPEED,
    mouseMaxSpeed: CATEGORY_MOUSE_MAX_SPEED,
    touchMaxSpeed: CATEGORY_TOUCH_MAX_SPEED,
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

export default function Home() {
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
