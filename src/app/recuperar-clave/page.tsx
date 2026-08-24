"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { getAuthAdapter } from "@/services/auth";

function RecoveryForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      await getAuthAdapter().requestPasswordReset(email, `${window.location.origin}/restablecer-clave`);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo enviar el email.");
    } finally { setLoading(false); }
  }

  return <main className="simple-auth-page"><section className="auth-card">
    <span className="eyebrow orange">RECUPERAR ACCESO</span><h1>Restablecé tu contraseña</h1>
    <p>Ingresá tu email y te enviaremos un enlace seguro para crear una nueva clave.</p>
    {sent ? <div className="success-message">Si existe una cuenta con ese email, vas a recibir el enlace en unos minutos. Revisá también spam.</div> : <form onSubmit={submit}>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {error && <div className="error-message">{error}</div>}
      <button className="button primary large full" disabled={loading}>{loading ? "Enviando…" : "Enviar enlace"}</button>
    </form>}
    <p><Link href="/login">Volver a ingresar</Link></p>
  </section></main>;
}

export default function RecoveryPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><RecoveryForm /></Suspense>;
}
