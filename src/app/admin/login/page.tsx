"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useCaptcha } from "@/components/use-captcha";
import { PasswordInput } from "@/components/password-input";
import { isValidAdminSession } from "@/lib/auth";
import { ADMIN_IDLE_MESSAGE, markAdminSignedIn } from "@/lib/admin-idle";
import { AUTH_ORIGINS } from "@/lib/auth-callbacks";
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
  const idle = params.get("idle") === "1";
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
      // Antes de publicar la sesión: el panel no debe ver la actividad vieja.
      markAdminSignedIn();
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
    <main className="auth-page customer-auth admin-auth-page">
      <aside className="auth-panel visual" aria-label="Panel de administración de Litoral Maq">
        <span className="auth-logo">
          <Image src="/brand/AZUL.png" alt="Litoral Maq" width={186} height={186} />
        </span>
        <p className="auth-visual-title">Panel de administración</p>
        <p className="auth-visual-lead">Pedidos, catálogo y clientes de la tienda. Acceso exclusivo para el equipo de Litoral Maq.</p>
      </aside>
      <section className="auth-panel form">
        <div className="auth-card">
          <span className="auth-logo auth-card-logo">
            <Image src="/brand/AZUL.png" alt="Litoral Maq" width={186} height={186} />
          </span>
          <h1>Ingresá al panel</h1>
          <p className="auth-intro">Usá el email y la contraseña de tu cuenta de administrador.</p>
          {idle && !denied && (
            <div className="error-message" role="status">
              {ADMIN_IDLE_MESSAGE}
            </div>
          )}
          {denied && (
            <div className="error-message" role="alert">
              Tu cuenta no tiene permisos de administrador para acceder a esta sección.
            </div>
          )}
          <form onSubmit={signIn}>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@litoralmaq.com"
              />
            </label>
            <div className="auth-password">
              <PasswordInput
                id="admin-password"
                label="Contraseña"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tu contraseña"
              />
              <a className="auth-forgot" href={`${AUTH_ORIGINS.production}/recuperar-clave${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
                ¿Olvidaste tu contraseña?
              </a>
            </div>
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
