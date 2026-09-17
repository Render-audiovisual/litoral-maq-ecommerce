"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { GoogleSignInButton } from "@/components/google-button";
import { useStore } from "@/store/store";
import { isAnonymousSession, isPermanentCustomerSession } from "@/lib/auth";
import { isShippingToCoordinate } from "@/lib/order-details";
import { getOrderWhatsAppUrl } from "@/lib/whatsapp";
import { isMercadoPagoEnabled } from "@/services/payments";

function SuccessContent() {
  const params = useSearchParams();
  const { customerSession, orders, clearCart } = useStore();
  const email = params.get("email") || "";
  const orderId = params.get("pedido") || "";
  const order = orders.find((item) => item.id === orderId);
  const hasAccount = isPermanentCustomerSession(customerSession);
  const isGuest = isAnonymousSession(customerSession);
  const paymentEnabled = isMercadoPagoEnabled();
  const approved = order?.paymentStatus === "approved";

  useEffect(() => {
    if (approved) clearCart();
  }, [approved, clearCart]);

  return (
    <main className="center-state success-page">
      <span className="success-check">✓</span>
      <span className="eyebrow orange">{paymentEnabled ? approved ? "PAGO CONFIRMADO" : "CONFIRMANDO PAGO" : "SOLICITUD RECIBIDA"}</span>
      <h1>{paymentEnabled ? approved ? "Tu compra está confirmada" : "Estamos verificando tu pago" : "Recibimos tu pedido"}</h1>
      <p>Tu pedido <strong>{orderId}</strong> quedó registrado.</p>
      <p>{paymentEnabled ? approved ? (order?.deliveryMethod === "retiro" ? "Mercado Pago confirmó el pago. Preparamos tu pedido y te avisamos cuando puedas retirarlo en el local de Sáenz 1587." : order && isShippingToCoordinate(order) ? `Mercado Pago confirmó el pago de los productos. Mandanos el mensaje por WhatsApp y te pasamos el costo del envío${order.shippingCarrier ? ` por ${order.shippingCarrier}` : ""}.` : "Mercado Pago confirmó el pago. Preparamos tu pedido y te enviamos el seguimiento cuando se despache.") : "Mercado Pago nos está informando el pago. En unos instantes se actualiza el pedido y te llega el correo de confirmación." : "Todavía no se realizó ningún cobro. Vamos a confirmar disponibilidad, entrega y total final antes de coordinar el pago."}</p>
      <div className="whatsapp-confirmation"><p>{approved && order && isShippingToCoordinate(order) ? "Pedí el costo de tu envío" : "¿Tenés alguna consulta?"}</p><a href={getOrderWhatsAppUrl(order, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">{approved ? "Escribirnos por WhatsApp" : "Avisar por WhatsApp"}</a><small>Se abre un mensaje ya armado con tu pedido, el pago y la entrega.</small></div>
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
