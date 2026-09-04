"use client";

import { useStore } from "@/store/store";
import { TableScroll } from "@/components/table-scroll";
import { formatDate } from "@/lib/utils";
import { resolveRequestedProvider } from "@/services/provider";

export default function AdminSettingsPage() {
  const { auditLog } = useStore();
  const isSupabase = resolveRequestedProvider() === "supabase";
  const isShippingEnabled = process.env.NEXT_PUBLIC_SHIPPING_ENABLED === "true";
  const isPaymentEnabled =
    process.env.NEXT_PUBLIC_MERCADO_PAGO_ENABLED === "true";
  const integrations = [
    {
      name: "Base de datos",
      variable: "DATABASE_URL",
      status: isSupabase ? "Supabase conectada" : "Modo local",
      ready: isSupabase,
    },
    {
      name: "Mercado Pago",
      variable: "MP_ACCESS_TOKEN",
      status: isPaymentEnabled
        ? "Checkout Pro activo"
        : "Backend y correo postpago listos; faltan credenciales productivas y pruebas",
      ready: isPaymentEnabled,
    },
    {
      name: "Google Login",
      variable: "Supabase Auth + Google OAuth",
      status: "Activo y probado en producción",
      ready: true,
    },
    {
      name: "Captcha (Turnstile)",
      variable: "Cloudflare + Supabase",
      status: "Activo y exigido por Supabase en accesos y compra invitada",
      ready: true,
    },
    {
      name: "Emails de cuenta",
      variable: "Resend SMTP + Supabase",
      status: "Activo; plantillas en español",
      ready: true,
    },
    {
      name: "Correos de pedidos",
      variable: "Resend API + Outbox",
      status:
        "Activo para clientes; falta aprobar y validar la casilla operativa del negocio",
      ready: true,
    },
    {
      name: "WhatsApp automático",
      variable: "Proveedor oficial + plantilla",
      status:
        "Contacto manual por ahora; automatización pendiente de proveedor y aprobación",
      ready: false,
    },
    {
      name: "Google Sheets",
      variable: "GOOGLE_SHEETS_ID",
      status: "Catálogo conectado",
      ready: true,
    },
    {
      name: "Imágenes",
      variable: "STORAGE_*",
      status: "Pendiente",
      ready: false,
    },
    {
      name: "Envíopack",
      variable: "ENVIOPACK_API_KEY",
      status: isShippingEnabled
        ? "Integración automática activa"
        : "Descartado para la operación actual; integración desactivada",
      ready: isShippingEnabled,
    },
    {
      name: "Andreani",
      variable: "SHIPPING_PROVIDER",
      status: "Opción logística a evaluar con el cliente",
      ready: false,
    },
  ];

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <div>
          <span className="eyebrow orange">AJUSTES</span>
          <h1>Configuración</h1>
          <p>Estado real del circuito comercial y sus integraciones.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="admin-card operational-mode">
          <h2>Operación vigente</h2>
          <div>
            <span>Retiro</span>
            <strong>Gratis en Sáenz 1587</strong>
            <small>
              Se confirma disponibilidad antes de preparar el pedido.
            </small>
          </div>
          <div>
            <span>Envíos</span>
            <strong>
              {isShippingEnabled
                ? "Envíopack automático + respaldo manual"
                : "Respaldo manual"}
            </strong>
            <small>
              {isShippingEnabled
                ? "Cotiza OCA/Urbano; pesos incompletos o bultos fuera de límite pasan a revisión manual."
                : "Retiro gratis y cotización manual hasta elegir operador y validar su integración."}
            </small>
          </div>
          <div>
            <span>Pago</span>
            <strong>
              {isPaymentEnabled ? "Mercado Pago Checkout Pro" : "A coordinar"}
            </strong>
            <small>
              {isPaymentEnabled
                ? "El webhook firmado confirma el pago y envía el aviso al cliente; el regreso del navegador no cambia estados."
                : "Al activarlo, el webhook confirmará el cobro y avisará al cliente por email. La logística se definirá después."}
            </small>
          </div>
        </section>
        <section className="admin-card integrations">
          <h2>Integraciones</h2>
          {integrations.map((integration) => (
            <div key={integration.name}>
              <span
                className={
                  integration.ready
                    ? "integration-dot ready"
                    : "integration-dot"
                }
              />
              <strong>{integration.name}</strong>
              <code>{integration.variable}</code>
              <small>{integration.status}</small>
            </div>
          ))}
        </section>
        <section className="admin-card wide">
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
              Todavía no se registraron acciones administrativas.
            </div>
          ) : (
            <TableScroll>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Administrador</th>
                    <th>Acción</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.slice(0, 20).map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.at)}</td>
                      <td>{entry.adminEmail}</td>
                      <td>{entry.action}</td>
                      <td>{entry.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </section>
      </div>
    </main>
  );
}
