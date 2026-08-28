"use client";

import { useStore } from "@/store/store";
import { formatDate } from "@/lib/utils";
import { resolveRequestedProvider } from "@/services/provider";

export default function AdminSettingsPage() {
  const { auditLog } = useStore();
  const isSupabase = resolveRequestedProvider() === "supabase";
  const integrations = [
    { name: "Base de datos", variable: "DATABASE_URL", status: isSupabase ? "Supabase conectada" : "Modo local", ready: isSupabase },
    { name: "Mercado Pago", variable: "MP_ACCESS_TOKEN", status: "Pendiente de conversación con el cliente", ready: false },
    // El código ya usa OAuth real de Supabase; falta cargar el proveedor en
    // el dashboard (ver docs/CUENTAS_DE_CLIENTE.md §4.3).
    { name: "Google Login", variable: "Supabase → Providers → Google", status: "Código listo, falta habilitar el proveedor", ready: false },
    { name: "Captcha (Turnstile)", variable: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", status: "Código listo, falta el widget y la secret en Supabase", ready: false },
    { name: "Emails de cuenta", variable: "SMTP en Supabase", status: "Plantillas listas, falta SMTP propio", ready: false },
    { name: "Google Sheets", variable: "GOOGLE_SHEETS_ID", status: "Catálogo conectado", ready: true },
    { name: "Imágenes", variable: "STORAGE_*", status: "Pendiente", ready: false },
    { name: "Andreani", variable: "SHIPPING_API_KEY", status: "Credenciales API pendientes", ready: false },
  ];

  return <main className="admin-content"><div className="admin-heading"><div><span className="eyebrow orange">AJUSTES</span><h1>Configuración</h1><p>Estado real del circuito comercial y sus integraciones.</p></div></div><div className="settings-grid"><section className="admin-card operational-mode"><h2>Operación vigente</h2><div><span>Retiro</span><strong>Gratis en Sáenz 1587</strong><small>Se confirma disponibilidad antes de preparar el pedido.</small></div><div><span>Envíos</span><strong>Cotización manual</strong><small>El cliente deja CP, localidad y domicilio; no se promete costo ni plazo.</small></div><div><span>Pago</span><strong>A coordinar</strong><small>La solicitud web no cobra dinero. El negocio confirma el total y el medio de pago.</small></div></section><section className="admin-card integrations"><h2>Integraciones</h2>{integrations.map((integration) => <div key={integration.name}><span className={integration.ready ? "integration-dot ready" : "integration-dot"} /><strong>{integration.name}</strong><code>{integration.variable}</code><small>{integration.status}</small></div>)}</section><section className="admin-card wide"><div className="card-heading"><div><h2>Actividad administrativa reciente</h2><p>{isSupabase ? "Auditoría real en audit_log (Supabase)" : "Registro local de acciones sensibles"}</p></div></div>{!auditLog.length ? <div className="empty-inline">Todavía no se registraron acciones administrativas.</div> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Administrador</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>{auditLog.slice(0, 20).map((entry) => <tr key={entry.id}><td>{formatDate(entry.at)}</td><td>{entry.adminEmail}</td><td>{entry.action}</td><td>{entry.detail}</td></tr>)}</tbody></table></div>}</section></div></main>;
}
