"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

type InfinitePointerMarqueeOptions = {
  itemCount: number;
  autoSpeed: number;
  mouseMaxSpeed: number;
  touchMaxSpeed: number;
  paused?: boolean;
};

/**
 * Movimiento continuo para rieles duplicados: el mouse gobierna dirección y
 * velocidad en escritorio, mientras que el gesto táctil aporta velocidad e
 * inercia en móvil. El contenido debe estar duplicado exactamente una vez.
 */
export function useInfinitePointerMarquee({
  itemCount,
  autoSpeed,
  mouseMaxSpeed,
  touchMaxSpeed,
  paused = false,
}: InfinitePointerMarqueeOptions) {
  const railRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(autoSpeed);
  // Conservamos la posición con decimales fuera del DOM. Algunos navegadores
  // móviles redondean scrollLeft a enteros; si se lee y reescribe en cada
  // frame, un avance menor a 1 px se pierde y el automático queda detenido.
  const positionRef = useRef<number | null>(null);
  const mouseVelocityRef = useRef(autoSpeed);
  const mouseInsideRef = useRef(false);
  const touchingRef = useRef(false);
  const draggedRef = useRef(false);
  const touchRef = useRef({ pointerId: -1, lastX: 0, lastTime: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (itemCount < 2) return;
    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const rail = railRef.current;

      if (rail && !touchingRef.current && !paused) {
        const target = mouseInsideRef.current ? mouseVelocityRef.current : autoSpeed;
        const response = mouseInsideRef.current ? 6 : 1.8;
        velocityRef.current += (target - velocityRef.current) * Math.min(1, dt * response);

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

  function updateMouseDirection(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || touchingRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalized = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const strength = Math.abs(normalized);
    mouseVelocityRef.current = strength < 0.08
      ? 0
      : -Math.sign(normalized) * (18 + strength * (mouseMaxSpeed - 18));
  }

  function onPointerEnter(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    positionRef.current = event.currentTarget.scrollLeft;
    mouseInsideRef.current = true;
    updateMouseDirection(event);
  }

  function onPointerLeave(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") mouseInsideRef.current = false;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || (event.target as HTMLElement).closest("video")) return;
    touchingRef.current = true;
    draggedRef.current = false;
    velocityRef.current = 0;
    positionRef.current = railRef.current?.scrollLeft ?? 0;
    touchRef.current = {
      pointerId: event.pointerId,
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
    updateMouseDirection(event);
    if (!touchingRef.current || touchRef.current.pointerId !== event.pointerId) return;

    const rail = railRef.current;
    if (!rail) return;
    const now = performance.now();
    const dx = event.clientX - touchRef.current.lastX;
    const elapsed = Math.max(16, now - touchRef.current.lastTime);
    if (Math.abs(dx) > 2) draggedRef.current = true;

    const loopWidth = rail.scrollWidth / 2;
    let next = (positionRef.current ?? rail.scrollLeft) - dx;
    if (loopWidth > 0) {
      while (next >= loopWidth) next -= loopWidth;
      while (next < 0) next += loopWidth;
    }
    positionRef.current = next;
    rail.scrollLeft = next;
    velocityRef.current = Math.max(
      -touchMaxSpeed,
      Math.min(touchMaxSpeed, -(dx / (elapsed / 1000))),
    );
    touchRef.current.lastX = event.clientX;
    touchRef.current.lastTime = now;
  }

  function endTouch(event: ReactPointerEvent<HTMLDivElement>) {
    if (!touchingRef.current || touchRef.current.pointerId !== event.pointerId) return;
    touchingRef.current = false;
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
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onPointerMove,
      onPointerUp: endTouch,
      onPointerCancel: endTouch,
      onLostPointerCapture: endTouch,
      onClickCapture,
    },
  };
}
