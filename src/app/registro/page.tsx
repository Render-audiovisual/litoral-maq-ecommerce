"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { mockAuthAdapter } from "@/services/mock";
import { useStore } from "@/store/store";

export default function RegisterPage() {
  const router = useRouter();
  const { setSession, addCustomer } = useStore();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const session = await mockAuthAdapter.signUp(form.name, form.email, form.password);
      setSession(session); addCustomer(session.user); router.push("/cuenta/pedidos");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo crear la cuenta.");
    } finally { setLoading(false); }
  }
  return (
    <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">NUEVA CUENTA</span><h1>Registrate en Litoral Maq</h1><p>Accedé al historial y seguimiento de tus pedidos.</p>
      <form onSubmit={submit}>
        <label>Nombre y apellido<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Contraseña<input required type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        {error && <div className="error-message">{error}</div>}
        <button className="button primary large full" disabled={loading}>{loading ? "Creando…" : "Crear cuenta"}</button>
      </form>
      <p>¿Ya tenés cuenta? <Link href="/login">Ingresá acá</Link></p>
    </section></main>
  );
}
