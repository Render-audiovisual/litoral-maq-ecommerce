"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useStore } from "@/store/store";
import { isValidCustomerSession } from "@/lib/auth";
import { getOrderWhatsAppUrl } from "@/lib/whatsapp";

function SuccessContent() {
  const params = useSearchParams();
  const { customerSession, orders } = useStore();
  const email = params.get("email") || "";
  const orderId = params.get("pedido") || "";
  const order = orders.find((item) => item.id === orderId);
  const authenticated = isValidCustomerSession(customerSession);

  return (
    <main className="center-state success-page">
      <span className="success-check">✓</span>
      <span className="eyebrow orange">SOLICITUD RECIBIDA</span>
      <h1>Recibimos tu pedido</h1>
      <p>La solicitud <strong>{orderId}</strong> quedó registrada correctamente.</p>
      <p>Todavía no se realizó ningún cobro. Vamos a confirmar disponibilidad, entrega y total final antes de coordinar el pago.</p>
      <div className="whatsapp-confirmation"><p>¿Querés acelerar la confirmación?</p><a href={getOrderWhatsAppUrl(order, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">Avisar por WhatsApp</a><small>Se abrirá un mensaje con el número de solicitud y sus productos.</small></div>
      {authenticated ? (
        <div className="success-actions">
          <Link href="/cuenta/pedidos" className="button primary">Ver mis pedidos</Link>
          <Link href="/productos" className="button secondary">Seguir comprando</Link>
        </div>
      ) : (
        <>
          <p>Enviaste la solicitud como invitado. Ingresá o creá una cuenta para consultar su estado.</p>
          <div className="success-actions">
            <Link
              href={`/login?next=%2Fcuenta%2Fpedidos${email ? `&email=${encodeURIComponent(email)}` : ""}`}
              className="button primary"
            >
              Ingresar
            </Link>
            <Link href={`/registro${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="button secondary">
              Crear cuenta
            </Link>
          </div>
          <p><Link href="/productos" className="text-link">Seguir comprando</Link></p>
        </>
      )}
    </main>
  );
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
