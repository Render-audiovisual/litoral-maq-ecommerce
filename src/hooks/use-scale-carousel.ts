"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

type ScaleCarouselOptions = {
  /** Cantidad de tarjetas. Cada una se renderiza una sola vez: el bucle se
   *  resuelve con la distancia más corta, no duplicando el contenido. */
  count: number;
  /** Milisegundos entre avances automáticos. 0 lo desactiva. */
  autoAdvanceMs?: number;
  /** Frena el avance automático (video reproduciéndose, puntero encima…). */
  paused?: boolean;
};

// Proporciones tomadas del carrusel de referencia: la central manda y las
// laterales caen en progresión geométrica, que es lo que da la sensación de
// profundidad sin usar 3D real.
const SIDE_RATIO = 0.7; // vecinas legibles aun con material vertical 9:16
const DECAY = 0.84; // reducción gradual hacia los extremos
// Al encajar tarda cerca de un segundo en vez de medio: el recambio se ve
// deslizar en lugar de acomodarse de golpe, que es lo que hace que la cinta
// se sienta viva entre paso y paso.
const SNAP_RESPONSE = 3.2;
const DRAG_CLICK_THRESHOLD = 8;

/** Tamaño relativo de una tarjeta según su distancia continua al centro. */
export function scaleAtDistance(distance: number) {
  const u = Math.abs(distance);
  if (u <= 1) return 1 + (SIDE_RATIO - 1) * u;
  return SIDE_RATIO * DECAY ** (u - 1);
}

/** Todas las tarjetas permanecen nítidas; el orden y la escala dan profundidad. */
export function opacityAtDistance(distance: number) {
  return Number.isFinite(distance) ? 1 : 0;
}

/**
 * Carrusel de escala: una tarjeta central grande y una cola de tarjetas cada
 * vez más chicas a los costados. La posición es un número con decimales, así
 * que el arrastre sigue al dedo de forma continua y al soltar encaja en la
 * tarjeta más cercana.
 *
 * El layout lo aplica el hook directamente sobre el DOM en cada frame: con
 * quince tarjetas moviéndose, volver a renderizar React en cada frame sería
 * tirar trabajo al pedo.
 */
