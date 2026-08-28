"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useCaptcha } from "@/components/use-captcha";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { guestIdFromEmail, normalizeEmail } from "@/lib/auth";
import { getAuthAdapter, supportsGuestSessions } from "@/services/auth";
import type { Order, Session } from "@/lib/types";
import { snapshotOrderLines } from "@/lib/order-details";

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, products, cartSubtotal, customerSession, clearCart, createOrder, addCustomer, setCustomerSession } = useStore();
  const [method, setMethod] = useState<"envio" | "retiro">("envio");
  const [shipping, setShipping] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // La compra como invitado crea un usuario REAL en Supabase Auth
  // (signInAnonymously), así que ese endpoint necesita la misma protección
  // antiabuso que un registro. Con sesión ya iniciada no hace falta: no se
  // crea ninguna identidad nueva.
  const captcha = useCaptcha();
  const needsGuestSession = !customerSession;
  const [form, setForm] = useState({
    name: customerSession?.user.name || "",
    email: customerSession?.user.email || "",
    phone: "",
    postalCode: "",
    locality: "",
    address: "",
  });

  function confirmDelivery() {
    setError("");
    if (method === "envio" && (!/^\d{4}$/.test(form.postalCode) || !form.locality.trim() || !form.address.trim())) {
      setError("Completá código postal, localidad y domicilio para solicitar la cotización.");
      return;
    }
    setShipping(0);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.includes("@") || form.phone.trim().length < 6) {
      setError("Completá nombre, email y teléfono.");
      return;
    }
    if (method === "envio" && (!/^\d{4}$/.test(form.postalCode) || !form.locality.trim() || !form.address.trim())) {
      setError("Completá código postal, localidad y domicilio de entrega.");
      return;
    }
    if (shipping === null) {
      setError("Confirmá la forma de entrega antes de enviar la solicitud.");
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
          guestSession = await authAdapter.ensureGuestSession(captcha.token);
          customerId = guestSession.user.id;
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "No se pudo iniciar la compra como invitado.");
          captcha.reset();
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
      lines: snapshotOrderLines(cart, products),
      total: cartSubtotal,
      shipping,
      deliveryMethod: method,
      address: method === "envio" ? `CP ${form.postalCode} · ${form.locality.trim()} · ${form.address.trim()}` : undefined,
      status: "pendiente",
      createdAt: new Date().toISOString(),
      paymentReference: "Pago a coordinar",
    };
    try {
      await createOrder(order);
      addCustomer({
        id: customerId,
        name: order.customerName,
        email: normalizedEmail,
        phone: form.phone,
        role: "customer",
      });
      if (guestSession) await setCustomerSession(guestSession);
      clearCart();
      router.push(`/checkout/exito?pedido=${order.id}&email=${encodeURIComponent(normalizedEmail)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo registrar el pedido. El carrito sigue intacto.");
      setLoading(false);
    }
  }

  if (!cart.length) {
    return <main className="center-state"><span className="state-icon">🛒</span><h1>No hay productos para comprar</h1><Link href="/productos" className="button primary">Ir al catálogo</Link></main>;
  }

  return (
    <main className="standard-page checkout-page">
      <div className="page-heading"><span className="eyebrow orange">SOLICITUD DE COMPRA</span><h1>Confirmá tu pedido</h1><p>Revisamos disponibilidad y coordinamos con vos antes de cobrar.</p></div>
      <form className="checkout-layout" onSubmit={submit}>
        <div className="checkout-steps">
          <section className="form-card">
            <div className="step-number">1</div><h2>Datos de contacto</h2>
            <div className="form-grid">
              <label>Nombre y apellido<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label>Teléfono<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            </div>
            {needsGuestSession && (
              <>
                <p className="helper">No hace falta crear una cuenta para comprar. Después de enviar la solicitud vas a poder crearla si querés guardar el historial.</p>
                {captcha.field}
              </>
            )}
          </section>
          <section className="form-card">
            <div className="step-number">2</div><h2>Entrega</h2>
            <div className="delivery-options">
              <label className={method === "envio" ? "selected" : ""}><input type="radio" checked={method === "envio"} onChange={() => { setMethod("envio"); setShipping(null); }} />🚚 Envío a cotizar</label>
              <label className={method === "retiro" ? "selected" : ""}><input type="radio" checked={method === "retiro"} onChange={() => { setMethod("retiro"); setShipping(null); }} />📍 Retiro en sucursal</label>
            </div>
            {method === "envio" && <div className="form-grid"><label>Código postal<input value={form.postalCode} maxLength={4} onChange={(event) => { setForm({ ...form, postalCode: event.target.value.replace(/\D/g, "") }); setShipping(null); }} /></label><label>Localidad<input value={form.locality} onChange={(event) => { setForm({ ...form, locality: event.target.value }); setShipping(null); }} /></label><label className="wide">Domicilio<input value={form.address} onChange={(event) => { setForm({ ...form, address: event.target.value }); setShipping(null); }} /></label></div>}
            <button type="button" className="button secondary" onClick={confirmDelivery}>{method === "envio" ? "Confirmar datos de envío" : "Confirmar retiro"}</button>
            {shipping !== null && <div className="success-message">✓ {method === "retiro" ? "Retiro gratis en Sáenz 1587" : "Datos listos para cotizar el envío"}</div>}
          </section>
          <section className="form-card">
            <div className="step-number">3</div><h2>Revisión y contacto</h2>
            <div className="payment-option selected"><span>✓</span><div><strong>Primero confirmamos todo</strong><small>Stock, entrega y total final</small></div><b>SIN COBRO</b></div>
            <p className="helper">Enviar la solicitud no realiza ningún pago. Litoral Maq se contactará con vos para confirmar disponibilidad, cotizar el envío si corresponde y coordinar el medio de pago.</p>
            {/* Ley 25.326 art. 6: informar la finalidad y el destino de los datos
                antes de recolectarlos, con el enlace a la política completa. */}
            <p className="helper legal-consent">
              Al enviar la solicitud aceptás los <Link href="/legales#terminos">Términos y Condiciones</Link> y
              la <Link href="/legales#privacidad">Política de Privacidad</Link>. Usamos tus datos únicamente
              para procesar este pedido y contactarte; no los cedemos con fines comerciales.
            </p>
          </section>
          {error && <div className="error-message">{error}</div>}
        </div>
        <aside className="order-summary sticky">
          <h2>Tu solicitud</h2>
          <div><span>Productos</span><strong>{cart.reduce((sum, line) => sum + line.quantity, 0)}</strong></div>
          <div><span>Subtotal</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
          <div><span>Entrega</span><strong>{shipping === null ? "Sin confirmar" : method === "retiro" ? "Gratis" : "A cotizar"}</strong></div><hr />
          <div className="summary-total"><span>Total de productos</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
          <button className="button primary large full" disabled={loading || shipping === null || (needsGuestSession && !captcha.solved)}>{loading ? "Enviando…" : shipping === null ? "Confirmá la entrega para continuar" : "Enviar solicitud de compra"}</button>
          <small>No se realizará ningún cobro en este paso.</small>
        </aside>
      </form>
    </main>
  );
}
