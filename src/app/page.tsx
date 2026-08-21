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

const PROMO_SPECS = [
  { model: "DDI10/2/12C1", image: "/products/TALADRO ATORNILLADOR.png", label: "Taladro atornillador 12V" },
  { model: "AG115/1/220", image: "/products/AMOLADORA ANGULAR.png", label: "Amoladora 115 mm" },
  { model: "IMET140/2/220", image: "/products/SOLDADORA 3 en 1.png", label: "Soldadora 3 en 1" },
  { model: "CS58", image: "/products/MOTOSIERRA_.png", label: "Motosierra a gasolina" },
  { model: "BC524-1", image: "/products/DESMALEZADORA.png", label: "Desmalezadora 4 en 1" },
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
  const promoSlides = PROMO_SPECS.flatMap((spec) => {
    const product = products.find((item) => item.active && item.name.includes(spec.model));
    return product ? [{ ...spec, product }] : [];
  });
  const promo = promoSlides[activePromo] ?? promoSlides[0] ?? null;

  useEffect(() => {
    if (promoSlides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActivePromo((current) => (current + 1) % promoSlides.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [promoSlides.length]);

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
          <h1>Precios para <em>equipar tu taller.</em></h1>
          <p>
            Encontrá máquinas y herramientas listas para comprar, con retiro
            gratis en nuestro local.
          </p>
          <div className="hero-actions">
            <a href="#categorias-mas-vendidas" className="button primary large">Ver categorías</a>
            <Link href="/productos" className="button ghost large">Explorar catálogo</Link>
          </div>
        </div>

        <div className="hero-promo-slider" aria-label="Promociones destacadas">
          {promo ? (
            <article className="hero-promo-slide" key={promo.product.id}>
              <div className="hero-promo-media">
                <Image
                  src={promo.image}
                  alt={promo.label}
                  fill
                  sizes="(max-width: 820px) 92vw, 52vw"
                  loading="eager"
                  priority={activePromo === 0}
                />
              </div>
              <div className="hero-promo-info">
                <span>PRECIO DESTACADO</span>
                <h2>{promo.label}</h2>
                <strong>{formatCurrency(promo.product.price)}</strong>
                <small>{promo.product.brand} · Cód. {promo.product.code}</small>
                <Link href={`/producto?slug=${encodeURIComponent(promo.product.slug)}`} className="button primary">
                  Ver producto
                </Link>
              </div>
            </article>
          ) : (
            <div className="hero-promo-empty">Cargando productos destacados…</div>
          )}

          {promoSlides.length > 1 ? (
            <>
              <button
                type="button"
                className="carousel-arrow hero-arrow previous"
                aria-label="Promoción anterior"
                onClick={() => setActivePromo((activePromo - 1 + promoSlides.length) % promoSlides.length)}
              >
                ‹
              </button>
              <button
                type="button"
                className="carousel-arrow hero-arrow next"
                aria-label="Promoción siguiente"
                onClick={() => setActivePromo((activePromo + 1) % promoSlides.length)}
              >
                ›
              </button>
              <div className="hero-promo-dots" aria-label="Elegir promoción">
                {promoSlides.map((slide, index) => (
                  <button
                    type="button"
                    className={index === activePromo ? "active" : ""}
                    aria-label={`Ver ${slide.label}`}
                    aria-current={index === activePromo ? "true" : undefined}
                    onClick={() => setActivePromo(index)}
                    key={slide.model}
                  />
                ))}
              </div>
            </>
          ) : null}
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
