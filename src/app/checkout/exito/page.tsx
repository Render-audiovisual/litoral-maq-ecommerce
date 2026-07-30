"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  return (
    <main className="center-state success-page">
      <span className="success-check">✓</span>
      <span className="eyebrow orange">PAGO SIMULADO APROBADO</span>
      <h1>¡Gracias por tu compra!</h1>
      <p>Tu pedido <strong>{params.get("pedido")}</strong> quedó registrado correctamente.</p>
      <div className="success-actions"><Link href="/cuenta/pedidos" className="button primary">Ver mi pedido</Link><Link href="/productos" className="button secondary">Seguir comprando</Link></div>
    </main>
  );
}

export default function SuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
