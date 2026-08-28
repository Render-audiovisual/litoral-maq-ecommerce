"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useCaptcha } from "@/components/use-captcha";
import { getAuthAdapter } from "@/services/auth";
import { useStore } from "@/store/store";

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAdminSession } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const denied = params.get("denied") === "1";
  // "Enable CAPTCHA protection" es un ajuste del PROYECTO Supabase, no de
  // cada formulario: al activarlo, signInWithPassword exige el token
  // también acá. Sin él, el panel quedaría sin poder ingresar.
  const captcha = useCaptcha();

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await getAuthAdapter().signInAdmin(email, password, captcha.token);
      await setAdminSession(session);
      router.push(params.get("next") || "/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo ingresar.");
      captcha.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel visual">
        <Image src="/brand/AZUL.png" alt="Litoral Maq" width={210} height={78} />
        <h1>Panel de<br />administración.</h1>
        <p>Acceso exclusivo para el equipo de Litoral Maq.</p>
      </section>
      <section className="auth-panel form">
        <div className="auth-card">
          <span className="eyebrow orange">ADMINISTRACIÓN</span>
          <h2>Ingresá al panel</h2>
          {denied && (
            <div className="error-message">
              Tu cuenta no tiene permisos de administrador para acceder a esta sección.
            </div>
          )}
          <form onSubmit={signIn}>
            <label>
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@litoralmaq.com"
              />
            </label>
            <label>
              Contraseña
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 4 caracteres"
              />
            </label>
            {captcha.field}
            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="button primary large full" disabled={loading || !captcha.solved}>
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}>
      <AdminLoginForm />
    </Suspense>
  );
}
