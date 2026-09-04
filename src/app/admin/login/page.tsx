"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useCaptcha } from "@/components/use-captcha";
import { PasswordInput } from "@/components/password-input";
import { isValidAdminSession } from "@/lib/auth";
import { getAuthAdapter } from "@/services/auth";
import { useStore } from "@/store/store";

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { adminSession, ready, setAdminSession } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const denied = params.get("denied") === "1";
  // "Enable CAPTCHA protection" es un ajuste del PROYECTO Supabase, no de
  // cada formulario: al activarlo, signInWithPassword exige el token
  // también acá. Sin él, el panel quedaría sin poder ingresar.
  const captcha = useCaptcha();

  useEffect(() => {
    if (ready && isValidAdminSession(adminSession)) {
      router.replace(params.get("next") || "/admin");
    }
  }, [adminSession, params, ready, router]);

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

  if (!ready || isValidAdminSession(adminSession)) {
    return <main className="center-state"><div className="spinner" /><p>Abriendo el panel…</p></main>;
  }

  return (
    <main className="auth-page admin-auth-page">
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
            <PasswordInput
              id="admin-password"
              label="Contraseña"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 4 caracteres"
            />
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
