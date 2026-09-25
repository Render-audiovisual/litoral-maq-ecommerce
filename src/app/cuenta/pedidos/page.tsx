"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { GoogleSignInButton } from "@/components/google-button";
import { useStore } from "@/store/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isAnonymousSession, isSessionExpired, isValidCustomerSession } from "@/lib/auth";
import { selectOwnOrders } from "@/lib/orders";
import { isActiveOrder, isShippingToCoordinate, orderStatusLabel, orderStatusMessage, resolveOrderLines } from "@/lib/order-details";

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
  // Invitado: ve sus pedidos en ESTE navegador, pero no tiene cuenta. El
  // encabezado y el aviso lo dicen en vez de saludar a un nombre vacío.
  const guest = isAnonymousSession(customerSession);
  return (
    <main className="standard-page account-page">
      <div className="account-header">
        <div>
          <h1>{guest ? "Tus pedidos" : `Hola, ${customerSession.user.name || "cliente"}`}</h1>
          <p>{guest ? "Compraste como invitado. Acá ves tus compras y su estado." : "Consultá tus compras y su estado."}</p>
        </div>
        <button type="button" className="button secondary" onClick={logout}>{guest ? "Salir" : "Cerrar sesión"}</button>
      </div>
      {guest && (
        <section className="account-upsell">
          <h2>Creá tu cuenta para no perder este historial</h2>
          <p>
            Estos pedidos están guardados en este navegador. Con una cuenta los vas a ver desde cualquier
            dispositivo, con el seguimiento de cada envío. Se conservan los pedidos que ya hiciste.
          </p>
          <GoogleSignInButton />
          <Link href="/registro" className="button primary large full">Crear cuenta con email</Link>
        </section>
      )}
      <div className="account-layout">
        <aside className="account-nav"><strong>Mi cuenta</strong><span className="active">Mis pedidos</span></aside>
        <section>
          <div className="section-heading small"><h2>Mis pedidos</h2>{ownOrders.length > 0 && <Link href="/productos" className="button secondary">Nueva compra</Link>}</div>
          {activeOrders.length > 0 && <div className="account-order-notice"><strong>{activeOrders.length} {activeOrders.length === 1 ? "pedido activo" : "pedidos activos"}</strong><span>Acá vas a ver cada cambio de estado confirmado por Litoral Maq.</span></div>}
          {!ownOrders.length ? (
            <div className="cart-empty account-empty">
              <span className="cart-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9" />
                </svg>
              </span>
              <h2>Todavía no tenés pedidos</h2>
              <p>Cuando confirmes una compra en la tienda, la vas a ver acá con su estado y el detalle de los productos.</p>
              <Link href="/productos" className="button primary">Ver productos</Link>
            </div>
          ) : (
            <div className="order-list">
              {ownOrders.map((order) => {
                const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <article className="order-card" key={order.id}>
                    <header className="order-card-head">
                      <div>
                        <h3>Pedido {order.id}</h3>
                        <small>{formatDate(order.createdAt)}{order.paymentReference ? ` · ${order.paymentReference}` : ""}</small>
                      </div>
                      <span className={`status status-${order.status}`}>{orderStatusLabel(order)}</span>
                    </header>
                    <dl className="order-card-facts">
                      <div><dt>{isShippingToCoordinate(order) ? "Total productos" : "Total"}</dt><dd><strong>{formatCurrency(order.total)}</strong><small>{units} {units === 1 ? "unidad" : "unidades"}</small></dd></div>
                      <div><dt>Entrega</dt><dd><strong>{order.deliveryMethod === "envio" ? order.shippingCarrier || "A cotizar" : "Retiro"}</strong><small>{order.address || "Sáenz 1587"}</small></dd></div>
                    </dl>
                    <p className="order-status-message">{isShippingToCoordinate(order) && order.paymentStatus === "approved" ? `Pago acreditado. Envío${order.shippingCarrier ? ` por ${order.shippingCarrier}` : ""}: te pasamos el costo por WhatsApp y lo despachamos.` : isShippingToCoordinate(order) ? `Envío${order.shippingCarrier ? ` por ${order.shippingCarrier}` : ""}: después del pago te pasamos el costo del envío.` : orderStatusMessage(order)}{order.shippingTrackingNumber ? ` Seguimiento: ${order.shippingTrackingNumber}.` : ""}</p>
                    <details className="customer-order-lines">
                      <summary>
                        Ver productos
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
                      </summary>
                      <ul>
                        {resolveOrderLines(order, products).map((line) => <li key={`${line.productId}-${line.productCode}`}><span>{line.quantity} × {line.productName}</span><strong>{formatCurrency(line.lineTotal)}</strong></li>)}
                      </ul>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
