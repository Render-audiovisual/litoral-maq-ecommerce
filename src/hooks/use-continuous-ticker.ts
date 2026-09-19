"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

type ContinuousTickerOptions = {
  /** Cantidad de elementos originales; el riel debe renderizarlos dos veces. */
  itemCount: number;
  /** Velocidad automática en píxeles por segundo. */
  speed: number;
  /** Tope del envión al soltar, en píxeles por segundo. */
  maxFlingSpeed: number;
};

const INERTIA_RESPONSE = 1.5; // el envión del gesto decae hasta el automático
const DRAG_CLICK_THRESHOLD = 10; // un clic normal mueve algunos píxeles

/**
 * Cinta horizontal continua, al estilo de un ticker: el riel entero se
 * desplaza con `transform` a velocidad constante y el contenido duplicado
 * hace que el corte no se vea.
 *
 * A diferencia de `useInfinitePointerMarquee`, que se apoya en el scroll
 * nativo y por eso en pantallas táctiles depende del navegador, acá el
 * movimiento lo controla siempre el mismo código: se ve y se arrastra igual
 * en móvil y en escritorio. El contenedor debe declarar `touch-action: pan-y`
 * para que el gesto vertical siga siendo scroll de la página.
 */
export function useContinuousTicker({
  itemCount,
  speed,
  maxFlingSpeed,
}: ContinuousTickerOptions) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(speed);
  // Ancho de un juego completo de tarjetas. Se mide con la posición real de
  // la primera copia en vez de dividir el ancho total: así el salto del
  // reinicio no arrastra el error del gap entre tarjetas.
  const loopRef = useRef(0);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const pointerRef = useRef({ pointerId: -1, startX: 0, lastX: 0, lastTime: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || itemCount < 1) return;

    function measure() {
      if (!track) return;
      const first = track.children[0] as HTMLElement | undefined;
      const duplicate = track.children[itemCount] as HTMLElement | undefined;
      loopRef.current = first && duplicate ? duplicate.offsetLeft - first.offsetLeft : 0;
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [itemCount]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
// Las cintas del inicio se mueven siempre, igual que la barra superior y el
// carrusel de categorías, que nunca miraron esta preferencia. Cuando solo
// estas dos la respetaban, en una máquina que pide "menos movimiento" el
// inicio quedaba a medias —dos cintas corriendo y dos congeladas— y se leía
// como que estaban rotas. Si alguna vez se decide honrar la preferencia,
// tiene que hacerse en los cuatro lugares a la vez, no en dos.

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const track = trackRef.current;

      if (track) {
        if (!draggingRef.current) {
          velocityRef.current += (speed - velocityRef.current) * Math.min(1, dt * INERTIA_RESPONSE);
          offsetRef.current += velocityRef.current * dt;
        }
        const loop = loopRef.current;
        if (loop > 0) {
          offsetRef.current %= loop;
          if (offsetRef.current < 0) offsetRef.current += loop;
        }
        track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingRef.current = true;
    draggedRef.current = false;
    velocityRef.current = 0;
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
    };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || pointerRef.current.pointerId !== event.pointerId) return;

    const now = performance.now();
    const dx = event.clientX - pointerRef.current.lastX;
    const elapsed = Math.max(16, now - pointerRef.current.lastTime);

    // Contra el punto inicial, no contra el frame previo: un arrastre lento
    // avanza de a 1 px por evento y aun así es un arrastre, no un clic.
    if (Math.abs(event.clientX - pointerRef.current.startX) > DRAG_CLICK_THRESHOLD) {
      draggedRef.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Si el navegador canceló el puntero, la cinta conserva lo recorrido
          // y vuelve al movimiento automático al terminar el gesto.
        }
      }
    }

    offsetRef.current -= dx;
    velocityRef.current = Math.max(
      -maxFlingSpeed,
      Math.min(maxFlingSpeed, -(dx / (elapsed / 1000))),
    );
    pointerRef.current.lastX = event.clientX;
    pointerRef.current.lastTime = now;
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || pointerRef.current.pointerId !== event.pointerId) return;
    draggingRef.current = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
  }

  return {
    trackRef,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onClickCapture,
      // Sin esto el navegador arranca su propio arrastre nativo del enlace o
      // de la imagen y el gesto del mouse se corta a mitad de camino.
      onDragStart: (event: ReactDragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}
