import Link from "next/link";
import productsSeed from "@/data/products.json";
import type { Product } from "@/lib/types";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { ProductCard } from "@/components/product-card";

export default function Home() {
  const products = productsSeed as Product[];
  const featured = products.filter((product) => product.featured).slice(0, 8);
  const categories = [
    ["Amoladoras", "Potencia para corte y desbaste", "⚙"],
    ["Soldadura", "Equipos e insumos", "✦"],
    ["Taladros y atornilladores", "Para obra y taller", "⌁"],
    ["Jardín", "Máquinas para exterior", "♧"],
  ];

  return (
    <main>
      <section className="hero">
        <div className="hero-content">
          <span className="hero-pill">PRECIOS REALES DEL CATÁLOGO</span>
          <h1>Equipá tu taller.<br /><em>Hacelo vos mismo.</em></h1>
          <p>
            Máquinas y herramientas seleccionadas para trabajar mejor, con
            asesoramiento y envío a todo el país.
          </p>
          <div className="hero-actions">
            <Link href="/productos" className="button primary large">Ver productos</Link>
            <Link href="/productos?categoria=Amoladoras" className="button ghost large">
              Explorar categorías
            </Link>
          </div>
          <div className="hero-metrics">
            <span><strong>460</strong> productos reales</span>
            <span><strong>11</strong> categorías iniciales</span>
            <span><strong>100%</strong> precios del Sheet</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-tool">⚙</div>
          <span className="hero-price">Desde $39.980</span>
          <span className="hero-note">ENERGY · NEO · GLADIATOR</span>
        </div>
      </section>

      <section className="trust-strip">
        <div><span>🚚</span><strong>Envíos nacionales</strong><small>A todo el país</small></div>
        <div><span>💳</span><strong>Mercado Pago</strong><small>Preparado para conectar</small></div>
        <div><span>✓</span><strong>Stock visible</strong><small>Control desde el panel</small></div>
        <div><span>☎</span><strong>Asesoramiento</strong><small>Compra con confianza</small></div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow orange">ENCONTRÁ LO QUE NECESITÁS</span>
            <h2>Comprá por categoría</h2>
          </div>
          <Link href="/productos" className="text-link">Ver catálogo completo →</Link>
        </div>
        <div className="category-grid">
          {categories.map(([name, description, icon]) => (
            <Link
              href={`/productos?categoria=${encodeURIComponent(name)}`}
              className="category-card"
              key={name}
            >
              <span>{icon}</span><strong>{name}</strong><small>{description}</small><b>Explorar →</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="section soft">
        <div className="section-heading">
          <div>
            <span className="eyebrow orange">SELECCIÓN LITORAL MAQ</span>
            <h2>Productos destacados</h2>
          </div>
          <Link href="/productos" className="text-link">Ver todos →</Link>
        </div>
        <div className="product-grid">
          {featured.map((product) => <ProductCard product={product} key={product.id} />)}
        </div>
      </section>

      <section className="cta-banner">
        <div>
          <span className="eyebrow">¿TENÉS DUDAS?</span>
          <h2>Te ayudamos a elegir la herramienta correcta.</h2>
          <p>Contanos qué trabajo necesitás hacer y te orientamos.</p>
        </div>
        <a
          className="cta-whatsapp"
          href={getWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
        >
          Consultar por WhatsApp →
        </a>
      </section>
    </main>
  );
}
