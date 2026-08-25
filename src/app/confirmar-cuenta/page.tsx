"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { authCallbackUrl } from "@/lib/auth-callbacks";
import { friendlyAuthError, RESEND_COOLDOWN_SECONDS } from "@/lib/auth-errors";
import { useCooldown } from "@/components/use-cooldown";
import { getAuthAdapter } from "@/services/auth";

/** Neutro a propósito: no revela si la cuenta existe ni si está pendiente. */
const NEUTRAL_NOTICE = "Si la cuenta está pendiente, vas a recibir un nuevo enlace. Revisá también spam.";

function ConfirmationForm() {
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
        await getAuthAdapter().resendCustomerConfirmation(email, authCallbackUrl("emailConfirmed", window.location.origin));
        setSent(true);
      } catch (caught) {
        setError(friendlyAuthError(caught, NEUTRAL_NOTICE));
        setSent(true);
      } finally { setLoading(false); }
    });
  }

  const disabled = loading || cooldown.active;
  const label = loading ? "Enviando…" : cooldown.active ? `Esperá ${cooldown.remaining}s` : "Reenviar confirmación";

  return <main className="simple-auth-page"><section className="auth-card">
    <span className="eyebrow orange">CONFIRMAR CUENTA</span><h1>Reenviar email de confirmación</h1>
    <p>Ingresá el email con el que te registraste.</p>
    {sent && <div className="success-message">{NEUTRAL_NOTICE}</div>}
    <form onSubmit={submit}>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {error && <div className="error-message">{error}</div>}
      <button className="button primary large full" disabled={disabled}>{label}</button>
      {cooldown.active && <p className="form-helper">Podés pedir otro email en {cooldown.remaining} segundos.</p>}
    </form>
    <p><Link href="/login">Volver a ingresar</Link></p>
  </section></main>;
}

export default function ConfirmationPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><ConfirmationForm /></Suspense>;
}