export function useScaleCarousel({ count, autoAdvanceMs = 0, paused = false }: ScaleCarouselOptions) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<Array<HTMLElement | null>>([]);
  const positionRef = useRef(0);
  const targetRef = useRef(0);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const pointerRef = useRef({ pointerId: -1, startX: 0, lastX: 0 });
  const stepRef = useRef(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragging, setDragging] = useState(false);

  const registerCard = useCallback((index: number, node: HTMLElement | null) => {
    cardsRef.current[index] = node;
  }, []);

  /** Distancia más corta entre una tarjeta y la posición actual, con bucle. */
  const wrappedDistance = useCallback(
    (index: number, position: number) => {
      const half = count / 2;
      let d = (index - position) % count;
      if (d > half) d -= count;
      if (d < -half) d += count;
      return d;
    },
    [count],
  );

  const goTo = useCallback((index: number) => {
    // Va por el camino corto aunque eso signifique un objetivo fuera de rango:
    // la posición se normaliza sola al llegar.
    const current = positionRef.current;
    const half = count / 2;
    let delta = (index - current) % count;
    if (delta > half) delta -= count;
    if (delta < -half) delta += count;
    targetRef.current = current + delta;
  }, [count]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let nextAdvance = performance.now() + autoAdvanceMs;
// Las cintas del inicio se mueven siempre, igual que la barra superior y el
// carrusel de categorías, que nunca miraron esta preferencia. Cuando solo
// estas dos la respetaban, en una máquina que pide "menos movimiento" el
// inicio quedaba a medias —dos cintas corriendo y dos congeladas— y se leía
// como que estaban rotas. Si alguna vez se decide honrar la preferencia,
// tiene que hacerse en los cuatro lugares a la vez, no en dos.

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!draggingRef.current) {
        if (autoAdvanceMs > 0 && !paused && now >= nextAdvance) {
          targetRef.current = Math.round(targetRef.current) + 1;
          nextAdvance = now + autoAdvanceMs;
        }
        const delta = targetRef.current - positionRef.current;
        positionRef.current += delta * Math.min(1, dt * SNAP_RESPONSE);
        if (Math.abs(delta) < 0.001) positionRef.current = targetRef.current;
      } else {
        nextAdvance = now + autoAdvanceMs;
      }

      // Normalizar sin saltos visibles: posición y objetivo se corren juntos.
      if (positionRef.current < 0 || positionRef.current >= count) {
        const shift = Math.floor(positionRef.current / count) * count;
        positionRef.current -= shift;
        targetRef.current -= shift;
      }

      const stage = stageRef.current;
      if (stage) {
        const stageWidth = stage.clientWidth;
        // La central ocupa poco más de un cuarto del ancho en escritorio y
        // bastante más en pantallas angostas, donde si no queda diminuta.
        const centerWidth = Math.min(
          stageWidth * (stageWidth < 720 ? 0.62 : 0.3),
          stage.clientHeight * 0.5625,
        );
        const gap = stageWidth < 720 ? 10 : 18;
        stepRef.current = centerWidth * 0.82 + gap;

        for (let index = 0; index < count; index += 1) {
          const card = cardsRef.current[index];
          if (!card) continue;
          const d = wrappedDistance(index, positionRef.current);
          const scale = scaleAtDistance(d);
          const width = centerWidth * scale;

          // Posición acumulada: integra el ancho de todo lo que hay en el
          // medio, para que la separación entre tarjetas sea pareja.
          let offset = 0;
          const steps = 18;
          const stepSize = Math.abs(d) / steps;
          for (let s = 0; s < steps; s += 1) {
            offset += (centerWidth * scaleAtDistance((s + 0.5) * stepSize) + gap) * stepSize;
          }
          const x = Math.sign(d) * offset;

          card.style.width = `${width}px`;
          card.style.transform = `translate3d(calc(-50% + ${x}px), -50%, 0)`;
          card.style.opacity = `${opacityAtDistance(d)}`;
          card.style.zIndex = `${Math.round(100 - Math.abs(d) * 10)}`;
          // Las cercanas siguen siendo clickeables para traerlas al centro;
          // las del fondo no, así no roban el click bajo el degradado.
          card.style.pointerEvents = Math.abs(d) <= 3 ? "auto" : "none";
        }
      }

      const nearest = ((Math.round(positionRef.current) % count) + count) % count;
      setActiveIndex((current) => (current === nearest ? current : nearest));

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [autoAdvanceMs, count, paused, wrappedDistance]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Los controles del video usan el mismo puntero que el arrastre.
    if ((event.target as HTMLElement).closest("video")) return;
    draggingRef.current = true;
    draggedRef.current = false;
    pointerRef.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || pointerRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - pointerRef.current.lastX;
    if (Math.abs(event.clientX - pointerRef.current.startX) > DRAG_CLICK_THRESHOLD) {
      draggedRef.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Si el navegador cancela el puntero, la posición ya recorrida queda
          // y al soltar encaja igual en la tarjeta más cercana.
        }
      }
    }
    positionRef.current -= dx / stepRef.current;
    targetRef.current = positionRef.current;
    pointerRef.current.lastX = event.clientX;
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || pointerRef.current.pointerId !== event.pointerId) return;
    draggingRef.current = false;
    setDragging(false);
    targetRef.current = Math.round(positionRef.current);
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
    stageRef,
    registerCard,
    activeIndex,
    dragging,
    goTo,
    next: useCallback(() => { targetRef.current = Math.round(targetRef.current) + 1; }, []),
    previous: useCallback(() => { targetRef.current = Math.round(targetRef.current) - 1; }, []),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onClickCapture,
      onDragStart: (event: ReactDragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}
