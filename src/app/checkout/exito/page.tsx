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
  const settled = approved || !paymentEnabled;

  useEffect(() => {
    if (approved) clearCart();
  }, [approved, clearCart]);

  return (
    <main className="center-state success-page">
      <div className="result-panel">
        <span className={`result-status ${settled ? "ok" : "pending"}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d={settled ? "m8 12.5 2.8 2.8L16 9.5" : "M12 7.5V12l3 2"} />
          </svg>
          {paymentEnabled ? approved ? "Pago confirmado" : "Confirmando pago" : "Solicitud recibida"}
        </span>
        <h1>{paymentEnabled ? approved ? "Tu compra está confirmada" : "Estamos verificando tu pago" : "Recibimos tu pedido"}</h1>
        <p>{paymentEnabled ? approved ? (order?.deliveryMethod === "retiro" ? "Mercado Pago confirmó el pago. Preparamos tu pedido y te avisamos cuando puedas retirarlo en el local de Sáenz 1587." : order && isShippingToCoordinate(order) ? `Mercado Pago confirmó el pago de los productos. Mandanos el mensaje por WhatsApp y te pasamos el costo del envío${order.shippingCarrier ? ` por ${order.shippingCarrier}` : ""}.` : "Mercado Pago confirmó el pago. Preparamos tu pedido y te enviamos el seguimiento cuando se despache.") : "Mercado Pago nos está informando el pago. En unos instantes se actualiza el pedido y te llega el correo de confirmación." : "Todavía no se realizó ningún cobro. Vamos a confirmar disponibilidad, entrega y total final antes de coordinar el pago."}</p>
        {!approved && paymentEnabled && (
          <p><strong>Tu pedido queda reservado durante 24 horas.</strong> Si el pago no se acredita dentro de ese plazo, se cancelará automáticamente.</p>
        )}
        {orderId && (
          <p className="result-order">
            <span>Número de pedido</span>
            <strong>{orderId}</strong>
          </p>
        )}
        <div className="whatsapp-confirmation">
          <div>
            <p>{approved && order && isShippingToCoordinate(order) ? "Pedí el costo de tu envío" : "¿Necesitás ayuda para completar la compra?"}</p>
            <small>Se abre un mensaje ya armado con tu pedido, el pago y la entrega.</small>
          </div>
          <a href={getOrderWhatsAppUrl(order, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">{approved ? "Escribirnos por WhatsApp" : "Continuar por WhatsApp"}</a>
        </div>
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
            <GoogleSignInButton className="button secondary full" />
            <Link
              href={`/registro${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="button primary full"
            >
              Crear cuenta con email
            </Link>
            <div className="account-upsell-alt">
              <Link href="/login" className="button secondary">Ya tengo cuenta, quiero ingresar</Link>
              <Link href="/productos" className="button ghost">Seguir comprando</Link>
            </div>
            {isGuest && (
              <p className="form-helper">
                Mientras tanto podés <Link href="/cuenta/pedidos">ver el estado del pedido en este navegador</Link>.
                Si borrás los datos del sitio o cambiás de dispositivo, vas a necesitar la cuenta.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
