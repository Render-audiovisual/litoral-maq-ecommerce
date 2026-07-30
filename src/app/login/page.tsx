"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { mockAuthAdapter } from "@/services/mock";
import { useStore } from "@/store/store";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const session = await mockAuthAdapter.signIn(email, password);
      setSession(session);
      router.push(params.get("next") || (session.user.role === "admin" ? "/admin" : "/cuenta/pedidos"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo ingresar.");
    } finally { setLoading(false); }
  }

  async function google() {
    setLoading(true);
    const session = await mockAuthAdapter.signInWithGoogle();
    setSession(session); router.push("/cuenta/pedidos");
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
          <button type="button" className="button google full" onClick={google} disabled={loading}>G&nbsp; Continuar con Google <b>DEMO</b></button>
          <div className="divider"><span>o con email</span></div>
          <form onSubmit={signIn}>
            <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" /></label>
            <label>Contraseña<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 4 caracteres" /></label>
            {error && <div className="error-message">{error}</div>}
            <button className="button primary large full" disabled={loading}>{loading ? "Ingresando…" : "Ingresar"}</button>
          </form>
          <p>¿No tenés cuenta? <Link href="/registro">Creala gratis</Link></p>
          <div className="demo-credentials"><strong>Acceso administrador demo</strong><span>admin@litoralmaq.com · clave: admin123</span></div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}><LoginForm /></Suspense>;
}
