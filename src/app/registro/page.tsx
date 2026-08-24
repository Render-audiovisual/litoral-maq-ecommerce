"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { EmailConfirmationRequiredError, getAuthAdapter } from "@/services/auth";
import { useStore } from "@/store/store";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setCustomerSession, addCustomer, convertGuestToAccount } = useStore();
  const [form, setForm] = useState({ name: "", email: params.get("email") || "", password: "" });
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const session = await getAuthAdapter().signUpCustomer(
        form.name,
        form.email,
        form.password,
        `${window.location.origin}/login?confirmed=1`,
      );
      convertGuestToAccount(form.email, session.user.id);
      await setCustomerSession(session);
      addCustomer(session.user);
      router.push("/cuenta/pedidos");
    } catch (caught) {
      if (caught instanceof EmailConfirmationRequiredError) {
        setConfirmationEmail(caught.email);
      } else {
        setError(caught instanceof Error ? caught.message : "No se pudo crear la cuenta.");
      }
    } finally { setLoading(false); }
  }
  return (
    <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">NUEVA CUENTA</span><h1>Registrate en Litoral Maq</h1><p>Accedé al historial y seguimiento de tus pedidos.</p>
      {confirmationEmail ? (
        <div>
          <div className="success-message">Cuenta creada. Te enviamos un enlace a <strong>{confirmationEmail}</strong>. Abrilo para confirmar tu email.</div>
          <Link className="button primary large full" href={`/confirmar-cuenta?email=${encodeURIComponent(confirmationEmail)}`}>Reenviar email</Link>
        </div>
      ) : <form onSubmit={submit}>
        <label>Nombre y apellido<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Contraseña<input required type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        {error && <div className="error-message">{error}</div>}
        <button className="button primary large full" disabled={loading}>{loading ? "Creando…" : "Crear cuenta"}</button>
      </form>}
      <p>¿Ya tenés cuenta? <Link href="/login">Ingresá acá</Link></p>
    </section></main>
  );
}

export default function RegisterPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><RegisterForm /></Suspense>;
}
