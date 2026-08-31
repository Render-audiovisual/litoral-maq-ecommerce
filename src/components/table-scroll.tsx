"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Tabla con scroll horizontal y una segunda barra arriba.
 *
 * Las tablas del panel no entran en una notebook de 15,6": sobra ancho por la
 * derecha. La barra de scroll propia del contenedor queda al final de la
 * tabla, así que para correrse un poco había que bajar hasta el último pedido,
 * arrastrar, y volver a subir. Con listas largas es inusable.
 *
 * Esta barra espeja la de abajo y queda a la vista junto al encabezado. Se
 * renderiza sólo cuando hay desborde real, así que en pantallas anchas no
 * aparece nada.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const barra = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [desborda, setDesborda] = useState(false);

  const medir = useCallback(() => {
    const el = cuerpo.current;
    if (!el) return;
    setAncho(el.scrollWidth);
    // 1px de tolerancia: el redondeo del navegador da diferencias de medio
    // píxel en anchos fraccionarios y haría aparecer una barra inútil.
    setDesborda(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    const el = cuerpo.current;
    if (!el) return;
    medir();

    const observadorTamano = new ResizeObserver(medir);
    observadorTamano.observe(el);
    // Filtrar o buscar cambia las filas, y con ellas el ancho de la tabla.
    const observadorContenido = new MutationObserver(medir);
    observadorContenido.observe(el, { childList: true, subtree: true });

    return () => {
      observadorTamano.disconnect();
      observadorContenido.disconnect();
    };
  }, [medir]);

  /**
   * Espejado. Asignar el mismo valor que ya tiene no dispara otro evento de
   * scroll, así que el rebote se corta solo tras un salto y no hace falta
   * ningún flag.
   */
  const sincronizar = useCallback((desde: HTMLDivElement | null, hacia: HTMLDivElement | null) => {
    if (!desde || !hacia || hacia.scrollLeft === desde.scrollLeft) return;
    hacia.scrollLeft = desde.scrollLeft;
  }, []);

  return (
    <>
      {desborda && (
        <div
          ref={barra}
          className="table-scroll-top"
          aria-hidden="true"
          onScroll={() => sincronizar(barra.current, cuerpo.current)}
        >
          <div style={{ width: ancho }} />
        </div>
      )}
      <div
        ref={cuerpo}
        className="table-wrap"
        onScroll={() => sincronizar(cuerpo.current, barra.current)}
      >
        {children}
      </div>
    </>
  );
}
