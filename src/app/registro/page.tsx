"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { GoogleSignInButton } from "@/components/google-button";
import { useCaptcha } from "@/components/use-captcha";
import { isAnonymousSession } from "@/lib/auth";
import { authCallbackUrl } from "@/lib/auth-callbacks";
import { EmailConfirmationRequiredError, getAuthAdapter, supportsGuestSessions } from "@/services/auth";
import { useStore } from "@/store/store";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { customerSession, setCustomerSession, addCustomer, convertGuestToAccount } = useStore();
  const [form, setForm] = useState({ name: customerSession?.user.name || "", email: params.get("email") || "", password: "" });
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const captcha = useCaptcha();

  // Invitado con sesión anónima viva: su cuenta se crea CONVIRTIENDO ese
  // mismo uid, no dando de alta uno nuevo — así conserva los pedidos que ya
  // hizo. Y la contraseña no se pide todavía: Supabase exige verificar el
  // email antes de poder fijarla (ver `linkEmailToGuestAccount`).
  const adapter = getAuthAdapter();
  const convertingGuest = isAnonymousSession(customerSession) && supportsGuestSessions(adapter);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      if (convertingGuest && supportsGuestSessions(adapter)) {
        await adapter.linkEmailToGuestAccount(
          form.name,
          form.email,
          authCallbackUrl("passwordSetup", window.location.origin),
        );
        setConfirmationEmail(form.email);
        return;
      }
      const session = await adapter.signUpCustomer(
        form.name,
        form.email,
        form.password,
        authCallbackUrl("emailConfirmed", window.location.origin),
        captcha.token,
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
      captcha.reset();
    } finally { setLoading(false); }
  }

  return (
    <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">NUEVA CUENTA</span><h1>Registrate en Litoral Maq</h1>
      <p>Tu cuenta guarda el historial de pedidos, te deja seguir cada envío y entrar desde cualquier dispositivo.</p>
      {confirmationEmail ? (
        <div>
          <div className="success-message">
            {convertingGuest
              ? <>Te enviamos un enlace a <strong>{confirmationEmail}</strong>. Confirmalo y vas a poder elegir tu contraseña; tus pedidos ya quedan asociados a la cuenta.</>
              : <>Si el email <strong>{confirmationEmail}</strong> está disponible, te enviamos un enlace para confirmarlo. Si ya tenías cuenta, ingresá con tu contraseña.</>}
          </div>
          <Link className="button primary large full" href={`/confirmar-cuenta?email=${encodeURIComponent(confirmationEmail)}`}>Reenviar email</Link>
          <p><Link href="/login">Ya lo confirmé, quiero ingresar</Link></p>
        </div>
      ) : <>
        {convertingGuest && (
          <div className="account-order-notice">
            <strong>Estás comprando como invitado</strong>
            <span>Creá tu cuenta con este mismo email y el pedido que acabás de hacer queda guardado en ella.</span>
          </div>
        )}
        <GoogleSignInButton label="Crear cuenta con Google" />
        <p className="auth-divider"><span>o con tu email</span></p>
        <form onSubmit={submit}>
          <label>Nombre y apellido<input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          {convertingGuest ? (
            <p className="form-helper">Primero confirmás el email. En el paso siguiente elegís tu contraseña.</p>
          ) : (
            <label>Contraseña<input required type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          )}
          {captcha.field}
          {error && <div className="error-message" role="alert">{error}</div>}
          <button className="button primary large full" disabled={loading || !captcha.solved}>{loading ? "Creando…" : convertingGuest ? "Confirmar mi email" : "Crear cuenta"}</button>
        </form>
      </>}
      <p>¿Ya tenés cuenta? <Link href="/login">Ingresá acá</Link></p>
    </section></main>
  );
}

export default function RegisterPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><RegisterForm /></Suspense>;
}
