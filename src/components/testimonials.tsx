"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useScaleCarousel } from "@/hooks/use-scale-carousel";

type Testimonial = {
  id: string;
  type: "image" | "video";
  src: string;
  name: string;
};

// Los dos videos van separados por varias fotos para que nunca queden
// pegados al centrar uno u otro.
const TESTIMONIALS: Testimonial[] = [
  { id: "clientes-confianza", type: "image", src: "/testimonios/clientes-confianza.jpg", name: "Clientes que confían en Litoral Maq" },
  { id: "nestor", type: "image", src: "/testimonios/nestor-escalera.jpg", name: "Néstor eligió Litoral Maq" },
  { id: "compras-energy", type: "image", src: "/testimonios/compras-energy.jpg", name: "Clientes Litoral Maq" },
  { id: "ramon", type: "image", src: "/testimonios/ramon-escalera.jpg", name: "Ramón eligió Litoral Maq" },
  { id: "video-cliente", type: "video", src: "/testimonios/testimonio-cliente.mp4", name: "La experiencia de un cliente" },
  { id: "clientes-energy", type: "image", src: "/testimonios/clientes-energy.jpg", name: "Clientes Litoral Maq" },
  { id: "dario", type: "image", src: "/testimonios/dario-litoral-maq.jpg", name: "Darío eligió Litoral Maq" },
  { id: "trabajadores", type: "image", src: "/testimonios/clientes-trabajadores.jpg", name: "Clientes que equiparon su trabajo" },
  { id: "itati", type: "image", src: "/testimonios/amigos-itati.jpg", name: "Clientes de Itatí" },
  { id: "corrientes", type: "image", src: "/testimonios/entrega-corrientes.jpg", name: "Entrega en Corrientes" },
  { id: "video-cliente-2", type: "video", src: "/testimonios/testimonio-cliente-2.mp4", name: "Otro cliente cuenta su experiencia" },
  { id: "formosa", type: "image", src: "/testimonios/pedido-formosa.jpg", name: "Pedido enviado a Formosa" },
  { id: "carlos-resistencia", type: "image", src: "/testimonios/carlos-resistencia.jpg", name: "Carlos vino desde Resistencia" },
  { id: "alejandro", type: "image", src: "/testimonios/alejandro-soldadora.jpg", name: "Alejandro eligió Litoral Maq" },
  { id: "cliente-equipado", type: "image", src: "/testimonios/cliente-equipado.jpg", name: "Cliente equipado en Litoral Maq" },
];

const AUTO_ADVANCE_MS = 3600;

function TestimonialCard({
  item,
  index,
  isActive,
  registerCard,
  onSelect,
  onVideoPlay,
  onVideoStop,
}: {
  item: Testimonial;
  index: number;
  isActive: boolean;
  registerCard: (index: number, node: HTMLElement | null) => void;
  onSelect: (index: number) => void;
  onVideoPlay: () => void;
  onVideoStop: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Si el cliente arrastra mientras un video suena, el video se va del centro:
  // que siga sonando desde una miniatura sería molesto.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isActive || video.paused) return;
    video.pause();
  }, [isActive]);

  return (
    <figure
      ref={(node) => registerCard(index, node)}
      className={`testimonial-card${isActive ? " is-active" : ""}`}
      aria-hidden={!isActive}
    >
      {item.type === "video" ? (
        <video
          ref={videoRef}
          src={item.src}
          className="testimonial-media"
          // Solo la central se maneja: en las chicas los controles no se
          // podrían ni tocar, y el click sirve para traerla al centro.
          controls={isActive}
          muted
          playsInline
          preload="metadata"
          tabIndex={isActive ? 0 : -1}
          onPlay={onVideoPlay}
          onPause={onVideoStop}
          onEnded={onVideoStop}
        />
      ) : (
        <Image
          src={item.src}
          alt={item.name}
          fill
          sizes="(max-width: 720px) 60vw, 33vw"
          className="testimonial-media"
          draggable={false}
        />
      )}
      {item.type === "video" && !isActive && <span className="testimonial-play" aria-hidden>
        <svg viewBox="0 0 24 24" focusable="false"><path d="M9 7.5v9l7.5-4.5z" /></svg>
      </span>}
      {!isActive && (
        <button
          type="button"
          className="testimonial-reach"
          onClick={() => onSelect(index)}
          tabIndex={-1}
        >
          <span className="sr-only">Ver {item.name}</span>
        </button>
      )}
    </figure>
  );
}

export function TestimonialsSection() {
  const [playingCount, setPlayingCount] = useState(0);
  const [hovering, setHovering] = useState(false);
  const { stageRef, registerCard, activeIndex, dragging, goTo, handlers } =
    useScaleCarousel({
      count: TESTIMONIALS.length,
      autoAdvanceMs: AUTO_ADVANCE_MS,
      paused: playingCount > 0 || hovering,
    });

  const active = TESTIMONIALS[activeIndex];

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
        className={`testimonial-carousel${dragging ? " is-dragging" : ""}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div
          ref={stageRef}
          className="testimonial-stage"
          role="group"
          aria-roledescription="carrusel"
          aria-label="Testimonios de clientes"
          {...handlers}
        >
          {TESTIMONIALS.map((item, index) => (
            <TestimonialCard
              key={item.id}
              item={item}
              index={index}
              isActive={index === activeIndex}
              registerCard={registerCard}
              onSelect={goTo}
              onVideoPlay={() => setPlayingCount((n) => n + 1)}
              onVideoStop={() => setPlayingCount((n) => Math.max(0, n - 1))}
            />
          ))}
        </div>

        <figcaption className="testimonial-caption" aria-live="polite">
          {active?.name}
        </figcaption>

      </div>
    </section>
  );
}
