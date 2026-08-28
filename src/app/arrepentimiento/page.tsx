"use client";

import Link from "next/link";
import { useState } from "react";
import { BUSINESS, DEFENSA_CONSUMIDOR_URL } from "@/lib/business";
import { getWhatsAppUrl } from "@/lib/whatsapp";

/**
 * Botón de Arrepentimiento (Res. 424/2020 SCI). La norma exige que el enlace
 * esté en la primera pantalla del sitio y lleve de forma directa a un
 * formulario que el consumidor pueda completar.
 *
 * El envío se hace por email y WhatsApp: son los dos canales que el negocio
 * ya atiende. No hay endpoint propio a propósito — una revocación que queda
 * guardada en una tabla que nadie mira es peor que un mail que sí se lee.
 */
export default function ArrepentimientoPage() {
  const [form, setForm] = useState({ name: "", document: "", orderId: "", reason: "" });

  function buildMessage() {
    return [
      "Solicitud de revocación de compra (Botón de Arrepentimiento).",
      `Nombre y apellido: ${form.name || "—"}`,
      `DNI / CUIT: ${form.document || "—"}`,
      `Número de pedido: ${form.orderId || "—"}`,
      `Motivo (opcional): ${form.reason || "—"}`,
      "",
      "Solicito la revocación de la operación dentro del plazo de 10 días corridos previsto por el art. 34 de la Ley 24.240.",
    ].join("\n");
  }

  function sendByEmail(event: React.FormEvent) {
    event.preventDefault();
    const subject = encodeURIComponent(`Botón de Arrepentimiento — pedido ${form.orderId || "sin número"}`);
    window.location.href = `mailto:${BUSINESS.email}?subject=${subject}&body=${encodeURIComponent(buildMessage())}`;
  }

  return (
    <main className="standard-page legal-page">
      <div className="page-heading">
        <span className="eyebrow orange">LEY 24.240 · RES. 424/2020</span>
        <h1>Botón de Arrepentimiento</h1>
        <p>Revocá tu compra dentro de los 10 días corridos desde que recibiste el producto.</p>
      </div>

      <section className="legal-section">
        <h2>Cómo funciona</h2>
        <p>
          Tenés derecho a dejar sin efecto la compra dentro de los <strong>10 días corridos</strong> contados
          desde la entrega del producto, sin necesidad de expresar motivo y <strong>sin costo alguno</strong>.
          El producto debe estar en el mismo estado en que se recibió. Una vez que recibimos tu solicitud nos
          comunicamos con vos para coordinar la devolución y el reintegro, si hubo pago.
        </p>
        <p className="helper">
          Completá el formulario y elegí por dónde enviarlo. Guardá una copia como constancia.
        </p>
      </section>

      <section className="legal-section">
        <form className="form-card" onSubmit={sendByEmail}>
          <h2>Formulario de revocación</h2>
          <div className="form-grid">
            <label>
              Nombre y apellido
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              DNI o CUIT
              <input
                required
                value={form.document}
                onChange={(event) => setForm({ ...form, document: event.target.value })}
              />
            </label>
            <label className="wide">
              Número de pedido
              <input
                required
                value={form.orderId}
                onChange={(event) => setForm({ ...form, orderId: event.target.value })}
              />
            </label>
            <label className="wide">
              Motivo (opcional)
              <textarea
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </label>
          </div>
          <div className="buy-row">
            <button type="submit" className="button primary">Enviar por email</button>
            <a
              className="button secondary"
              href={getWhatsAppUrl(buildMessage())}
              target="_blank"
              rel="noopener noreferrer"
            >
              Enviar por WhatsApp
            </a>
          </div>
        </form>
      </section>

      <section className="legal-section">
        <h2>Otras vías</h2>
        <p>
          También podés escribirnos a <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> o acercarte a{" "}
          {BUSINESS.domicilio} en el horario de atención ({BUSINESS.horarios}).
        </p>
        <p>
          Si considerás que no dimos respuesta, podés reclamar ante la autoridad de aplicación mediante el{" "}
          <a href={DEFENSA_CONSUMIDOR_URL} target="_blank" rel="noopener noreferrer">
            formulario de Defensa del Consumidor
          </a>. Las condiciones completas están en <Link href="/legales#terminos">Términos y Condiciones</Link>.
        </p>
      </section>
    </main>
  );
}
