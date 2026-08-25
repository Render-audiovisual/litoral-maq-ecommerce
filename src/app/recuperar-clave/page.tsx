"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { authCallbackUrl } from "@/lib/auth-callbacks";
import { friendlyAuthError, RESEND_COOLDOWN_SECONDS } from "@/lib/auth-errors";
import { useCooldown } from "@/components/use-cooldown";
import { getAuthAdapter } from "@/services/auth";

/** Neutro a propósito: no revela si el email corresponde a una cuenta. */
const NEUTRAL_NOTICE =
  "Si existe una cuenta con ese email, vas a recibir el enlace en unos minutos. Revisá también spam.";

function RecoveryForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    await cooldown.run(async () => {
      setLoading(true);
      try {
        await getAuthAdapter().requestPasswordReset(email, authCallbackUrl("passwordRecovery", window.location.origin));
        setSent(true);
      } catch (caught) {
        // Un fallo del envío tampoco puede delatar si el email existe: solo
        // se distingue el rate limit, que no depende de la cuenta.
        setError(friendlyAuthError(caught, NEUTRAL_NOTICE));
        setSent(true);
      } finally { setLoading(false); }
    });
  }

  const disabled = loading || cooldown.active;
  const label = loading ? "Enviando…" : cooldown.active ? `Esperá ${cooldown.remaining}s` : "Enviar enlace";

  return <main className="simple-auth-page"><section className="auth-card">
    <span className="eyebrow orange">RECUPERAR ACCESO</span><h1>Restablecé tu contraseña</h1>
    <p>Ingresá tu email y te enviaremos un enlace seguro para crear una nueva clave.</p>
    {sent && <div className="success-message">{NEUTRAL_NOTICE}</div>}
    <form onSubmit={submit}>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {error && <div className="error-message">{error}</div>}
      <button className="button primary large full" disabled={disabled}>{label}</button>
      {cooldown.active && <p className="form-helper">Podés pedir otro enlace en {cooldown.remaining} segundos.</p>}
    </form>
    <p><Link href="/login">Volver a ingresar</Link></p>
  </section></main>;
}

export default function RecoveryPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><RecoveryForm /></Suspense>;
}
