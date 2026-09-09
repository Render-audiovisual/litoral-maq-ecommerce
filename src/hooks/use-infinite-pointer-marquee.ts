"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

type InfinitePointerMarqueeOptions = {
  itemCount: number;
  autoSpeed: number;
  maxFlingSpeed: number;
  paused?: boolean;
};

/**
 * Movimiento continuo para rieles duplicados: gira solo, y con mouse o dedo
 * se agarra y se arrastra igual que en el celular. Al soltar conserva la
 * velocidad del gesto y desacelera hasta volver al automático, sin frenar
 * nunca. El contenido debe estar duplicado exactamente una vez.
 */
export function useInfinitePointerMarquee({
  itemCount,
  autoSpeed,
  maxFlingSpeed,
  paused = false,
}: InfinitePointerMarqueeOptions) {
  const railRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(autoSpeed);
  // Conservamos la posición con decimales fuera del DOM. Algunos navegadores
  // móviles redondean scrollLeft a enteros; si se lee y reescribe en cada
  // frame, un avance menor a 1 px se pierde y el automático queda detenido.
  const positionRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const pointerRef = useRef({ pointerId: -1, startX: 0, lastX: 0, lastTime: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (itemCount < 2) return;
    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const rail = railRef.current;

      if (rail && !draggingRef.current && !paused) {
        // Al soltar, la velocidad del gesto decae hasta el automático: cuanto
        // más fuerte el envión, más tarda en volver, pero nunca se detiene.
        velocityRef.current += (autoSpeed - velocityRef.current) * Math.min(1, dt * 1.8);

        const loopWidth = rail.scrollWidth / 2;
        if (loopWidth > 0) {
          let next = (positionRef.current ?? rail.scrollLeft) + velocityRef.current * dt;
          while (next >= loopWidth) next -= loopWidth;
          while (next < 0) next += loopWidth;
          positionRef.current = next;
          rail.scrollLeft = next;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [autoSpeed, itemCount, paused]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Los controles del video se usan con el mismo puntero que el arrastre.
    if ((event.target as HTMLElement).closest("video")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingRef.current = true;
    draggedRef.current = false;
    velocityRef.current = 0;
    positionRef.current = railRef.current?.scrollLeft ?? 0;
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
    };
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Algunos navegadores cancelan el puntero antes de permitir capturarlo.
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || pointerRef.current.pointerId !== event.pointerId) return;

    const rail = railRef.current;
    if (!rail) return;
    const now = performance.now();
    const dx = event.clientX - pointerRef.current.lastX;
    const elapsed = Math.max(16, now - pointerRef.current.lastTime);
    // Contra el punto inicial, no contra el frame previo: un arrastre lento
    // avanza de a 1 px por evento y aun así es un arrastre, no un clic.
    if (Math.abs(event.clientX - pointerRef.current.startX) > 4) draggedRef.current = true;

    const loopWidth = rail.scrollWidth / 2;
    let next = (positionRef.current ?? rail.scrollLeft) - dx;
    if (loopWidth > 0) {
      while (next >= loopWidth) next -= loopWidth;
      while (next < 0) next += loopWidth;
    }
    positionRef.current = next;
    rail.scrollLeft = next;
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
    railRef,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onClickCapture,
      // Sin esto el navegador arranca su propio arrastre nativo de la imagen
      // o del enlace y el gesto del mouse se corta a mitad de camino.
      onDragStart: (event: ReactDragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}
