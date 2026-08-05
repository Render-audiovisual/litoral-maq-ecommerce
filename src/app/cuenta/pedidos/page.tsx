"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isSessionExpired, isValidCustomerSession } from "@/lib/auth";
import { selectOwnOrders } from "@/lib/orders";

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { customerSession, orders, ready, setCustomerSession } = useStore();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (isValidCustomerSession(customerSession)) loggingOutRef.current = false;
  }, [customerSession]);

  useEffect(() => {
    if (!ready || loggingOutRef.current) return;
    if (customerSession && isSessionExpired(customerSession)) setCustomerSession(null);
    if (!isValidCustomerSession(customerSession)) {
      router.replace("/login?next=/cuenta/pedidos");
    }
  }, [ready, customerSession, router, setCustomerSession]);

  function logout() {
    loggingOutRef.current = true;
    setCustomerSession(null);
    router.replace("/");
  }

  if (!ready || !isValidCustomerSession(customerSession)) {
    return <main className="center-state"><div className="spinner" /><p>Ingresando a tu cuenta…</p></main>;
  }
  const ownOrders = selectOwnOrders(orders, customerSession);
  return (
    <main className="standard-page account-page">
      <div className="account-header"><div><span className="eyebrow orange">MI CUENTA</span><h1>Hola, {customerSession.user.name}</h1><p>Consultá tus compras y su estado.</p></div><button type="button" className="button secondary" onClick={logout}>Cerrar sesión</button></div>
      <div className="account-layout">
        <aside className="account-nav"><strong>Mi cuenta</strong><span className="active">Mis pedidos</span></aside>
        <section>
          <div className="section-heading small"><h2>Mis pedidos</h2><Link href="/productos" className="button primary">Nueva compra</Link></div>
          {!ownOrders.length ? <div className="empty-state"><span>▤</span><h2>Todavía no tenés pedidos</h2><p>Completá una compra simulada para verla acá.</p><Link href="/productos" className="button primary">Explorar productos</Link></div> : (
            <div className="order-list">{ownOrders.map((order) => <article className="order-card" key={order.id}><div><span>Pedido</span><strong>{order.id}</strong><small>{formatDate(order.createdAt)}</small></div><div><span>Total</span><strong>{formatCurrency(order.total)}</strong><small>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} productos</small></div><div><span>Entrega</span><strong>{order.deliveryMethod === "envio" ? "Envío" : "Retiro"}</strong><small>{order.address || "Sucursal"}</small></div><div><span className={`status status-${order.status}`}>{order.status.replace("_", " ")}</span><small>{order.paymentReference}</small></div></article>)}</div>
          )}
        </section>
      </div>
    </main>
  );
}
