"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Testimonial = {
  id: string;
  type: "image" | "video";
  src: string | null;
  name: string;
};

// ponytail: placeholders hasta que lleguen las fotos/videos reales de clientes (1080x1920).
// Reemplazar src: null por la ruta del archivo en public/testimonios cuando esten disponibles.
const TESTIMONIALS: Testimonial[] = Array.from({ length: 15 }, (_, i) => ({
  id: `t${i + 1}`,
  type: i % 2 === 0 ? "video" : "image" as const,
  src: null,
  name: "Cliente Litoral Maq",
}));

function TestimonialMedia({ item, active }: { item: Testimonial; active?: boolean }) {
  if (!item.src) {
    return (
      <div className="testimonial-placeholder">
        <span aria-hidden>{item.type === "video" ? "▶" : "🖼"}</span>
        <small>{item.type === "video" ? "Video pendiente" : "Foto pendiente"}</small>
      </div>
    );
  }
  if (item.type === "video") {
    return (
      <video
        src={item.src}
        className="testimonial-media"
        muted
        loop
        playsInline
        autoPlay={active}
      />
    );
  }
  return <Image src={item.src} alt={item.name} fill sizes="(max-width: 560px) 78vw, 320px" className="testimonial-media" />;
}

export function TestimonialsSection() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = TESTIMONIALS[active];
  const previous = TESTIMONIALS[(active - 1 + TESTIMONIALS.length) % TESTIMONIALS.length];
  const next = TESTIMONIALS[(active + 1) % TESTIMONIALS.length];

  useEffect(() => {
    if (paused) return;
    if (current.type === "video" && current.src) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActive((i) => (i + 1) % TESTIMONIALS.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [active, paused, current.type, current.src]);

  function go(direction: -1 | 1) {
    setActive((i) => (i + direction + TESTIMONIALS.length) % TESTIMONIALS.length);
  }

  return (
    <section className="section testimonials-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow orange">CLIENTES</span>
          <h2>Lo que dicen nuestros clientes</h2>
          <p>Fotos y videos reales de clientes que ya equiparon su taller.</p>
        </div>
      </div>

      <div
        className="testimonial-slider"
        aria-label="Testimonios de clientes"
        aria-roledescription="carrusel"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <button
          type="button"
          className="carousel-arrow testimonial-arrow previous"
          aria-label="Testimonio anterior"
          onClick={() => go(-1)}
        >
          ‹
        </button>

        <div className="testimonial-stack" key={current.id}>
          <div className="testimonial-preview previous" aria-hidden="true">
            <TestimonialMedia item={previous} />
          </div>

          <article
            className="testimonial-slide"
            aria-label={`${active + 1} de ${TESTIMONIALS.length}: ${current.name}`}
          >
            <TestimonialMedia item={current} active />
            <span className="testimonial-name">{current.name}</span>
          </article>

          <div className="testimonial-preview next" aria-hidden="true">
            <TestimonialMedia item={next} />
          </div>
        </div>

        <button
          type="button"
          className="carousel-arrow testimonial-arrow next"
          aria-label="Siguiente testimonio"
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>

      <div className="testimonial-dots">
        {TESTIMONIALS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === active ? "active" : ""}
            aria-label={`Ir al testimonio ${index + 1}`}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
    </section>
  );
}
