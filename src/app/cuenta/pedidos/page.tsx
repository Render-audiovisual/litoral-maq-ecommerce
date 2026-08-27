"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isSessionExpired, isValidCustomerSession } from "@/lib/auth";
import { selectOwnOrders } from "@/lib/orders";
import { isActiveOrder, ORDER_STATUS_LABELS, ORDER_STATUS_MESSAGES, resolveOrderLines } from "@/lib/order-details";

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { customerSession, orders, products, ready, signOutCustomer } = useStore();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (isValidCustomerSession(customerSession)) loggingOutRef.current = false;
  }, [customerSession]);

  useEffect(() => {
    if (!ready || loggingOutRef.current) return;
    if (customerSession && isSessionExpired(customerSession)) void signOutCustomer();
    if (!isValidCustomerSession(customerSession)) {
      router.replace("/login?next=/cuenta/pedidos");
    }
  }, [ready, customerSession, router, signOutCustomer]);

  async function logout() {
    loggingOutRef.current = true;
    try {
      await signOutCustomer();
      router.replace("/");
    } catch {
      loggingOutRef.current = false;
    }
  }

  if (!ready || !isValidCustomerSession(customerSession)) {
    return <main className="center-state"><div className="spinner" /><p>Ingresando a tu cuenta…</p></main>;
  }
  const ownOrders = selectOwnOrders(orders, customerSession);
  const activeOrders = ownOrders.filter(isActiveOrder);
  return (
    <main className="standard-page account-page">
      <div className="account-header"><div><span className="eyebrow orange">MI CUENTA</span><h1>Hola, {customerSession.user.name}</h1><p>Consultá tus compras y su estado.</p></div><button type="button" className="button secondary" onClick={logout}>Cerrar sesión</button></div>
      <div className="account-layout">
        <aside className="account-nav"><strong>Mi cuenta</strong><span className="active">Mis pedidos</span></aside>
        <section>
          <div className="section-heading small"><h2>Mis pedidos</h2><Link href="/productos" className="button primary">Nueva compra</Link></div>
          {activeOrders.length > 0 && <div className="account-order-notice"><strong>{activeOrders.length} {activeOrders.length === 1 ? "pedido activo" : "pedidos activos"}</strong><span>Acá vas a ver cada cambio de estado confirmado por Litoral Maq.</span></div>}
          {!ownOrders.length ? <div className="empty-state"><span>▤</span><h2>Todavía no tenés pedidos</h2><p>Cuando confirmes un pedido desde la tienda va a aparecer acá.</p><Link href="/productos" className="button primary">Explorar productos</Link></div> : (
            <div className="order-list">{ownOrders.map((order) => <article className="order-card" key={order.id}><div><span>Pedido</span><strong>{order.id}</strong><small>{formatDate(order.createdAt)}</small></div><div><span>{order.shippingStatus === "manual_quote" ? "Total parcial" : "Total"}</span><strong>{formatCurrency(order.total)}</strong><small>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} unidades</small></div><div><span>Entrega</span><strong>{order.deliveryMethod === "envio" ? order.shippingCarrier || "A cotizar" : "Retiro"}</strong><small>{order.address || "Sáenz 1587"}</small></div><div><span className={`status status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span><small>{order.paymentReference}</small></div><p className="order-status-message">{order.shippingStatus === "manual_quote" ? "El envío requiere cotización manual. Te confirmaremos costo y plazo antes del pago." : ORDER_STATUS_MESSAGES[order.status]}{order.shippingTrackingNumber ? ` Seguimiento: ${order.shippingTrackingNumber}.` : ""}</p><details className="customer-order-lines"><summary>Ver productos</summary>{resolveOrderLines(order, products).map((line) => <div key={`${line.productId}-${line.productCode}`}><span>{line.quantity} × {line.productName}</span><strong>{formatCurrency(line.lineTotal)}</strong></div>)}</details></article>)}</div>
          )}
        </section>
      </div>
    </main>
  );
}
