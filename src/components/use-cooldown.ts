"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cuenta regresiva para acciones que no deben repetirse enseguida (reenvío
 * de emails). Devuelve los segundos restantes y un `run` que ignora las
 * llamadas mientras el cooldown esté activo o haya una en curso — eso cubre
 * el doble clic rápido, que un `disabled` puesto por estado no alcanza a
 * frenar porque React aplica el re-render después del segundo evento.
 */
export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy.current || remaining > 0) return false;
      busy.current = true;
      try {
        await action();
        setRemaining(seconds);
        return true;
      } finally {
        busy.current = false;
      }
    },
    [remaining, seconds],
  );

  return { remaining, active: remaining > 0, run };
}
