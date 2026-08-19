"use client";

import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { HOME_WINNER_LIMIT } from "@/lib/winning-products";
import {
  getLaunchBestSellers,
  getLaunchFamilyCards,
  getLaunchProducts,
} from "@/lib/launch-catalog";
import { useStore } from "@/store/store";

export default function Home() {
  const { products } = useStore();
  const launchProducts = getLaunchProducts(products);
  const winners = getLaunchBestSellers(products);
  const homeWinners = winners.slice(0, HOME_WINNER_LIMIT);
  const heroProducts = homeWinners.slice(0, 3);
  const categories = getLaunchFamilyCards(launchProducts).filter((category) => category.showOnHome);

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
            <a href="#categorias" className="button primary large">Ver los más elegidos</a>
            <Link href="/productos" className="button ghost large">Explorar catálogo</Link>
          </div>
          <div className="commerce-metrics">
            <span><strong>{launchProducts.length}</strong> productos</span>
            <span><strong>{categories.length}</strong> categorías</span>
            <span><strong>10</strong> seleccionados</span>
          </div>
        </div>
        <div className="commerce-hero-showcase" aria-label="Productos destacados">
          <div className="showcase-copy">
            <span>PRODUCTO PRINCIPAL</span>
            <strong>Taladro Energy</strong>
            <small>El caballito de batalla</small>
          </div>
          {heroProducts.map((product, index) => (
            <Link
              href={`/producto?slug=${encodeURIComponent(product.slug)}`}
              className={`showcase-product showcase-product-${index + 1}`}
              key={product.id}
              aria-label={`Ver ${product.name}`}
            >
              {product.image ? <Image src={product.image} alt="" fill sizes="28vw" priority={index === 0} /> : null}
            </Link>
          ))}
          <span className="showcase-price">Desde {formatCurrency(heroProducts[0]?.price ?? null)}</span>
        </div>
      </section>

      <section className="trust-strip commerce-trust">
        <div><span>🚚</span><strong>Envíos nacionales</strong><small>A todo el país</small></div>
        <div><span>💳</span><strong>Mercado Pago</strong><small>Próximamente</small></div>
        <div><span>✓</span><strong>Precios reales</strong><small>Actualizados desde el Sheet</small></div>
        <div><span>☎</span><strong>Asesoramiento</strong><small>Compra con confianza</small></div>
      </section>

      <section className="section" id="categorias">
        <div className="section-heading">
          <div>
            <span className="eyebrow orange">ENCONTRÁ LO QUE NECESITÁS</span>
            <h2>Comprá por categoría</h2>
          </div>
          <Link href="/productos" className="text-link">Ver catálogo completo →</Link>
        </div>
        <div className="category-grid">
          {categories.map(({ slug, label, description, icon, priceFrom }) => (
            <Link
              href={`/productos?familia=${encodeURIComponent(slug)}`}
              className="category-card"
              key={slug}
            >
              <span>{icon}</span><strong>{label}</strong><small>{description}</small>
              <b>{priceFrom === null ? "Explorar" : `Desde ${formatCurrency(priceFrom)}`} →</b>
            </Link>
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
