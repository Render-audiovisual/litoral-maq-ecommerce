"use client";

import { useStore } from "@/store/store";
import { formatDate } from "@/lib/utils";
import { SHIPPING_CARRIER_OPTIONS } from "@/lib/order-details";
import { resolveRequestedProvider } from "@/services/provider";

type IntegrationState = "ok" | "off" | "warn";

const STATE_LABEL: Record<IntegrationState, string> = {
  ok: "Activa",
  off: "No activa",
  warn: "Requiere atención",
};

// "Vía Cargo, OCA o Andreani": las mismas empresas que ofrece el checkout.
const CARRIERS = `${SHIPPING_CARRIER_OPTIONS.slice(0, -1).join(", ")} o ${SHIPPING_CARRIER_OPTIONS.at(-1)}`;

function StateIcon({ state }: { state: IntegrationState }) {
  return (
    <svg className={`integration-icon ${state}`} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {state === "ok" && <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.8" /></>}
      {state === "off" && <><circle cx="12" cy="12" r="9" /><path d="M8.5 12h7" /></>}
      {state === "warn" && <><path d="M12 3.5 21 19.5H3L12 3.5Z" /><path d="M12 10v4M12 17h.01" /></>}
    </svg>
  );
}

export default function AdminSettingsPage() {
  const { auditLog } = useStore();
  const isSupabase = resolveRequestedProvider() === "supabase";
  const isShippingEnabled = process.env.NEXT_PUBLIC_SHIPPING_ENABLED === "true";
  const isPaymentEnabled =
    process.env.NEXT_PUBLIC_MERCADO_PAGO_ENABLED === "true";
  const integrations: { name: string; variable: string; status: string; state: IntegrationState }[] = [
    {
      name: "Base de datos",
      variable: "DATABASE_URL",
      status: isSupabase ? "Supabase conectada" : "Modo local",
      state: isSupabase ? "ok" : "off",
    },
    {
      name: "Mercado Pago",
      variable: "MP_ACCESS_TOKEN",
      status: isPaymentEnabled ? "Checkout Pro activo" : "Desactivado en este entorno",
      state: isPaymentEnabled ? "ok" : "off",
    },
    {
      name: "Google Login",
      variable: "Supabase Auth + Google OAuth",
      status: "Activo y probado en producción",
      state: "ok",
    },
    {
      name: "Captcha (Turnstile)",
      variable: "Cloudflare + Supabase",
      status: "Activo y exigido por Supabase en accesos y compra invitada",
      state: "ok",
    },
    {
      name: "Emails de cuenta",
      variable: "Resend SMTP + Supabase",
      status: "Activo; plantillas en español",
      state: "ok",
    },
    {
      name: "Correos de pedidos",
      variable: "Resend API + Outbox",
      status:
        "Activo para clientes; falta aprobar y validar la casilla operativa del negocio",
      state: "warn",
    },
    {
      name: "WhatsApp automático",
      variable: "Proveedor oficial + plantilla",
      status:
        "Contacto manual por ahora; automatización pendiente de proveedor y aprobación",
      state: "off",
    },
    {
      name: "Google Sheets",
      variable: "GOOGLE_SHEETS_ID",
      status: "Catálogo conectado",
      state: "ok",
    },
    {
      name: "Imágenes",
      variable: "STORAGE_*",
      status: "Pendiente",
      state: "off",
    },
    {
      name: "Envíopack",
      variable: "ENVIOPACK_API_KEY",
      status: isShippingEnabled
        ? "Integración automática activa"
        : "Descartado para la operación actual; integración desactivada",
      state: isShippingEnabled ? "ok" : "off",
    },
    {
      name: "Andreani",
      variable: "SHIPPING_PROVIDER",
      status: "Disponible como opción de envío a coordinar",
      state: "ok",
    },
  ];
  const operation = [
    {
      label: "Retiro",
      value: "Gratis en Sáenz 1587",
      detail: "Se confirma disponibilidad antes de preparar el pedido.",
    },
    {
      label: "Envíos",
      value: isShippingEnabled
        ? "Envíopack automático + respaldo manual"
        : "Cotización manual",
      detail: isShippingEnabled
        ? "Cotiza OCA/Urbano; pesos incompletos o bultos fuera de límite pasan a revisión manual."
        : `El cliente elige empresa (${CARRIERS}) y el equipo le pasa el costo del envío después del pago.`,
    },
    {
      label: "Pago",
      value: isPaymentEnabled
        ? "Mercado Pago Checkout Pro"
        : "Solicitud de compra con pago a coordinar",
      detail: isPaymentEnabled
        ? "El webhook firmado confirma el pago y avisa al cliente; el regreso del navegador no cambia estados."
        : "Mercado Pago está desactivado en este entorno: el pedido entra con el pago pendiente y se coordina con el cliente.",
    },
  ];
  const activeCount = integrations.filter((item) => item.state === "ok").length;

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <h1>Configuración</h1>
          <p>Cómo opera hoy la tienda y en qué estado está cada integración.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="admin-card">
          <div className="card-heading">
            <div>
              <h2>Operación vigente</h2>
              <p>Lo que se le ofrece al cliente al comprar</p>
            </div>
          </div>
          <dl className="settings-facts">
            {operation.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  <strong>{item.value}</strong>
                  <span>{item.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="admin-card">
          <div className="card-heading">
            <div>
              <h2>Integraciones</h2>
              <p>{activeCount} de {integrations.length} activas</p>
            </div>
          </div>
          <ul className="integration-list">
            {integrations.map((integration) => (
              <li key={integration.name}>
                <StateIcon state={integration.state} />
                <div>
                  <strong>{integration.name}</strong>
                  <span>{integration.status}</span>
                  <code>{integration.variable}</code>
                </div>
                <span className={`integration-state ${integration.state}`}>
                  {STATE_LABEL[integration.state]}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="admin-card wide list-card">
          <div className="card-heading">
            <div>
              <h2>Actividad administrativa reciente</h2>
              <p>
                {isSupabase
                  ? "Auditoría real en audit_log (Supabase)"
                  : "Registro local de acciones sensibles"}
              </p>
            </div>
          </div>
          {!auditLog.length ? (
            <div className="empty-inline">
              Todavía no se registraron acciones administrativas. Cuando
              alguien del equipo haga un cambio sensible, queda anotado acá.
            </div>
          ) : (
            <table className="admin-list audit-list" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" className="cell-date">Fecha</th>
                  <th role="columnheader" className="cell-admin">Administrador</th>
                  <th role="columnheader" className="cell-action">Acción</th>
                  <th role="columnheader" className="cell-detail">Detalle</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {auditLog.slice(0, 20).map((entry) => (
                  <tr role="row" key={entry.id}>
                    <td role="cell" className="cell-date">{formatDate(entry.at)}</td>
                    <td role="cell" className="cell-admin">{entry.adminEmail}</td>
                    <td role="cell" className="cell-action">{entry.action}</td>
                    <td role="cell" className="cell-detail">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
