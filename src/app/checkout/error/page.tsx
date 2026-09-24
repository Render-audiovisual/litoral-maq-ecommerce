"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createPaymentPreference } from "@/services/payments";
import { getOrderWhatsAppUrl } from "@/lib/whatsapp";

function ErrorContent() {
  const orderId = useSearchParams().get("pedido") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function retry() {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const preference = await createPaymentPreference(orderId);
      window.location.assign(preference.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo reintentar el pago.");
      setLoading(false);
    }
  }

  return (
    <main className="center-state success-page">
      <div className="result-panel">
        <span className="result-status error">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5h.01" />
          </svg>
          Pago no completado
        </span>
        <h1>Tu pedido sigue guardado</h1>
        <p>No recibimos una confirmación de pago para este pedido. No se generó ningún envío.</p>
        <p><strong>El pedido queda reservado durante 24 horas desde su creación.</strong> Después de ese plazo se cancelará automáticamente.</p>
        {orderId && (
          <p className="result-order">
            <span>Número de pedido</span>
            <strong>{orderId}</strong>
          </p>
        )}
        {error && <div className="error-message" role="alert">{error}</div>}
        <div className="success-actions">
          <button type="button" className="button primary" onClick={() => void retry()} disabled={loading || !orderId}>{loading ? "Abriendo…" : "Reintentar con Mercado Pago"}</button>
          <Link href="/cuenta/pedidos" className="button secondary">Ver mi pedido</Link>
        </div>
        <div className="whatsapp-confirmation">
          <div>
            <p>¿Preferís que te asesoremos?</p>
            <small>Se abre un mensaje ya armado con el número de tu pedido.</small>
          </div>
          <a href={getOrderWhatsAppUrl(undefined, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">Continuar por WhatsApp</a>
        </div>
      </div>
    </main>
  );
}

export default function PaymentErrorPage() {
  return <Suspense><ErrorContent /></Suspense>;
}
