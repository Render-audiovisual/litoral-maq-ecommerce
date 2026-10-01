"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Activa una animación continua sólo cuando puede verse y el usuario permite
 * movimiento. Evita gastar cuadros de render en pestañas o secciones ocultas.
 */
export function useAnimationActivity(targetRef: RefObject<Element | null>) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inViewport = true;

    const update = () => setActive(inViewport && !document.hidden && !motion.matches);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry?.isIntersecting ?? false;
        update();
      },
      { rootMargin: "160px 0px" },
    );

    observer.observe(target);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    update();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, [targetRef]);

  return active;
}
