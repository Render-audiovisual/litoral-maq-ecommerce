"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useContinuousTicker } from "@/hooks/use-continuous-ticker";

type Testimonial = {
  id: string;
  type: "image" | "video";
  src: string;
  name: string;
};

// Los dos videos van separados por varias fotos para que nunca queden
// pegados en la cinta.
const TESTIMONIALS: Testimonial[] = [
  { id: "clientes-confianza", type: "image", src: "/testimonios/clientes-confianza.jpg", name: "Clientes que confían en Litoral Maq" },
  { id: "nestor", type: "image", src: "/testimonios/nestor-escalera.jpg", name: "Néstor se llevó su escalera" },
  { id: "compras-energy", type: "image", src: "/testimonios/compras-energy.jpg", name: "Compra de herramientas Energy" },
  { id: "ramon", type: "image", src: "/testimonios/ramon-escalera.jpg", name: "Ramón se llevó su escalera" },
  { id: "video-cliente", type: "video", src: "/testimonios/testimonio-cliente.mp4", name: "Un cliente cuenta su experiencia" },
  { id: "clientes-energy", type: "image", src: "/testimonios/clientes-energy.jpg", name: "Clientes con su compra Energy" },
  { id: "dario", type: "image", src: "/testimonios/dario-litoral-maq.jpg", name: "Darío, en el local" },
  { id: "trabajadores", type: "image", src: "/testimonios/clientes-trabajadores.jpg", name: "Clientes que equiparon su trabajo" },
  { id: "itati", type: "image", src: "/testimonios/amigos-itati.jpg", name: "Clientes de Itatí" },
  { id: "corrientes", type: "image", src: "/testimonios/entrega-corrientes.jpg", name: "Entrega en Corrientes" },
  { id: "video-cliente-2", type: "video", src: "/testimonios/testimonio-cliente-2.mp4", name: "Otro cliente cuenta su experiencia" },
  { id: "formosa", type: "image", src: "/testimonios/pedido-formosa.jpg", name: "Pedido enviado a Formosa" },
  { id: "carlos-resistencia", type: "image", src: "/testimonios/carlos-resistencia.jpg", name: "Carlos vino desde Resistencia" },
  { id: "alejandro", type: "image", src: "/testimonios/alejandro-soldadora.jpg", name: "Alejandro se llevó su soldadora" },
  { id: "cliente-equipado", type: "image", src: "/testimonios/cliente-equipado.jpg", name: "Cliente equipado en el local" },
];

// La tarjeta más cerca del centro crece y las demás se achican un poco. La
// escala sale de la distancia al centro en cada frame, así el cambio es
// continuo mientras la cinta pasa.
const CENTER_SCALE = 1.16;
const SIDE_SCALE = 0.88;
const TESTIMONIALS_MAX_FLING_SPEED = 900;

