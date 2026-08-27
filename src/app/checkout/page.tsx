"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { guestIdFromEmail, normalizeEmail } from "@/lib/auth";
import { getAuthAdapter, supportsGuestSessions } from "@/services/auth";
import { quoteShipping, ShippingIntegrationError, type ShippingQuoteOption } from "@/services/shipping";
import type { Order, Session, ShippingDeliveryType } from "@/lib/types";
import { snapshotOrderLines } from "@/lib/order-details";

const PROVINCES = [
  ["B", "Buenos Aires"], ["C", "Ciudad Autónoma de Buenos Aires"], ["K", "Catamarca"],
  ["H", "Chaco"], ["U", "Chubut"], ["W", "Corrientes"], ["X", "Córdoba"],
  ["E", "Entre Ríos"], ["P", "Formosa"], ["Y", "Jujuy"], ["L", "La Pampa"],
  ["F", "La Rioja"], ["M", "Mendoza"], ["N", "Misiones"], ["Q", "Neuquén"],
  ["R", "Río Negro"], ["A", "Salta"], ["J", "San Juan"], ["D", "San Luis"],
  ["Z", "Santa Cruz"], ["S", "Santa Fe"], ["G", "Santiago del Estero"],
  ["V", "Tierra del Fuego"], ["T", "Tucumán"],
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, products, cartSubtotal, customerSession, clearCart, createOrder, addCustomer, setCustomerSession } = useStore();
  const [method, setMethod] = useState<"envio" | "retiro">("envio");
  const [deliveryType, setDeliveryType] = useState<ShippingDeliveryType>("domicilio");
  const [shipping, setShipping] = useState<number | null>(null);
  const [quoteOptions, setQuoteOptions] = useState<ShippingQuoteOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: customerSession?.user.name || "",
    email: customerSession?.user.email || "",
    phone: "",
    province: "W",
    postalCode: "",
    locality: "",
    street: "",
    streetNumber: "",
    floor: "",
    apartment: "",
    reference: "",
  });

  function resetQuote() {
    setShipping(null);
    setQuoteOptions([]);
    setSelectedQuoteId("");
    setManualReason("");
  }

  function updateForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    resetQuote();
  }

  function validateDestination() {
    if (!form.province || !/^\d{4}$/.test(form.postalCode) || !form.locality.trim()) {
      return "Completá provincia, código postal y localidad.";
    }
    if (deliveryType === "domicilio" && (!form.street.trim() || !form.streetNumber.trim())) {
      return "Completá calle y número para la entrega a domicilio.";
    }
    return "";
  }

  async function ensureIdentity(): Promise<{ customerId: string; session: Session | null }> {
    if (customerSession) return { customerId: customerSession.user.id, session: null };
    const authAdapter = getAuthAdapter();
    if (supportsGuestSessions(authAdapter)) {
      const session = await authAdapter.ensureGuestSession();
      await setCustomerSession(session);
      return { customerId: session.user.id, session };
    }
    return { customerId: guestIdFromEmail(normalizeEmail(form.email)), session: null };
  }

  async function confirmDelivery() {
    setError("");
    setManualReason("");
    if (method === "retiro") {
      setQuoteOptions([]);
      setSelectedQuoteId("");
      setShipping(0);
      return;
    }
    const destinationError = validateDestination();
    if (destinationError) {
      setError(destinationError);
      return;
    }
    if (!form.email.includes("@")) {
      setError("Completá un email válido antes de cotizar.");
      return;
    }
    setQuoting(true);
    resetQuote();
    try {
      await ensureIdentity();
      const result = await quoteShipping({
        lines: cart,
        province: form.province,
        postalCode: form.postalCode,
        locality: form.locality.trim(),
        deliveryType,
      });
      if (result.status === "manual") {
        setManualReason(result.reason);
        setShipping(0);
        return;
      }
      const sorted = [...result.options].sort((a, b) => a.amount - b.amount || (a.etaHours || 9999) - (b.etaHours || 9999));
      if (!sorted.length) {
        setManualReason("No hay una opción automática disponible; vamos a cotizar el envío manualmente.");
        setShipping(0);
        return;
      }
      setQuoteOptions(sorted);
      setSelectedQuoteId(sorted[0].id);
      setShipping(sorted[0].amount);
    } catch (caught) {
      if (caught instanceof ShippingIntegrationError && caught.status === 503) {
        setManualReason("La integración todavía no está activa; vamos a cotizar este envío manualmente.");
        setShipping(0);
      } else {
        setError(caught instanceof Error ? caught.message : "No se pudo cotizar el envío.");
      }
    } finally {
      setQuoting(false);
    }
  }

  function chooseQuote(option: ShippingQuoteOption) {
    setSelectedQuoteId(option.id);
    setShipping(option.amount);
    setManualReason("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.includes("@") || form.phone.trim().length < 6) {
      setError("Completá nombre, email y teléfono.");
      return;
    }
    if (method === "envio") {
      const destinationError = validateDestination();
      if (destinationError) {
        setError(destinationError);
        return;
      }
    }
    if (shipping === null) {
      setError("Confirmá la forma de entrega antes de enviar la solicitud.");
      return;
    }
    if (method === "envio" && !manualReason && !selectedQuoteId) {
      setError("Elegí una opción de envío.");
      return;
    }

    setLoading(true);
    const normalizedEmail = normalizeEmail(form.email);
    try {
      const identity = await ensureIdentity();
      const selectedQuote = quoteOptions.find((option) => option.id === selectedQuoteId);
      const id = `LM-${Date.now().toString().slice(-8)}`;
      const address = method === "retiro"
        ? undefined
        : selectedQuote?.deliveryType === "sucursal"
          ? `${selectedQuote.branchName || "Sucursal"} · ${selectedQuote.branchAddress || form.locality.trim()}`
          : `${form.street.trim()} ${form.streetNumber.trim()}${form.floor ? ` · Piso ${form.floor}` : ""}${form.apartment ? ` · Depto ${form.apartment}` : ""} · ${form.locality.trim()} · CP ${form.postalCode}`;
      const order: Order = {
        id,
        customerId: identity.customerId,
        customerName: form.name.trim(),
        email: normalizedEmail,
        phone: form.phone.trim(),
        lines: snapshotOrderLines(cart, products),
        total: cartSubtotal + shipping,
        shipping,
        deliveryMethod: method,
        address,
        status: "pendiente",
        createdAt: new Date().toISOString(),
        paymentReference: "Pago a coordinar",
        paymentStatus: "pending",
        postalCode: method === "envio" ? form.postalCode : undefined,
        province: method === "envio" ? form.province : undefined,
        locality: method === "envio" ? form.locality.trim() : undefined,
        street: method === "envio" && deliveryType === "domicilio" ? form.street.trim() : undefined,
        streetNumber: method === "envio" && deliveryType === "domicilio" ? form.streetNumber.trim() : undefined,
        floor: form.floor.trim() || undefined,
        apartment: form.apartment.trim() || undefined,
        addressReference: form.reference.trim() || undefined,
        shippingQuoteId: selectedQuote?.id,
        shippingProvider: selectedQuote?.provider,
        shippingCarrier: selectedQuote?.carrierName,
        shippingService: selectedQuote?.service,
        shippingDeliveryType: method === "envio" ? deliveryType : undefined,
        shippingBranchId: selectedQuote?.branchId || undefined,
        shippingBranchName: selectedQuote?.branchName || undefined,
        shippingBranchAddress: selectedQuote?.branchAddress || undefined,
        shippingStatus: method === "envio" ? selectedQuote ? "quoted" : "manual_quote" : undefined,
        shippingLabelReady: false,
      };
      await createOrder(order);
      addCustomer({
        id: identity.customerId,
        name: order.customerName,
        email: normalizedEmail,
        phone: form.phone.trim(),
        role: "customer",
      });
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
      <div className="page-heading"><span className="eyebrow orange">SOLICITUD DE COMPRA</span><h1>Confirmá tu pedido</h1><p>Cotizamos la entrega con tus datos reales y confirmamos todo antes de cobrar.</p></div>
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
              <label className={method === "envio" ? "selected" : ""}><input type="radio" checked={method === "envio"} onChange={() => { setMethod("envio"); resetQuote(); }} />🚚 Envío</label>
              <label className={method === "retiro" ? "selected" : ""}><input type="radio" checked={method === "retiro"} onChange={() => { setMethod("retiro"); resetQuote(); }} />📍 Retiro en Sáenz 1587</label>
            </div>
            {method === "envio" && <>
              <div className="delivery-options delivery-suboptions">
                <label className={deliveryType === "domicilio" ? "selected" : ""}><input type="radio" checked={deliveryType === "domicilio"} onChange={() => { setDeliveryType("domicilio"); resetQuote(); }} />A domicilio</label>
                <label className={deliveryType === "sucursal" ? "selected" : ""}><input type="radio" checked={deliveryType === "sucursal"} onChange={() => { setDeliveryType("sucursal"); resetQuote(); }} />A sucursal del correo</label>
              </div>
              <div className="form-grid">
                <label>Provincia<select value={form.province} onChange={(event) => updateForm({ province: event.target.value })}>{PROVINCES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label>
                <label>Código postal<input value={form.postalCode} maxLength={4} inputMode="numeric" onChange={(event) => updateForm({ postalCode: event.target.value.replace(/\D/g, "") })} /></label>
                <label>Localidad<input value={form.locality} onChange={(event) => updateForm({ locality: event.target.value })} /></label>
                {deliveryType === "domicilio" && <><label className="wide">Calle<input value={form.street} onChange={(event) => updateForm({ street: event.target.value })} /></label><label>Número<input value={form.streetNumber} maxLength={5} onChange={(event) => updateForm({ streetNumber: event.target.value })} /></label><label>Piso (opcional)<input value={form.floor} maxLength={6} onChange={(event) => updateForm({ floor: event.target.value })} /></label><label>Depto. (opcional)<input value={form.apartment} maxLength={4} onChange={(event) => updateForm({ apartment: event.target.value })} /></label></>}
                <label className="wide">Referencia (opcional)<input value={form.reference} onChange={(event) => updateForm({ reference: event.target.value })} /></label>
              </div>
            </>}
            <button type="button" className="button secondary" onClick={confirmDelivery} disabled={quoting}>{quoting ? "Cotizando…" : method === "envio" ? "Calcular opciones de envío" : "Confirmar retiro"}</button>
            {quoteOptions.length > 0 && <div className="shipping-quotes" role="radiogroup" aria-label="Opciones de envío">{quoteOptions.map((option) => <button type="button" role="radio" aria-checked={selectedQuoteId === option.id} className={selectedQuoteId === option.id ? "shipping-quote selected" : "shipping-quote"} key={option.id} onClick={() => chooseQuote(option)}><span><strong>{option.carrierName}</strong><small>{option.deliveryType === "sucursal" ? `${option.branchName} · ${option.branchAddress}` : "Entrega a domicilio"}</small><small>{option.etaHours ? `Plazo estimado: ${Math.ceil(option.etaHours / 24)} días` : "Plazo a confirmar"}</small></span><b>{formatCurrency(option.amount)}</b></button>)}</div>}
            {manualReason && <div className="manual-shipping-message"><strong>Cotización manual</strong><span>{manualReason} El equipo te confirmará costo y plazo antes del pago.</span></div>}
            {shipping !== null && !manualReason && <div className="success-message">✓ {method === "retiro" ? "Retiro gratis en Sáenz 1587" : "Opción de envío seleccionada"}</div>}
          </section>
          <section className="form-card">
            <div className="step-number">3</div><h2>Revisión y contacto</h2>
            <div className="payment-option selected"><span>✓</span><div><strong>Primero confirmamos todo</strong><small>Stock, entrega y total final</small></div><b>SIN COBRO</b></div>
            <p className="helper">La guía logística se crea únicamente cuando Litoral Maq confirma el pago. Enviar esta solicitud no genera cargos ni despachos.</p>
          </section>
          {error && <div className="error-message">{error}</div>}
        </div>
        <aside className="order-summary sticky">
          <h2>Tu solicitud</h2>
          <div><span>Productos</span><strong>{cart.reduce((sum, line) => sum + line.quantity, 0)}</strong></div>
          <div><span>Subtotal</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
          <div><span>Entrega</span><strong>{shipping === null ? "Sin confirmar" : method === "retiro" ? "Gratis" : manualReason ? "A confirmar" : formatCurrency(shipping)}</strong></div><hr />
          <div className="summary-total"><span>{manualReason ? "Total parcial" : "Total"}</span><strong>{formatCurrency(cartSubtotal + (shipping || 0))}</strong></div>
          <button className="button primary large full" disabled={loading || quoting || shipping === null}>{loading ? "Enviando…" : shipping === null ? "Confirmá la entrega para continuar" : "Enviar solicitud de compra"}</button>
          <small>No se realizará ningún cobro en este paso.</small>
        </aside>
      </form>
    </main>
  );
}
