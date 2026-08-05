"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { guestIdFromEmail, normalizeEmail } from "@/lib/auth";
import { mockPaymentAdapter, mockShippingAdapter } from "@/services/mock";
import { getAuthAdapter, supportsGuestSessions } from "@/services/auth";
import type { Order, Session } from "@/lib/types";

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, cartSubtotal, customerSession, clearCart, createOrder, addCustomer, setCustomerSession } = useStore();
  const [method, setMethod] = useState<"envio" | "retiro">("envio");
  const [shipping, setShipping] = useState<number | null>(null);
  const [eta, setEta] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: customerSession?.user.name || "",
    email: customerSession?.user.email || "",
    phone: "",
    postalCode: "",
    address: "",
  });

  async function quote() {
    setError("");
    try {
      const result = await mockShippingAdapter.quote({
        postalCode: form.postalCode,
        subtotal: cartSubtotal,
        method,
      });
      setShipping(result.amount); setEta(result.eta);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cotizar.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.includes("@") || form.phone.trim().length < 6) {
      setError("Completá nombre, email y teléfono.");
      return;
    }
    if (method === "envio" && (!/^\d{4}$/.test(form.postalCode) || !form.address.trim())) {
      setError("Completá código postal y domicilio de entrega.");
      return;
    }
    if (shipping === null) {
      setError("Calculá el envío o confirmá el retiro antes de pagar.");
      return;
    }
    setLoading(true);
    const normalizedEmail = normalizeEmail(form.email);

    // Sin sesión: con el adaptador Supabase, un invitado necesita una
    // identidad anónima real (signInAnonymously) para que el pedido quede
    // scoped por auth.uid() bajo RLS — nunca un id de texto que cualquiera
    // podría inventar. Con el adaptador local, sigue el id determinístico
    // por email de siempre (no hay Auth real detrás).
    let customerId: string;
    let guestSession: Session | null = null;
    if (customerSession) {
      customerId = customerSession.user.id;
    } else {
      const authAdapter = getAuthAdapter();
      if (supportsGuestSessions(authAdapter)) {
        try {
          guestSession = await authAdapter.ensureGuestSession();
          customerId = guestSession.user.id;
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "No se pudo iniciar la compra como invitado.");
          setLoading(false);
          return;
        }
      } else {
        customerId = guestIdFromEmail(normalizedEmail);
      }
    }

    const id = `LM-${Date.now().toString().slice(-8)}`;
    const order: Order = {
      id,
      customerId,
      customerName: form.name.trim(),
      email: normalizedEmail,
      lines: cart,
      total: cartSubtotal + shipping,
      shipping,
      deliveryMethod: method,
      address: method === "envio" ? form.address : undefined,
      status: "pago_simulado",
      createdAt: new Date().toISOString(),
      paymentReference: `MP-DEMO-${id}`,
    };
    await mockPaymentAdapter.createPreference(order);
    createOrder(order);
    addCustomer({
      id: customerId,
      name: order.customerName,
      email: normalizedEmail,
      phone: form.phone,
      role: "customer",
    });
    if (guestSession) setCustomerSession(guestSession);
    clearCart();
    router.push(`/checkout/exito?pedido=${order.id}&email=${encodeURIComponent(normalizedEmail)}`);
  }

  if (!cart.length) {
    return <main className="center-state"><span className="state-icon">🛒</span><h1>No hay productos para comprar</h1><Link href="/productos" className="button primary">Ir al catálogo</Link></main>;
  }

  return (
    <main className="standard-page checkout-page">
      <div className="page-heading"><span className="eyebrow orange">COMPRA SEGURA</span><h1>Finalizar compra</h1></div>
      <form className="checkout-layout" onSubmit={submit}>
        <div className="checkout-steps">
          <section className="form-card">
            <div className="step-number">1</div><h2>Datos de contacto</h2>
            <div className="form-grid">
              <label>Nombre y apellido<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label>Teléfono<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            </div>
          </section>
          <section className="form-card">
            <div className="step-number">2</div><h2>Entrega</h2>
            <div className="delivery-options">
              <label className={method === "envio" ? "selected" : ""}><input type="radio" checked={method === "envio"} onChange={() => { setMethod("envio"); setShipping(null); }} />🚚 Envío a domicilio</label>
              <label className={method === "retiro" ? "selected" : ""}><input type="radio" checked={method === "retiro"} onChange={() => { setMethod("retiro"); setShipping(null); }} />📍 Retiro en sucursal</label>
            </div>
            {method === "envio" && <div className="form-grid"><label>Código postal<input value={form.postalCode} maxLength={4} onChange={(event) => setForm({ ...form, postalCode: event.target.value.replace(/\D/g, "") })} /></label><label className="wide">Domicilio<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label></div>}
            <button type="button" className="button secondary" onClick={quote}>{method === "envio" ? "Calcular envío" : "Confirmar retiro"}</button>
            {shipping !== null && <div className="success-message">✓ {method === "retiro" ? "Retiro sin costo" : `Envío: ${formatCurrency(shipping)}`} · {eta}</div>}
          </section>
          <section className="form-card">
            <div className="step-number">3</div><h2>Pago</h2>
            <div className="payment-option selected"><span>💳</span><div><strong>Mercado Pago</strong><small>Tarjetas, dinero en cuenta y cuotas</small></div><b>DEMO</b></div>
            <p className="helper">En el MVP el pago se aprueba de forma simulada. La preferencia real se conectará mediante el adaptador de Mercado Pago.</p>
          </section>
          {error && <div className="error-message">{error}</div>}
        </div>
        <aside className="order-summary sticky">
          <h2>Tu pedido</h2>
          <div><span>Productos</span><strong>{cart.reduce((sum, line) => sum + line.quantity, 0)}</strong></div>
          <div><span>Subtotal</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
          <div><span>Entrega</span><strong>{shipping === null ? "Pendiente" : formatCurrency(shipping)}</strong></div><hr />
          <div className="summary-total"><span>Total</span><strong>{formatCurrency(cartSubtotal + (shipping || 0))}</strong></div>
          <button className="button primary large full" disabled={loading}>{loading ? "Procesando…" : "Pagar con Mercado Pago"}</button>
          <small>Compra simulada para validación funcional.</small>
        </aside>
      </form>
    </main>
  );
}
