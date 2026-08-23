"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Testimonial = {
  id: string;
  type: "image" | "video";
  src: string | null;
  name: string;
};

const TESTIMONIALS: Testimonial[] = [
  { id: "clientes-confianza", type: "image", src: "/testimonios/clientes-confianza.jpg", name: "Clientes que confían en Litoral Maq" },
  { id: "nestor", type: "image", src: "/testimonios/nestor-escalera.jpg", name: "Néstor eligió Litoral Maq" },
  { id: "compras-energy", type: "image", src: "/testimonios/compras-energy.jpg", name: "Clientes Litoral Maq" },
  { id: "ramon", type: "image", src: "/testimonios/ramon-escalera.jpg", name: "Ramón eligió Litoral Maq" },
  { id: "clientes-energy", type: "image", src: "/testimonios/clientes-energy.jpg", name: "Clientes Litoral Maq" },
  { id: "video-cliente", type: "video", src: "/testimonios/testimonio-cliente.mp4", name: "La experiencia de un cliente" },
  { id: "trabajadores", type: "image", src: "/testimonios/clientes-trabajadores.jpg", name: "Clientes que equiparon su trabajo" },
  { id: "itati", type: "image", src: "/testimonios/amigos-itati.jpg", name: "Clientes de Itatí" },
  { id: "corrientes", type: "image", src: "/testimonios/entrega-corrientes.jpg", name: "Entrega en Corrientes" },
  { id: "formosa", type: "image", src: "/testimonios/pedido-formosa.jpg", name: "Pedido enviado a Formosa" },
  { id: "alejandro", type: "image", src: "/testimonios/alejandro-soldadora.jpg", name: "Alejandro eligió Litoral Maq" },
  { id: "cliente-equipado", type: "image", src: "/testimonios/cliente-equipado.jpg", name: "Cliente equipado en Litoral Maq" },
];

function TestimonialMedia({
  item,
  active = false,
  paused = false,
  onEnded,
}: {
  item: Testimonial;
  active?: boolean;
  paused?: boolean;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (item.type !== "video" || !videoRef.current) return;
    if (!active || paused) {
      videoRef.current.pause();
      return;
    }
    void videoRef.current.play().catch(() => undefined);
  }, [active, item.type, paused]);

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
        ref={videoRef}
        src={item.src}
        className="testimonial-media"
        muted
        playsInline
        preload={active ? "auto" : "metadata"}
        onEnded={onEnded}
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
            <TestimonialMedia
              item={current}
              active
              paused={paused}
              onEnded={() => go(1)}
            />
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
