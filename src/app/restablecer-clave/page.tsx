"use client";

import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { PasswordInput } from "@/components/password-input";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import {
  getServerRecoverySnapshot,
  hasPasswordRecoveryIntent,
  RECOVERY_REQUIRED_ERROR,
  refreshPasswordRecoveryIntent,
  subscribePasswordRecovery,
} from "@/lib/password-recovery";
import { getAuthAdapter } from "@/services/auth";
import { useStore } from "@/store/store";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { signOutCustomer } = useStore();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // El fragmento del enlace se lee al importar el módulo, así que en el
  // caso normal esto ya es true en el primer render. Si el SDK ganó la
  // carrera por el hash, el evento PASSWORD_RECOVERY llega después y
  // useSyncExternalStore vuelve a renderizar sin setState en un efecto.
  const fromRecovery = useSyncExternalStore(
    subscribePasswordRecovery,
    hasPasswordRecoveryIntent,
    getServerRecoverySnapshot,
  );

  useEffect(() => {
    // Reevaluar el fragmento por si se llegó acá sin recargar el bundle.
    refreshPasswordRecoveryIntent();
    // Crear el cliente deja al adaptador suscripto al evento de Supabase.
    getAuthAdapter();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    // Una sesión común abierta no habilita el cambio: hace falta haber
    // llegado por el enlace de recuperación.
    if (!hasPasswordRecoveryIntent()) { setError(RECOVERY_REQUIRED_ERROR); return; }
    if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    try {
      const adapter = getAuthAdapter();
      await adapter.updateCustomerPassword(password);
      await signOutCustomer();
      router.replace("/login?password=changed");
    } catch (caught) {
      // Token vencido, ya usado o manipulado: Supabase rechaza el update y
      // todos esos casos llegan acá con el mismo mensaje accionable.
      setError(friendlyAuthError(caught, "El enlace venció o ya fue usado. Pedí uno nuevo."));
    } finally { setLoading(false); }
  }

  if (!fromRecovery) {
    return <AuthLayout>
      <h1>Necesitás el enlace del email</h1>
      <div className="error-message">{RECOVERY_REQUIRED_ERROR}</div>
      <Link className="button primary large full auth-action" href="/recuperar-clave">Pedir un enlace</Link>
      <div className="auth-alt"><p><Link href="/login">Volver a ingresar</Link></p></div>
    </AuthLayout>;
  }

  return <AuthLayout>
    <h1>Elegí una nueva clave</h1>
    <p className="auth-intro">Debe tener al menos 6 caracteres.</p>
    <form onSubmit={submit}>
      <PasswordInput id="reset-password" label="Nueva contraseña" required autoComplete="new-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
      <PasswordInput id="reset-password-confirmation" label="Repetir contraseña" required autoComplete="new-password" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {error && <div className="error-message" role="alert">{error}</div>}
      <button className="button primary large full" disabled={loading}>{loading ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
    <div className="auth-alt"><p>¿Venció el enlace? <Link href="/recuperar-clave">Pedir otro enlace</Link></p></div>
  </AuthLayout>;
}
