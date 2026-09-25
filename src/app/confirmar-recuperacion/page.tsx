"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";
import { AuthLayout } from "@/components/auth-layout";
import {
  recoveryConfirmationUrlFromHash,
  safeRecoveryConfirmationUrl,
} from "@/lib/recovery-confirmation";

function RecoveryConfirmation() {
  const params = useSearchParams();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  // Los correos nuevos usan el fragmento para no truncar ni filtrar el
  // token. El parámetro queda como compatibilidad para enlaces anteriores
  // que hayan llegado correctamente codificados.
  const confirmationUrl = mounted
    ? recoveryConfirmationUrlFromHash(window.location.hash) ||
      safeRecoveryConfirmationUrl(params.get("confirmation_url"))
    : null;

  return (
    <AuthLayout>
      <h1>Confirmá que fuiste vos</h1>
      {!mounted ? (
        <div className="spinner" aria-label="Validando enlace" />
      ) : confirmationUrl ? (
        <>
          <p className="auth-intro">
            Para proteger tu cuenta, el enlace se activa recién cuando tocás el botón. Después vas a poder elegir
            una contraseña nueva.
          </p>
          <a className="button primary large full auth-action" href={confirmationUrl}>
            Continuar y elegir contraseña
          </a>
        </>
      ) : (
        <>
          <div className="error-message" role="alert">
            Este enlace no es válido. Pedí uno nuevo para continuar.
          </div>
          <Link className="button primary large full auth-action" href="/recuperar-clave">
            Pedir un enlace nuevo
          </Link>
        </>
      )}
      <div className="auth-alt">
        <p><Link href="/login">Volver a ingresar</Link></p>
      </div>
    </AuthLayout>
  );
}

export default function RecoveryConfirmationPage() {
  return (
    <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}>
      <RecoveryConfirmation />
    </Suspense>
  );
}
