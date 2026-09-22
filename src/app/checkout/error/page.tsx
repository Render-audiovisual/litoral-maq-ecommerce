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
      <span className="state-icon">!</span>
      <span className="eyebrow orange">PAGO NO COMPLETADO</span>
      <h1>Tu pedido sigue guardado</h1>
      <p>No recibimos una confirmación de pago para <strong>{orderId}</strong>. No se generó ningún envío.</p>
      <p><strong>El pedido queda reservado durante 24 horas desde su creación.</strong> Después de ese plazo se cancelará automáticamente.</p>
      {error && <div className="error-message">{error}</div>}
      <div className="success-actions">
        <button type="button" className="button primary" onClick={() => void retry()} disabled={loading || !orderId}>{loading ? "Abriendo…" : "Reintentar con Mercado Pago"}</button>
        <Link href="/cuenta/pedidos" className="button secondary">Ver mi pedido</Link>
      </div>
      <div className="whatsapp-confirmation">
        <p>¿Preferís que te asesoremos?</p>
        <a href={getOrderWhatsAppUrl(undefined, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">Continuar por WhatsApp</a>
      </div>
    </main>
  );
}

export default function PaymentErrorPage() {
  return <Suspense><ErrorContent /></Suspense>;
}
