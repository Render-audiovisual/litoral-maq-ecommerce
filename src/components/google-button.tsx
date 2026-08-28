"use client";

import { useState } from "react";
import { authCallbackUrl } from "@/lib/auth-callbacks";
import { getAuthAdapter, supportsOAuth } from "@/services/auth";

/**
 * Ingreso real con Google (Supabase OAuth). No se renderiza nada con el
 * adaptador local: ofrecer el botón sin OAuth detrás fue exactamente el
 * problema que documenta `no-shared-credentials.test.ts`.
 *
 * El adaptador decide solo entre `signInWithOAuth` y `linkIdentity` según
 * haya o no una sesión de invitado (ver `OAuthCapableAuthAdapter`), así que
 * este botón es el mismo en el login, en el registro y en la pantalla de
 * éxito de la compra.
 */
export function GoogleSignInButton({
  label = "Continuar con Google",
  className = "button secondary large full",
}: {
  label?: string;
  className?: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  let adapter;
  try {
    adapter = getAuthAdapter();
  } catch {
    return null;
  }
  if (!supportsOAuth(adapter)) return null;
  const oauthAdapter = adapter;

  async function start() {
    setError("");
    setLoading(true);
    try {
      // Redirige a Google: si todo sale bien, esta pantalla ya no existe
      // cuando vuelve la promesa. `setLoading(false)` solo corre si falló.
      await oauthAdapter.startGoogleSignIn(authCallbackUrl("oauth", window.location.origin));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo continuar con Google.");
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={start} disabled={loading}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.4v3.1A12 12 0 0 0 12 24z"
          />
          <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
          />
        </svg>
        {loading ? "Abriendo Google…" : label}
      </button>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
