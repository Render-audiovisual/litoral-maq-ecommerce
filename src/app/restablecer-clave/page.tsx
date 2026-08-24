"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getAuthAdapter } from "@/services/auth";
import { useStore } from "@/store/store";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { signOutCustomer } = useStore();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    try {
      const adapter = getAuthAdapter();
      await adapter.updateCustomerPassword(password);
      await signOutCustomer();
      router.replace("/login?password=changed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "El enlace venció o no es válido. Solicitá uno nuevo.");
    } finally { setLoading(false); }
  }

  return <main className="simple-auth-page"><section className="auth-card">
    <span className="eyebrow orange">NUEVA CONTRASEÑA</span><h1>Elegí una nueva clave</h1>
    <p>Debe tener al menos 6 caracteres.</p>
    <form onSubmit={submit}>
      <label>Nueva contraseña<input required type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Repetir contraseña<input required type="password" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {error && <div className="error-message">{error}</div>}
      <button className="button primary large full" disabled={loading}>{loading ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
    <p><Link href="/recuperar-clave">Pedir otro enlace</Link></p>
  </section></main>;
}
