"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { GoogleSignInButton } from "@/components/google-button";
import { useCaptcha } from "@/components/use-captcha";
import { getAuthAdapter } from "@/services/auth";
import { useStore } from "@/store/store";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setCustomerSession, convertGuestToAccount } = useStore();
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const captcha = useCaptcha();
  const confirmed = params.get("confirmed") === "1";
  const passwordChanged = params.get("password") === "changed";

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const session = await getAuthAdapter().signInCustomer(email, password, captcha.token);
      convertGuestToAccount(email, session.user.id);
      await setCustomerSession(session);
      router.push(params.get("next") || "/cuenta/pedidos");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo ingresar.");
      // El token de Turnstile es de un solo uso: sin esto, el segundo
      // intento fallaría por captcha aunque la clave fuera correcta.
      captcha.reset();
    } finally { setLoading(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel visual">
        <Image src="/brand/AZUL.png" alt="Litoral Maq" width={210} height={78} />
        <h1>Todo tu taller,<br />en un solo lugar.</h1>
        <p>Guardá pedidos, seguí tus compras y comprá más rápido.</p>
      </section>
      <section className="auth-panel form">
        <div className="auth-card">
          <span className="eyebrow orange">BIENVENIDO</span><h2>Ingresá a tu cuenta</h2>
          {confirmed && <div className="success-message">Email confirmado. Ya podés ingresar.</div>}
          {passwordChanged && <div className="success-message">Contraseña actualizada. Ingresá con la nueva clave.</div>}
          <GoogleSignInButton />
          <p className="auth-divider"><span>o con tu email</span></p>
          <form onSubmit={signIn}>
            <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" /></label>
            <label>Contraseña<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" /></label>
            <p className="form-helper"><Link href={`/recuperar-clave${email ? `?email=${encodeURIComponent(email)}` : ""}`}>¿Olvidaste tu contraseña?</Link></p>
            {captcha.field}
            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="button primary large full" disabled={loading || !captcha.solved}>{loading ? "Ingresando…" : "Ingresar"}</button>
          </form>
          <p>¿No tenés cuenta? <Link href="/registro">Creala gratis</Link><br /><Link href={`/confirmar-cuenta${email ? `?email=${encodeURIComponent(email)}` : ""}`}>Reenviar confirmación</Link></p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><LoginForm /></Suspense>;
}
