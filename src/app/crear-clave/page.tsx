"use client";

import Link from "next/link";
import { PasswordInput } from "@/components/password-input";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { readAuthErrorFromUrl } from "@/lib/auth-callbacks";
import type { Session } from "@/lib/types";
import { getAuthAdapter, waitForRestoredSession } from "@/services/auth";
import { useStore } from "@/store/store";

/**
 * Paso 2 de la conversión de invitado a cuenta permanente.
 *
 * A esta pantalla se llega desde el enlace que Supabase manda al vincular
 * el email a una sesión anónima. Recién con ese email ya verificado se
 * puede establecer una contraseña — el orden lo fija Supabase, no la
 * interfaz (ver `linkEmailToGuestAccount`).
 *
 * También sirve para cualquier cuenta que entró con Google y quiere sumar
 * una contraseña: el requisito es el mismo, tener una sesión permanente.
 */
export default function CreatePasswordPage() {
  const router = useRouter();
  const { setCustomerSession } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const failure = readAuthErrorFromUrl(window.location.href);
      if (failure) {
        setLinkError(
          failure.code === "otp_expired"
            ? "El enlace venció o ya fue usado. Pedí uno nuevo desde tu email."
            : failure.description || "No pudimos validar el enlace. Pedí uno nuevo.",
        );
        setChecking(false);
        return;
      }
      const restored = await waitForRestoredSession();
      if (cancelled) return;
      setSession(restored);
      setChecking(false);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    try {
      await getAuthAdapter().updateCustomerPassword(password);
      // La sesión ya no es anónima: se relee para que el header muestre el
      // nombre y "Mis pedidos" en vez de "Ingresar".
      const refreshed = await waitForRestoredSession(2000);
      if (refreshed) await setCustomerSession(refreshed);
      router.replace("/cuenta/pedidos");
    } catch (caught) {
      setError(friendlyAuthError(caught, "No pudimos guardar la contraseña. Probá de nuevo."));
    } finally { setLoading(false); }
  }

  if (checking) {
    return <main className="center-state" aria-live="polite"><div className="spinner" /><p>Confirmando tu email…</p></main>;
  }

  if (linkError || !session) {
    return <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">CREAR CONTRASEÑA</span><h1>Necesitamos confirmar tu email</h1>
      <div className="error-message" role="alert">
        {linkError || "Abrí el enlace que te enviamos por email desde este mismo navegador para terminar de crear tu cuenta."}
      </div>
      <Link className="button primary large full" href="/confirmar-cuenta">Reenviar el email</Link>
      <p><Link href="/login">Volver a ingresar</Link></p>
    </section></main>;
  }

  if (session.user.isAnonymous) {
    return <main className="simple-auth-page"><section className="auth-card">
      <span className="eyebrow orange">CREAR CONTRASEÑA</span><h1>Falta confirmar tu email</h1>
      <div className="error-message" role="alert">
        Tu sesión sigue siendo de invitado. Abrí el enlace del email para confirmar la dirección y volvé acá.
      </div>
      <Link className="button primary large full" href="/confirmar-cuenta">Reenviar el email</Link>
      <p><Link href="/cuenta/pedidos">Ver mis pedidos como invitado</Link></p>
    </section></main>;
  }

  return <main className="simple-auth-page"><section className="auth-card">
    <span className="eyebrow orange">CREAR CONTRASEÑA</span><h1>Elegí tu contraseña</h1>
    <div className="success-message">Confirmamos <strong>{session.user.email}</strong>. Tus pedidos anteriores ya están en esta cuenta.</div>
    <p>Debe tener al menos 6 caracteres.</p>
    <form onSubmit={submit}>
      <PasswordInput id="create-password" label="Contraseña" required autoComplete="new-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
      <PasswordInput id="create-password-confirmation" label="Repetir contraseña" required autoComplete="new-password" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {error && <div className="error-message" role="alert">{error}</div>}
      <button className="button primary large full" disabled={loading}>{loading ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  </section></main>;
}
