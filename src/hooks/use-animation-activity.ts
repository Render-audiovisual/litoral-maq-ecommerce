"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Activa una animación continua sólo mientras puede verse.
 *
 * La preferencia `prefers-reduced-motion` se resuelve en CSS para las entradas
 * decorativas. Los carruseles de producto usan este hook como parte de su
 * navegación: apagarlos desde acá los dejaba congelados, incluso cuando el
 * usuario intentaba arrastrarlos. Sí se detienen al salir del viewport o al
 * ocultar la pestaña para no gastar cuadros de render innecesarios.
 */
export function useAnimationActivity(targetRef: RefObject<Element | null>) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let inViewport = true;

    const update = () => setActive(inViewport && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry?.isIntersecting ?? false;
        update();
      },
      { rootMargin: "160px 0px" },
    );

    observer.observe(target);
    document.addEventListener("visibilitychange", update);
    update();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [targetRef]);

  return active;
}
