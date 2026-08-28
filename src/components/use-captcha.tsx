"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile para los formularios de autenticación.
 *
 * Por qué acá y no una dependencia (`@marsidev/react-turnstile`, el ejemplo
 * de la doc de Supabase): el widget ya expone una API de render explícito;
 * envolverla son treinta líneas y evita sumar un paquete al bundle de un
 * sitio estático.
 *
 * La SITE KEY es pública por diseño — viaja en el HTML de cualquier sitio
 * con Turnstile. La SECRET KEY no está en este repositorio ni puede estarlo:
 * vive únicamente en el panel de Cloudflare y en la configuración de Auth
 * del proyecto Supabase, que es quien valida el token contra Cloudflare.
 *
 * Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` definida, el hook queda inerte y los
 * formularios funcionan igual: así siguen andando el modo local, los E2E y
 * cualquier entorno donde todavía no se creó el widget.
 */

const PRODUCTION_STORE_DOMAIN = "litoralmaqrender.rendercorrientes.com";
// La clave del widget es pública. El fallback queda limitado al dominio real
// para que desarrollo y E2E sigan sin CAPTCHA salvo que definan su propia key.
const PRODUCTION_SITE_KEY = "0x4AAAAAAEfSCNhlTi3BDkDF";
const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
  (process.env.NEXT_PUBLIC_STORE_DOMAIN === PRODUCTION_STORE_DOMAIN ? PRODUCTION_SITE_KEY : "");
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined" || window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Se descarta la promesa fallida para que un reintento posterior
        // (otra pantalla, o volver a esta) pueda cargar el script de nuevo.
        scriptPromise = null;
        reject(new Error("No se pudo cargar la verificación de seguridad."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export const CAPTCHA_PENDING_NOTICE = "Completá la verificación de seguridad para continuar.";
export const CAPTCHA_FAILED_NOTICE =
  "No pudimos cargar la verificación de seguridad. Revisá tu conexión y recargá la página.";

export function useCaptcha() {
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          // Un token vencido o con error vuelve a dejar el formulario en
          // "falta verificar" en vez de mandar un token muerto: Supabase lo
          // rechazaría y la persona vería un error sin saber qué hacer.
          callback: (value: string) => {
            setFailed(false);
            setToken(value);
          },
          "expired-callback": () => setToken(""),
          "timeout-callback": () => setToken(""),
          "error-callback": () => {
            setToken("");
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, []);

  /** Los tokens son de un solo uso: tras cada envío hay que pedir otro. */
  const reset = useCallback(() => {
    setToken("");
    if (widgetRef.current && window.turnstile) window.turnstile.reset(widgetRef.current);
  }, []);

  const required = Boolean(SITE_KEY);
  const solved = !required || Boolean(token);

  const field = (
    <div className="captcha-field">
      <div ref={containerRef} />
      {required && !token && (
        <p className="form-helper" role="status" aria-live="polite">
          {failed ? CAPTCHA_FAILED_NOTICE : CAPTCHA_PENDING_NOTICE}
        </p>
      )}
    </div>
  );

  return { token: token || undefined, required, solved, reset, field };
}
