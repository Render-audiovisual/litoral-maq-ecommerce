"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { GoogleSignInButton } from "@/components/google-button";
import { useStore } from "@/store/store";
import { isAnonymousSession, isPermanentCustomerSession } from "@/lib/auth";
import { getOrderWhatsAppUrl } from "@/lib/whatsapp";

function SuccessContent() {
  const params = useSearchParams();
  const { customerSession, orders } = useStore();
  const email = params.get("email") || "";
  const orderId = params.get("pedido") || "";
  const order = orders.find((item) => item.id === orderId);
  // Ojo: un invitado con identidad anónima TIENE sesión válida, pero no
  // tiene cuenta. La oferta de crear una es justamente para él.
  const hasAccount = isPermanentCustomerSession(customerSession);
  const isGuest = isAnonymousSession(customerSession);

  return (
    <main className="center-state success-page">
      <span className="success-check">✓</span>
      <span className="eyebrow orange">SOLICITUD RECIBIDA</span>
      <h1>Recibimos tu pedido</h1>
      <p>La solicitud <strong>{orderId}</strong> quedó registrada correctamente.</p>
      <p>Todavía no se realizó ningún cobro. Vamos a confirmar disponibilidad, entrega y total final antes de coordinar el pago.</p>
      <div className="whatsapp-confirmation"><p>¿Querés acelerar la confirmación?</p><a href={getOrderWhatsAppUrl(order, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">Avisar por WhatsApp</a><small>Se abrirá un mensaje con el número de solicitud y sus productos.</small></div>
      {hasAccount ? (
        <div className="success-actions">
          <Link href="/cuenta/pedidos" className="button primary">Ver mis pedidos</Link>
          <Link href="/productos" className="button secondary">Seguir comprando</Link>
        </div>
      ) : (
        <section className="account-upsell">
          <h2>Creá tu cuenta para guardar y seguir este pedido</h2>
          <p>
            Con una cuenta tenés el historial completo, el seguimiento de cada envío y podés entrar
            desde otro dispositivo. Tu pedido ya está registrado: crear la cuenta no lo modifica.
          </p>
          <GoogleSignInButton />
          <Link
            href={`/registro${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="button primary large full"
          >
            Crear cuenta con email
          </Link>
          {isGuest && (
            <p className="form-helper">
              Mientras tanto podés <Link href="/cuenta/pedidos">ver el estado del pedido en este navegador</Link>.
              Si borrás los datos del sitio o cambiás de dispositivo, vas a necesitar la cuenta.
            </p>
          )}
          <p><Link href="/login" className="text-link">Ya tengo cuenta, quiero ingresar</Link></p>
          <p><Link href="/productos" className="text-link">Seguir comprando</Link></p>
        </section>
      )}
    </main>
  );
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
