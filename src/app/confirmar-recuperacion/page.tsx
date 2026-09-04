"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { safeRecoveryConfirmationUrl } from "@/lib/recovery-confirmation";

function RecoveryConfirmation() {
  const params = useSearchParams();
  const confirmationUrl = safeRecoveryConfirmationUrl(params.get("confirmation_url"));

  return (
    <main className="simple-auth-page">
      <section className="auth-card">
        <span className="eyebrow orange">RECUPERAR ACCESO</span>
        <h1>Confirmá que fuiste vos</h1>
        {confirmationUrl ? (
          <>
            <p>
              Para proteger tu cuenta, el enlace se activa recién cuando tocás el botón. Después vas a poder elegir
              una contraseña nueva.
            </p>
            <a className="button primary large full" href={confirmationUrl}>
              Continuar y elegir contraseña
            </a>
          </>
        ) : (
          <>
            <div className="error-message" role="alert">
              Este enlace no es válido. Pedí uno nuevo para continuar.
            </div>
            <Link className="button primary large full" href="/recuperar-clave">
              Pedir un enlace nuevo
            </Link>
          </>
        )}
        <p>
          <Link href="/login">Volver a ingresar</Link>
        </p>
      </section>
    </main>
  );
}

export default function RecoveryConfirmationPage() {
  return (
    <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}>
      <RecoveryConfirmation />
    </Suspense>
  );
}
