"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getOrderWhatsAppUrl } from "@/lib/whatsapp";

function PendingContent() {
  const orderId = useSearchParams().get("pedido") || "";
  return (
    <main className="center-state success-page">
      <div className="result-panel">
        <span className="result-status pending">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          Pago pendiente
        </span>
        <h1>Mercado Pago está procesando la operación</h1>
        <p>El pedido sigue reservado como pendiente. No hace falta volver a crearlo. Cuando Mercado Pago informe el resultado, el estado se actualizará automáticamente.</p>
        <p><strong>La reserva dura 24 horas desde que generaste el pedido.</strong> Si el pago no se acredita dentro de ese plazo, el pedido se cancelará automáticamente.</p>
        {orderId && (
          <p className="result-order">
            <span>Número de pedido</span>
            <strong>{orderId}</strong>
          </p>
        )}
        <div className="whatsapp-confirmation">
          <div>
            <p>¿Necesitás ayuda para completar la compra?</p>
            <small>Se abre un mensaje ya armado con el número de tu pedido.</small>
          </div>
          <a href={getOrderWhatsAppUrl(undefined, orderId)} className="button whatsapp-button" target="_blank" rel="noopener noreferrer">Continuar por WhatsApp</a>
        </div>
        <div className="success-actions">
          <Link href="/cuenta/pedidos" className="button primary">Ver mis pedidos</Link>
          <Link href="/productos" className="button secondary">Volver a la tienda</Link>
        </div>
      </div>
    </main>
  );
}

export default function PendingPage() {
  return <Suspense><PendingContent /></Suspense>;
}
