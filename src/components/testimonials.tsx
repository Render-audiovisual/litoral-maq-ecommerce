"use client";

import Image from "next/image";
import { useState } from "react";
import { useInfinitePointerMarquee } from "@/hooks/use-infinite-pointer-marquee";

type Testimonial = {
  id: string;
  type: "image" | "video";
  src: string | null;
  name: string;
};

// Los dos videos van separados por varias fotos (y lejos de las puntas de
// la lista) para que no queden pegados ni entre si ni al saltar el loop.
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

// Lista duplicada para el loop infinito: cuando el scroll pasa la mitad, saltamos -mitad sin que se note.
const TRACK_ITEMS = [...TESTIMONIALS, ...TESTIMONIALS];

const AUTO_SCROLL_SPEED = 42; // px por segundo
const MOUSE_MAX_SPEED = 280;
const TOUCH_MAX_SPEED = 1650;

function TestimonialCard({
  item,
  copyIndex,
  onVideoPlay,
  onVideoStop,
}: {
  item: Testimonial;
  copyIndex: number;
  onVideoPlay: () => void;
  onVideoStop: () => void;
}) {
  if (!item.src) return null;

  return (
    <article className="testimonial-card" aria-hidden={copyIndex === 1}>
      {item.type === "video" ? (
        <video
          src={item.src}
          className="testimonial-media"
          controls
          muted
          playsInline
          preload="metadata"
          onPlay={onVideoPlay}
          onPause={onVideoStop}
          onEnded={onVideoStop}
        />
      ) : (
        <Image src={item.src} alt={item.name} fill sizes="250px" className="testimonial-media" />
      )}
      <span className="testimonial-name">{item.name}</span>
    </article>
  );
}

export function TestimonialsSection() {
  const [playingCount, setPlayingCount] = useState(0);
  const { railRef, dragging, handlers } = useInfinitePointerMarquee({
    itemCount: TESTIMONIALS.length,
    autoSpeed: AUTO_SCROLL_SPEED,
    mouseMaxSpeed: MOUSE_MAX_SPEED,
    touchMaxSpeed: TOUCH_MAX_SPEED,
    paused: playingCount > 0,
  });

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
        ref={railRef}
        className={`testimonial-marquee${dragging ? " is-dragging" : ""}`}
        aria-label="Testimonios de clientes, se puede deslizar"
        {...handlers}
      >
        <div className="testimonial-track">
          {TRACK_ITEMS.map((item, index) => (
            <TestimonialCard
              item={item}
              copyIndex={Math.floor(index / TESTIMONIALS.length)}
              key={`${item.id}-${index}`}
              onVideoPlay={() => setPlayingCount((n) => n + 1)}
              onVideoStop={() => setPlayingCount((n) => Math.max(0, n - 1))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