function TestimonialCard({
  item,
  duplicate,
  onVideoPlay,
  onVideoStop,
}: {
  item: Testimonial;
  duplicate: boolean;
  onVideoPlay: () => void;
  onVideoStop: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  return (
    <figure className="testimonial-card" aria-hidden={duplicate || undefined}>
      <div className="testimonial-frame">
        {item.type === "video" ? (
          <video
            ref={videoRef}
            src={item.src}
            className="testimonial-media"
            // Los controles aparecen recién al darle play: antes, el botón
            // grande es la única forma de arrancarlo y no compite con el arrastre.
            controls={started}
            muted
            playsInline
            preload="metadata"
            tabIndex={started && !duplicate ? 0 : -1}
            onPlay={onVideoPlay}
            onPause={onVideoStop}
            onEnded={onVideoStop}
          />
        ) : (
          <Image
            src={item.src}
            alt={duplicate ? "" : item.name}
            fill
            sizes="(max-width: 720px) 50vw, 300px"
            className="testimonial-media"
            draggable={false}
          />
        )}
        {item.type === "video" && !started && (
          <button
            type="button"
            className="testimonial-play"
            tabIndex={duplicate ? -1 : undefined}
            onClick={() => {
              setStarted(true);
              videoRef.current?.play().catch(() => undefined);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M9 7.5v9l7.5-4.5z" /></svg>
            <span className="sr-only">Reproducir: {item.name}</span>
          </button>
        )}
      </div>
      <figcaption>{item.name}</figcaption>
    </figure>
  );
}

/**
 * Cinta infinita de testimonios: avanza sola a velocidad pareja, se frena con
 * el puntero encima o con un video sonando y se puede arrastrar. Igual que las
 * otras cintas del inicio, no mira `prefers-reduced-motion` (ver
 * use-continuous-ticker: si algún día se honra, que sea en las cuatro a la vez).
 */
export function TestimonialsSection({ speed }: { speed: number }) {
  const [playingCount, setPlayingCount] = useState(0);
  const [hovering, setHovering] = useState(false);
  const beltRef = useRef<HTMLDivElement>(null);
  // Centro de cada tarjeta dentro del riel y mitad del ancho visible. Se miden
  // al cambiar el tamaño, no en cada frame: el transform no altera offsetLeft.
  const layoutRef = useRef({ centers: [] as number[], half: 0, reach: 1 });
  const lastOffsetRef = useRef<number | null>(null);

  const { trackRef, dragging, handlers } = useContinuousTicker({
    itemCount: TESTIMONIALS.length,
    speed,
    maxFlingSpeed: TESTIMONIALS_MAX_FLING_SPEED,
    paused: hovering || playingCount > 0,
    onFrame: (offset) => {
      const track = trackRef.current;
      const { centers, half, reach } = layoutRef.current;
      if (!track || centers.length === 0 || offset === lastOffsetRef.current) return;
      lastOffsetRef.current = offset;
      for (let i = 0; i < centers.length; i += 1) {
        const distance = Math.abs(centers[i] - offset - half);
        const t = Math.max(0, 1 - distance / reach);
        const eased = t * t * (3 - 2 * t);
        const card = track.children[i] as HTMLElement | undefined;
        if (card) card.style.transform = `scale(${(SIDE_SCALE + (CENTER_SCALE - SIDE_SCALE) * eased).toFixed(4)})`;
      }
    },
  });

  useEffect(() => {
    const track = trackRef.current;
    const belt = beltRef.current;
    if (!track || !belt) return;
    function measure() {
      if (!track || !belt) return;
      const cards = [...track.children] as HTMLElement[];
      const first = cards[0];
      const next = cards[1];
      layoutRef.current = {
        centers: cards.map((card) => card.offsetLeft + card.offsetWidth / 2),
        half: belt.clientWidth / 2,
        // Una tarjeta a un paso del centro ya quedó en el tamaño lateral.
        reach: first && next ? next.offsetLeft - first.offsetLeft : 1,
      };
      lastOffsetRef.current = null;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(belt);
    return () => observer.disconnect();
  }, [trackRef]);

  const trackItems = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <section className="section testimonials-section">
      <div className="section-heading">
        <div>
          <h2>Clientes que ya se llevaron lo suyo</h2>
          <p>
            Fotos y videos de clientes reales con su compra: retiros en el local de Sáenz 1587,
            entregas en Corrientes y pedidos enviados a Formosa. También vienen desde Resistencia e Itatí.
          </p>
        </div>
      </div>

      <div
        ref={beltRef}
        className={`testimonial-belt${dragging ? " is-dragging" : ""}`}
        role="group"
        aria-roledescription="carrusel"
        aria-label="Testimonios de clientes"
        // Solo el mouse frena la cinta: en el celular un toque dispararía
        // "enter" sin un "leave" y la dejaría quieta para siempre.
        onPointerEnter={(event) => event.pointerType === "mouse" && setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        {...handlers}
      >
        <div className="testimonial-track" ref={trackRef}>
          {trackItems.map((item, index) => (
            <TestimonialCard
              key={`${item.id}-${index}`}
              item={item}
              duplicate={index >= TESTIMONIALS.length}
              onVideoPlay={() => setPlayingCount((n) => n + 1)}
              onVideoStop={() => setPlayingCount((n) => Math.max(0, n - 1))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
