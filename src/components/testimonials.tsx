"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
const TOUCH_RESUME_DELAY = 2200; // ms tras soltar el dedo antes de retomar el auto-scroll

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
  const trackRef = useRef<HTMLDivElement>(null);
  const [playingCount, setPlayingCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });
  const resumeTimer = useRef<number | undefined>(undefined);

  // Auto-scroll continuo por rAF sobre un elemento con scroll nativo real,
  // en vez de una animacion CSS: asi el usuario puede arrastrar/deslizar en
  // cualquier momento sin pelear con la animacion, y no depende de que el
  // navegador tenga las animaciones CSS habilitadas.
  useEffect(() => {
    let raf: number;
    let last = performance.now();

    function step(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      const el = trackRef.current;
      if (el && !draggingRef.current && !pausedRef.current && playingCount === 0) {
        el.scrollLeft += AUTO_SCROLL_SPEED * dt;
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) el.scrollLeft -= half;
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playingCount]);

  function onTouchStart() {
    pausedRef.current = true;
    window.clearTimeout(resumeTimer.current);
  }

  function onTouchEnd() {
    resumeTimer.current = window.setTimeout(() => {
      pausedRef.current = false;
    }, TOUCH_RESUME_DELAY);
  }

  function onMouseEnter() {
    pausedRef.current = true;
  }

  function onMouseLeave() {
    if (!draggingRef.current) pausedRef.current = false;
    endDrag();
  }

  function onMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const el = trackRef.current;
    // Solo el clic izquierdo arrastra. Con el derecho se abre el menu
    // contextual del navegador y nunca llega un mouseup a este elemento,
    // asi que si lo tratabamos como arrastre quedaba trabado para siempre.
    if (!el || event.button !== 0) return;
    // Sin esto, arrastrar sobre una imagen dispara el drag-and-drop nativo
    // del navegador, que se queda con mousemove/mouseup y el scroll queda pegado.
    event.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    dragStart.current = { x: event.clientX, scrollLeft: el.scrollLeft };
  }

  function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = dragStart.current.scrollLeft - (event.clientX - dragStart.current.x);
  }

  function endDrag() {
    draggingRef.current = false;
    setDragging(false);
  }

  // Red de seguridad: si el mouseup nunca llega al elemento (soltar afuera
  // de la ventana, perder el foco, un popup que se roba el evento), esto
  // igual libera el arrastre para que el carrusel no quede pegado.
  useEffect(() => {
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, []);

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
        ref={trackRef}
        className={`testimonial-marquee${dragging ? " is-dragging" : ""}`}
        aria-label="Testimonios de clientes, se puede deslizar"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
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
