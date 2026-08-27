"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PendingContent() {
  const orderId = useSearchParams().get("pedido") || "";
  return (
    <main className="center-state success-page">
      <span className="state-icon">⏳</span>
      <span className="eyebrow orange">PAGO PENDIENTE</span>
      <h1>Mercado Pago está procesando la operación</h1>
      <p>El pedido <strong>{orderId}</strong> sigue reservado como pendiente. No hace falta volver a crearlo.</p>
      <p>Cuando Mercado Pago informe el resultado, el estado se actualizará automáticamente.</p>
      <div className="success-actions">
        <Link href="/cuenta/pedidos" className="button primary">Ver mis pedidos</Link>
        <Link href="/productos" className="button secondary">Volver a la tienda</Link>
      </div>
    </main>
  );
}

export default function PendingPage() {
  return <Suspense><PendingContent /></Suspense>;
}
