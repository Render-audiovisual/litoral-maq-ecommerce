"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { getAuthAdapter } from "@/services/auth";

function ConfirmationForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      await getAuthAdapter().resendCustomerConfirmation(email, `${window.location.origin}/login?confirmed=1`);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo reenviar el email.");
    } finally { setLoading(false); }
  }

  return <main className="simple-auth-page"><section className="auth-card">
    <span className="eyebrow orange">CONFIRMAR CUENTA</span><h1>Reenviar email de confirmación</h1>
    <p>Ingresá el email con el que te registraste.</p>
    {sent ? <div className="success-message">Si la cuenta está pendiente, vas a recibir un nuevo enlace. Revisá también spam.</div> : <form onSubmit={submit}>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {error && <div className="error-message">{error}</div>}
      <button className="button primary large full" disabled={loading}>{loading ? "Enviando…" : "Reenviar confirmación"}</button>
    </form>}
    <p><Link href="/login">Volver a ingresar</Link></p>
  </section></main>;
}

export default function ConfirmationPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><ConfirmationForm /></Suspense>;
}
