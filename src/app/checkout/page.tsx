"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useCaptcha } from "@/components/use-captcha";
import { useStore } from "@/store/store";
import { formatCurrency } from "@/lib/utils";
import { guestIdFromEmail, normalizeEmail } from "@/lib/auth";
import { getAuthAdapter, supportsGuestSessions } from "@/services/auth";
import {
  quoteShipping,
  ShippingIntegrationError,
  type ShippingQuoteOption,
} from "@/services/shipping";
import {
  createPaymentPreference,
  isMercadoPagoEnabled,
} from "@/services/payments";
import type { Order, Session, ShippingDeliveryType } from "@/lib/types";
import {
  buildOrderAddress,
  PROVINCES,
  SHIPPING_CARRIER_OPTIONS,
  snapshotOrderLines,
} from "@/lib/order-details";
import { validateCartPurchaseLimits } from "@/lib/purchase-limits";
import { isValidArgentinePhone } from "@/lib/whatsapp";

type FormField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "dni"
  | "postalCode"
  | "locality"
  | "street"
  | "streetNumber";

function splitCustomerName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
}

export default function CheckoutPage() {
  const router = useRouter();
  const {
    cart,
    products,
    cartSubtotal,
    customerSession,
    clearCart,
    createOrder,
    addCustomer,
    setCustomerSession,
  } = useStore();
  const [method, setMethod] = useState<"envio" | "retiro">("envio");
  const [deliveryType, setDeliveryType] =
    useState<ShippingDeliveryType>("domicilio");
  const [shipping, setShipping] = useState<number | null>(null);
  const [quoteOptions, setQuoteOptions] = useState<ShippingQuoteOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [manualReason, setManualReason] = useState("");
  // Con envío a coordinar el cliente paga los productos y elige qué logística
  // prefiere; Litoral Maq confirma el despacho y el costo después del pago.
  const [preferredCarrier, setPreferredCarrier] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Errores de la sección Entrega: se muestran pegados al botón que los causó.
  const [deliveryError, setDeliveryError] = useState("");
  // La compra como invitado crea un usuario REAL en Supabase Auth
  // (signInAnonymously), así que ese endpoint necesita la misma protección
  // antiabuso que un registro. Con sesión ya iniciada no hace falta: no se
  // crea ninguna identidad nueva.
  const captcha = useCaptcha();
  const needsGuestSession = !customerSession;
  const sessionName = splitCustomerName(customerSession?.user.name);
  const [form, setForm] = useState({
    firstName: sessionName.firstName,
    lastName: sessionName.lastName,
    email: customerSession?.user.email || "",
    dni: "",
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
  const paymentEnabled = isMercadoPagoEnabled();
  // Campos marcados como inválidos en el último intento: borde rojo,
  // aria-invalid y foco al primero. Se desmarcan apenas se editan.
  const [invalidFields, setInvalidFields] = useState<Set<FormField>>(new Set());

  function resetQuote() {
    setShipping(null);
    setQuoteOptions([]);
    setSelectedQuoteId("");
    setManualReason("");
  }

  function updateForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    clearInvalid(patch);
    resetQuote();
  }

  function clearInvalid(patch: Partial<typeof form>) {
    setInvalidFields((current) => {
      const keys = Object.keys(patch) as FormField[];
      if (!keys.some((key) => current.has(key))) return current;
      const next = new Set(current);
      keys.forEach((key) => next.delete(key));
      return next;
    });
  }

  function editContact(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    clearInvalid(patch);
  }

  /** Marca los campos (en el orden del formulario) y lleva el foco al primero. */
  function flagFields(fields: FormField[]) {
    setInvalidFields(new Set(fields));
    if (fields.length) document.getElementById(`checkout-${fields[0]}`)?.focus();
  }

  function fieldProps(field: FormField) {
    const invalid = invalidFields.has(field);
    return {
      id: `checkout-${field}`,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? "checkout-form-error" : undefined,
    };
  }

  function invalidContactFields() {
    const fields: FormField[] = [];
    if (!form.firstName.trim()) fields.push("firstName");
    if (!form.lastName.trim()) fields.push("lastName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) fields.push("email");
    if (!isValidArgentinePhone(form.phone)) fields.push("phone");
    if (!/^\d{7,8}$/.test(form.dni)) fields.push("dni");
    return fields;
  }

  function validateContact() {
    const fields = invalidContactFields();
    if (fields.length) {
      flagFields(fields);
      return "Completá nombre, apellido, email, teléfono y DNI. El teléfono tiene que ser un celular argentino con código de área (ej.: 379 4530578) y el DNI 7 u 8 números.";
    }
    return "";
  }

  function validateDestination() {
    const place: FormField[] = [];
    if (!/^\d{4}$/.test(form.postalCode)) place.push("postalCode");
    if (!form.locality.trim()) place.push("locality");
    if (!form.province || place.length) {
      flagFields(place);
      return "Completá provincia, código postal y localidad.";
    }
    const street: FormField[] = [];
    if (deliveryType === "domicilio") {
      if (!form.street.trim()) street.push("street");
      if (!form.streetNumber.trim()) street.push("streetNumber");
    }
    if (street.length) {
      flagFields(street);
      return "Completá calle y número para la entrega a domicilio.";
    }
    return "";
  }

  async function ensureIdentity(): Promise<{
    customerId: string;
    session: Session | null;
  }> {
    if (customerSession)
      return { customerId: customerSession.user.id, session: null };
    const authAdapter = getAuthAdapter();
    if (supportsGuestSessions(authAdapter)) {
      try {
        const session = await authAdapter.ensureGuestSession(captcha.token);
        await setCustomerSession(session);
        return { customerId: session.user.id, session };
      } catch (error) {
        captcha.reset();
        throw error;
      }
    }
    return {
      customerId: guestIdFromEmail(normalizeEmail(form.email)),
      session: null,
    };
  }

  async function confirmDelivery() {
    setError("");
    setDeliveryError("");
    setManualReason("");
    const contactError = validateContact();
    if (contactError) {
      setDeliveryError(contactError);
      return;
    }
    if (method === "retiro") {
      setQuoteOptions([]);
      setSelectedQuoteId("");
      setShipping(0);
      return;
    }
    const destinationError = validateDestination();
    if (destinationError) {
      setDeliveryError(destinationError);
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
      const sorted = [...result.options].sort(
        (a, b) =>
          a.amount - b.amount || (a.etaHours || 9999) - (b.etaHours || 9999),
      );
      if (!sorted.length) {
        setManualReason(
          "No hay una opción automática disponible; vamos a cotizar el envío manualmente.",
        );
        setShipping(0);
        return;
      }
      setQuoteOptions(sorted);
      setSelectedQuoteId(sorted[0].id);
      setShipping(sorted[0].amount);
    } catch (caught) {
      if (caught instanceof ShippingIntegrationError && caught.status === 503) {
        setManualReason(
          "La integración todavía no está activa; vamos a cotizar este envío manualmente.",
        );
        setShipping(0);
      } else {
        setDeliveryError(
          caught instanceof Error
            ? caught.message
            : "No se pudo cotizar el envío.",
        );
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
    const contactError = validateContact();
    if (contactError) {
      setError(contactError);
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
      setError("Confirmá la forma de entrega antes de continuar.");
      return;
    }
    if (method === "envio" && !manualReason && !selectedQuoteId) {
      setError("Elegí una opción de envío.");
      return;
    }
    if (method === "envio" && manualReason && !preferredCarrier) {
      setError("Elegí con qué empresa querés el envío: Vía Cargo, OCA o Andreani.");
      return;
    }
    const quantityError = validateCartPurchaseLimits(cart, products);
    if (quantityError) {
      setError(quantityError);
      return;
    }

    setLoading(true);
    const normalizedEmail = normalizeEmail(form.email);
    try {
      const identity = await ensureIdentity();
      const selectedQuote = quoteOptions.find(
        (option) => option.id === selectedQuoteId,
      );
      const id = `LM-${Date.now().toString().slice(-8)}`;
      // Sin cotización automática no hay sucursal elegida: manda lo que eligió
      // el cliente (domicilio o sucursal), nunca la calle si pidió sucursal.
      const orderDeliveryType = selectedQuote?.deliveryType ?? deliveryType;
      const toHome = method === "envio" && orderDeliveryType === "domicilio";
      const address =
        method === "retiro"
          ? undefined
          : buildOrderAddress({
            ...form,
            deliveryType: orderDeliveryType,
            branchName: selectedQuote?.branchName,
            branchAddress: selectedQuote?.branchAddress,
          });
      const order: Order = {
        id,
        customerId: identity.customerId,
        customerName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        email: normalizedEmail,
        dni: form.dni,
        phone: form.phone.trim(),
        lines: snapshotOrderLines(cart, products),
        total: cartSubtotal + shipping,
        shipping,
        deliveryMethod: method,
        address,
        status: "pendiente",
        createdAt: new Date().toISOString(),
        paymentReference: "Pago pendiente",
        paymentStatus: "pending",
        postalCode: method === "envio" ? form.postalCode : undefined,
        province: method === "envio" ? form.province : undefined,
        locality: method === "envio" ? form.locality.trim() : undefined,
        street: toHome ? form.street.trim() : undefined,
        streetNumber: toHome ? form.streetNumber.trim() : undefined,
        floor: (toHome && form.floor.trim()) || undefined,
        apartment: (toHome && form.apartment.trim()) || undefined,
        addressReference: form.reference.trim() || undefined,
        shippingQuoteId: selectedQuote?.id,
        shippingProvider: selectedQuote?.provider,
        shippingCarrier: selectedQuote?.carrierName ??
          (method === "envio" && manualReason ? preferredCarrier : undefined),
        shippingService: selectedQuote?.service,
        shippingDeliveryType: method === "envio" ? orderDeliveryType : undefined,
        shippingBranchId: selectedQuote?.branchId || undefined,
        shippingBranchName: selectedQuote?.branchName || undefined,
        shippingBranchAddress: selectedQuote?.branchAddress || undefined,
        shippingStatus:
          method === "envio"
            ? selectedQuote
              ? "quoted"
              : "manual_quote"
            : undefined,
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
      // Se cobra siempre que Mercado Pago esté habilitado. Con envío a coordinar
      // se pagan los productos y el envío se arregla aparte con el cliente.
      const automaticPayment = paymentEnabled;
      if (automaticPayment) {
        try {
          const preference = await createPaymentPreference(order.id);
          window.location.assign(preference.checkoutUrl);
          return;
        } catch {
          router.push(`/checkout/error?pedido=${encodeURIComponent(order.id)}`);
          return;
        }
      }
      clearCart();
      router.push(
        `/checkout/exito?pedido=${order.id}&email=${encodeURIComponent(normalizedEmail)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo registrar el pedido. El carrito sigue intacto.",
      );
      setLoading(false);
    }
  }

  if (!cart.length) {
    return (
      <main className="center-state">
        <div className="cart-empty">
          <span className="cart-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
            </svg>
          </span>
          <h1>No hay productos para comprar</h1>
          <p>Agregá al carrito lo que necesitás y volvé para terminar la compra.</p>
          <Link href="/productos" className="button primary">
            Ir al catálogo
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="standard-page checkout-page">
      <div className="page-heading">
        <h1>Confirmá tu pedido</h1>
        <p>
          {paymentEnabled
            ? "Completá tus datos, elegí cómo recibirlo y pagá seguro con Mercado Pago."
            : "Completá tus datos y elegí cómo querés recibirlo."}
        </p>
      </div>
      <form className="checkout-layout" onSubmit={submit}>
        <div className="checkout-steps">
          <section className="form-card">
            <div className="step-number">1</div>
            <h2>Datos de contacto</h2>
            <div className="form-grid">
              <label>
                Nombre
                <input
                  required
                  autoComplete="given-name"
                  {...fieldProps("firstName")}
                  value={form.firstName}
                  onChange={(event) =>
                    editContact({ firstName: event.target.value })
                  }
                />
              </label>
              <label>
                Apellido
                <input
                  required
                  autoComplete="family-name"
                  {...fieldProps("lastName")}
                  value={form.lastName}
                  onChange={(event) =>
                    editContact({ lastName: event.target.value })
                  }
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  {...fieldProps("email")}
                  value={form.email}
                  onChange={(event) =>
                    editContact({ email: event.target.value })
                  }
                />
              </label>
              <label>
                Teléfono
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  {...fieldProps("phone")}
                  value={form.phone}
                  onChange={(event) =>
                    editContact({ phone: event.target.value })
                  }
                />
              </label>
              <label>
                DNI
                <input
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  minLength={7}
                  maxLength={8}
                  {...fieldProps("dni")}
                  value={form.dni}
                  onChange={(event) =>
                    editContact({ dni: event.target.value.replace(/\D/g, "") })
                  }
                />
              </label>
            </div>
            {needsGuestSession && (
              <>
                <p className="helper">
                  No hace falta crear una cuenta para comprar. Después de enviar
                  la solicitud vas a poder crearla si querés guardar el
                  historial.
                </p>
                {captcha.field}
              </>
            )}
          </section>
          <section className="form-card">
            <div className="step-number">2</div>
            <h2>Entrega</h2>
            <div className="delivery-options" role="radiogroup" aria-label="Forma de entrega">
              <label className={method === "envio" ? "choice selected" : "choice"}>
                <input
                  type="radio"
                  name="delivery-method"
                  checked={method === "envio"}
                  onChange={() => {
                    setMethod("envio");
                    resetQuote();
                  }}
                />
                <span className="choice-text">
                  <strong>Envío</strong>
                  <small>Lo recibís en tu domicilio o en el correo</small>
                </span>
              </label>
              <label className={method === "retiro" ? "choice selected" : "choice"}>
                <input
                  type="radio"
                  name="delivery-method"
                  checked={method === "retiro"}
                  onChange={() => {
                    setMethod("retiro");
                    resetQuote();
                  }}
                />
                <span className="choice-text">
                  <strong>Retiro en Sáenz 1587</strong>
                  <small>Sin costo de envío</small>
                </span>
              </label>
            </div>
            {method === "envio" && (
              <>
                <div className="delivery-options delivery-suboptions" role="radiogroup" aria-label="Tipo de envío">
                  <label
                    className={deliveryType === "domicilio" ? "choice selected" : "choice"}
                  >
                    <input
                      type="radio"
                      name="delivery-type"
                      checked={deliveryType === "domicilio"}
                      onChange={() => {
                        setDeliveryType("domicilio");
                        resetQuote();
                      }}
                    />
                    <span className="choice-text">
                      <strong>A domicilio</strong>
                      <small>Te lo llevan a tu dirección</small>
                    </span>
                  </label>
                  <label
                    className={deliveryType === "sucursal" ? "choice selected" : "choice"}
                  >
                    <input
                      type="radio"
                      name="delivery-type"
                      checked={deliveryType === "sucursal"}
                      onChange={() => {
                        setDeliveryType("sucursal");
                        resetQuote();
                      }}
                    />
                    <span className="choice-text">
                      <strong>A sucursal del correo</strong>
                      <small>Lo retirás en la sucursal</small>
                    </span>
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Provincia
                    <select
                      value={form.province}
                      onChange={(event) =>
                        updateForm({ province: event.target.value })
                      }
                    >
                      {PROVINCES.map(([code, name]) => (
                        <option value={code} key={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Código postal
                    <input
                      {...fieldProps("postalCode")}
                      value={form.postalCode}
                      maxLength={4}
                      inputMode="numeric"
                      onChange={(event) =>
                        updateForm({
                          postalCode: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </label>
                  <label>
                    Localidad
                    <input
                      {...fieldProps("locality")}
                      value={form.locality}
                      onChange={(event) =>
                        updateForm({ locality: event.target.value })
                      }
                    />
                  </label>
                  {deliveryType === "domicilio" && (
                    <>
                      <label className="wide">
                        Calle
                        <input
                          {...fieldProps("street")}
                          value={form.street}
                          onChange={(event) =>
                            updateForm({ street: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Número
                        <input
                          {...fieldProps("streetNumber")}
                          value={form.streetNumber}
                          maxLength={5}
                          onChange={(event) =>
                            updateForm({ streetNumber: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Piso (opcional)
                        <input
                          value={form.floor}
                          maxLength={6}
                          onChange={(event) =>
                            updateForm({ floor: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Depto. (opcional)
                        <input
                          value={form.apartment}
                          maxLength={4}
                          onChange={(event) =>
                            updateForm({ apartment: event.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label className="wide">
                    Referencia (opcional)
                    <input
                      placeholder="Ej.: portón negro, entre calle X y calle Y"
                      value={form.reference}
                      onChange={(event) =>
                        updateForm({ reference: event.target.value })
                      }
                    />
                  </label>
                </div>
              </>
            )}
            <button
              type="button"
              className="button secondary delivery-confirm"
              onClick={confirmDelivery}
              disabled={
                quoting ||
                (method === "envio" && needsGuestSession && !captcha.solved)
              }
            >
              {quoting
                ? "Cotizando…"
                : method === "envio"
                  ? "Calcular opciones de envío"
                  : "Confirmar retiro"}
            </button>
            {deliveryError && (
              <div className="error-message" role="alert" id="checkout-form-error">
                {deliveryError}
              </div>
            )}
            {quoteOptions.length > 0 && (
              <div
                className="shipping-quotes"
                role="radiogroup"
                aria-label="Opciones de envío"
              >
                {quoteOptions.map((option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedQuoteId === option.id}
                    className={
                      selectedQuoteId === option.id
                        ? "shipping-quote selected"
                        : "shipping-quote"
                    }
                    key={option.id}
                    onClick={() => chooseQuote(option)}
                  >
                    <span>
                      <strong>{option.carrierName}</strong>
                      <small>
                        {option.deliveryType === "sucursal"
                          ? `${option.branchName} · ${option.branchAddress}`
                          : "Entrega a domicilio"}
                      </small>
                      <small>
                        {option.etaHours
                          ? `Plazo estimado: ${Math.ceil(option.etaHours / 24)} días`
                          : "Plazo a confirmar"}
                      </small>
                    </span>
                    <b>{formatCurrency(option.amount)}</b>
                  </button>
                ))}
              </div>
            )}
            {manualReason && (
              <div className="manual-shipping-message">
                <strong>Envío a coordinar</strong>
                <span>
                  {paymentEnabled
                    ? "Pagás ahora los productos. Elegí con qué empresa querés recibirlo: después del pago te pasamos el costo del envío, que se abona aparte."
                    : "Elegí con qué empresa querés recibirlo. Te pasamos el costo del envío, que se abona aparte."}
                </span>
                <fieldset className="carrier-preference">
                  <legend>¿Con qué empresa querés el envío?</legend>
                  <div className="carrier-options">
                    {SHIPPING_CARRIER_OPTIONS.map((carrier) => (
                      <label key={carrier} className="carrier-option">
                        <input
                          type="radio"
                          name="preferred-carrier"
                          value={carrier}
                          checked={preferredCarrier === carrier}
                          onChange={(event) => setPreferredCarrier(event.target.value)}
                          required
                        />
                        <span>{carrier}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
            {shipping !== null && !manualReason && (
              <div className="success-message with-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 12.5 2.5 2.5 4.5-5" />
                </svg>
                {method === "retiro"
                  ? "Retiro gratis en Sáenz 1587"
                  : "Opción de envío seleccionada"}
              </div>
            )}
          </section>
          <section className="form-card">
            <div className="step-number">3</div>
            <h2>{paymentEnabled ? "Pago" : "Revisión y contacto"}</h2>
            <div className="payment-option">
              {paymentEnabled ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <rect x="3" y="5.5" width="18" height="13" rx="2" />
                  <path d="M3 10h18M7 15h4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z" />
                  <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" />
                </svg>
              )}
              <div>
                <strong>
                  {paymentEnabled ? "Mercado Pago" : "Confirmación por WhatsApp"}
                </strong>
                <small>
                  {paymentEnabled
                    ? "Pagás con tarjeta de crédito en cuotas, débito o dinero en cuenta."
                    : "Sin cobro en este paso: te escribimos para confirmar el pedido y coordinar el pago."}
                </small>
              </div>
            </div>
            <p className="helper">
              {paymentEnabled
                ? "Al continuar vas al sitio seguro de Mercado Pago. Apenas se acredita el pago te llega la confirmación por correo."
                : "La guía logística se crea únicamente cuando Litoral Maq confirma el pago. Enviar esta solicitud no genera cargos ni despachos."}
            </p>
          </section>
          {error && (
            <div
              className="error-message"
              role="alert"
              id={deliveryError ? undefined : "checkout-form-error"}
            >
              {error}
            </div>
          )}
        </div>
        <aside className="order-summary sticky">
          <h2>Tu pedido</h2>
          <div>
            <span>Productos</span>
            <strong>
              {cart.reduce((sum, line) => sum + line.quantity, 0)}
            </strong>
          </div>
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrency(cartSubtotal)}</strong>
          </div>
          <div>
            <span>Entrega</span>
            <strong>
              {shipping === null
                ? "Sin confirmar"
                : method === "retiro"
                  ? "Gratis"
                  : manualReason
                    ? "A cotizar"
                    : formatCurrency(shipping)}
            </strong>
          </div>
          <hr />
          <div className="summary-total">
            <span>{paymentEnabled ? "Total a pagar ahora" : "Total"}</span>
            <strong>{formatCurrency(cartSubtotal + (shipping || 0))}</strong>
          </div>
          <button
            className="button primary large full"
            disabled={
              loading ||
              quoting ||
              shipping === null ||
              (needsGuestSession && !captcha.solved)
            }
          >
            {loading
              ? "Procesando…"
              : shipping === null
                ? "Confirmá la entrega para continuar"
                : paymentEnabled
                  ? "Continuar a Mercado Pago"
                  : "Enviar solicitud de compra"}
          </button>
          <p className="reservation-note">
            {paymentEnabled
              ? "Reservamos tu pedido por 24 horas. Si en ese plazo no se acredita el pago, se cancela solo."
              : "Reservamos tu solicitud por 24 horas. Si en ese plazo no confirmamos el pago con vos, se cancela sola."}
          </p>
          <small>
            {paymentEnabled
              ? manualReason
                ? "Pagás los productos en Mercado Pago. El envío se cotiza y abona aparte."
                : "El pago se hace en el sitio seguro de Mercado Pago."
              : "Sin cobro en este paso. Te confirmamos el pedido por WhatsApp."}
          </small>
        </aside>
      </form>
    </main>
  );
}
